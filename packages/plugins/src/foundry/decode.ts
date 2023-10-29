import { basename, join } from 'path'
import { readFileSync } from 'fs'

import {
  ActionInput,
  ConfigArtifacts,
  DecodedAction,
  DecodedFunctionCallActionInput,
  DeploymentInfo,
  ParsedConfig,
  ParsedVariable,
  RawActionInput,
  RawCreate2ActionInput,
  RawDeployContractActionInput,
  RawFunctionCallActionInput,
} from '@sphinx-labs/core/dist/config/types'
import {
  isRawCreate2ActionInput,
  isRawCreateActionInput,
  isRawDeployContractActionInput,
  isRawFunctionCallActionInput,
  recursivelyConvertResult,
} from '@sphinx-labs/core/dist/utils'
import {
  AbiCoder,
  ConstructorFragment,
  Fragment,
  Interface,
  ethers,
} from 'ethers'
import {
  SUPPORTED_NETWORKS,
  SphinxActionType,
  getCreate3Address,
  getCreate3Salt,
  networkEnumToName,
} from '@sphinx-labs/core'
import { DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS } from '@sphinx-labs/contracts'

import { FoundryDryRun, ProposalOutput } from './types'
import { getConfigArtifactForContractName } from './utils'

export const decodeDeploymentInfo = (
  calldata: string,
  sphinxCollectorABI: Array<any>
): DeploymentInfo => {
  const iface = new Interface(sphinxCollectorABI)
  const deploymentInfoFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'collectDeploymentInfo')

  if (!deploymentInfoFragment) {
    throw new Error(
      `'collectDeploymentInfo' not found in ABI. Should never happen.`
    )
  }

  const abiEncodedDeploymentInfo = ethers.dataSlice(calldata, 4)

  const coder = AbiCoder.defaultAbiCoder()

  const deploymentInfoResult = coder.decode(
    deploymentInfoFragment.inputs,
    abiEncodedDeploymentInfo
  )

  const [deploymentInfoBigInt] = recursivelyConvertResult(
    deploymentInfoFragment.inputs,
    deploymentInfoResult
  ) as any

  const {
    authAddress,
    managerAddress,
    chainId,
    initialState,
    isLiveNetwork,
    newConfig,
  } = deploymentInfoBigInt

  return {
    authAddress,
    managerAddress,
    chainId: chainId.toString(),
    initialState: {
      ...initialState,
      version: {
        major: initialState.version.major.toString(),
        minor: initialState.version.minor.toString(),
        patch: initialState.version.patch.toString(),
      },
    },
    isLiveNetwork,
    newConfig: {
      ...newConfig,
      testnets: newConfig.testnets.map(networkEnumToName),
      mainnets: newConfig.mainnets.map(networkEnumToName),
      threshold: newConfig.threshold.toString(),
      version: {
        major: newConfig.version.major.toString(),
        minor: newConfig.version.minor.toString(),
        patch: newConfig.version.patch.toString(),
      },
    },
  }
}

export const decodeDeploymentInfoArray = (
  abiEncodedDeploymentInfoArray: string,
  abi: Array<any>
): Array<DeploymentInfo> => {
  const iface = new Interface(abi)
  const deploymentInfoFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'getDeploymentInfoArray')

  if (!deploymentInfoFragment) {
    throw new Error(
      `'getDeploymentInfoArray' not found in ABI. Should never happen.`
    )
  }

  const deploymentInfoResultArray = AbiCoder.defaultAbiCoder().decode(
    deploymentInfoFragment.outputs,
    abiEncodedDeploymentInfoArray
  )

  const { deploymentInfoArray } = recursivelyConvertResult(
    deploymentInfoFragment.outputs,
    deploymentInfoResultArray
  ) as any

  return deploymentInfoArray as Array<DeploymentInfo>
}

export const decodeProposalOutput = (
  abiEncodedProposalOutput: string,
  abi: Array<any>
): ProposalOutput => {
  const iface = new Interface(abi)
  const proposalOutputFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'proposalOutput')

  if (!proposalOutputFragment) {
    throw new Error(`'proposalOutput' not found in ABI. Should never happen.`)
  }

  const coder = AbiCoder.defaultAbiCoder()

  const proposalOutputResult = coder.decode(
    proposalOutputFragment.outputs,
    abiEncodedProposalOutput
  )

  const { output } = recursivelyConvertResult(
    proposalOutputFragment.outputs,
    proposalOutputResult
  ) as any

  for (const bundleInfo of output.bundleInfoArray) {
    bundleInfo.compilerConfig = JSON.parse(bundleInfo.compilerConfigStr)
    delete bundleInfo.compilerConfigStr
  }

  return output as ProposalOutput
}

export const getCollectedSingleChainDeployment = (
  networkName: string,
  scriptPath: string,
  broadcastFolder: string,
  sphinxCollectorABI: Array<any>,
  sphinxFunctionName: string
): {
  deploymentInfo: DeploymentInfo
  actionInputs: Array<RawActionInput>
} => {
  const chainId = SUPPORTED_NETWORKS[networkName]

  // The location for a single chain dry run is in the format:
  // <broadcastFolder>/<scriptFileName>/<chainId>/dry-run/<functionName>-latest.json
  // If the script is in a subdirectory (e.g. script/my/path/MyScript.s.sol), Foundry still only
  // uses only the script's file name, not its entire path.
  const dryRunPath = join(
    broadcastFolder,
    basename(scriptPath),
    chainId.toString(),
    'dry-run',
    `${sphinxFunctionName}-latest.json`
  )

  const dryRun: FoundryDryRun = JSON.parse(readFileSync(dryRunPath, 'utf8'))
  return parseFoundryDryRun(dryRun, sphinxCollectorABI)
}

export const parseFoundryDryRun = (
  dryRun: FoundryDryRun,
  sphinxCollectorABI: Array<any>
): {
  deploymentInfo: DeploymentInfo
  actionInputs: Array<RawActionInput>
} => {
  const deploymentInfo = decodeDeploymentInfo(
    dryRun.transactions[0].transaction.data,
    sphinxCollectorABI
  )
  const transactions = dryRun.transactions.slice(1)

  const notFromSphinxManager = transactions.filter(
    (t) =>
      // Convert the 'from' field to a checksum address.
      ethers.getAddress(t.transaction.from) !== deploymentInfo.managerAddress
  )
  if (notFromSphinxManager.length > 0) {
    // The user must broadcast/prank from the SphinxManager so that the msg.sender for function
    // calls is the same as it would be in a production deployment.
    throw new Error(
      `Sphinx: Detected transaction(s) in the deployment that weren't sent by the SphinxManager.\n` +
        `Your 'run()' function must have the 'sphinx' modifier and cannot contain any pranks or broadcasts.\n`
    )
  }

  const actionInputs: Array<RawActionInput> = []
  for (const {
    transaction,
    contractName,
    transactionType,
    additionalContracts,
  } of transactions) {
    if (transaction.value !== '0x0') {
      console.error(
        `Sphinx does not support sending ETH during deployments. Let us know if you want this feature!`
      )
      process.exit(1)
    }

    if (transactionType === 'CREATE') {
      actionInputs.push({
        contractName,
        gas: BigInt(transaction.gas),
        actionType: SphinxActionType.CREATE.toString(),
        skip: false,
        data: transaction.data,
      })
    } else {
      if (!transaction.to) {
        throw new Error(`TODO(docs): should never happen.`)
      }

      const to = ethers.getAddress(transaction.to)
      if (transactionType === 'CREATE2') {
        if (to !== DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS) {
          throw new Error(`TODO: unsupported`)
        }

        const salt = ethers.dataSlice(transaction.data, 0, 32)
        const initCodeWithArgs = ethers.dataSlice(transaction.data, 32)
        const create2Address = ethers.getCreate2Address(
          to,
          salt,
          ethers.keccak256(initCodeWithArgs)
        )

        const rawCreate2: RawCreate2ActionInput = {
          to,
          create2Address,
          contractName,
          skip: false,
          data: transaction.data,
          actionType: SphinxActionType.CALL.toString(),
          gas: BigInt(transaction.gas),
        }
        actionInputs.push(rawCreate2)
      } else if (to === deploymentInfo.managerAddress) {
        actionInputs.push(
          decodeDeployContractActionInput(transaction.data, sphinxCollectorABI)
        )
      } else if (transactionType === 'CALL') {
        const rawCall: RawFunctionCallActionInput = {
          actionType: SphinxActionType.CALL.toString(),
          skip: false,
          to: ethers.getAddress(transaction.to),
          data: transaction.data,
          contractName,
          additionalContracts,
        }

        actionInputs.push(rawCall)
      } else {
        throw new Error(`Unknown transaction type: ${transactionType}.`)
      }
    }
  }

  return { deploymentInfo, actionInputs }
}

export const decodeDeployContractActionInput = (
  calldata: string,
  sphinxCollectorABI: Array<any>
): RawDeployContractActionInput => {
  const iface = new Interface(sphinxCollectorABI)
  const deployFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'deploy')

  if (!deployFragment) {
    throw new Error(`'deploy' function not found in ABI. Should never happen.`)
  }

  const abiEncodedAction = ethers.dataSlice(calldata, 4)

  const coder = AbiCoder.defaultAbiCoder()

  const actionResult = coder.decode(deployFragment.inputs, abiEncodedAction)

  const action = recursivelyConvertResult(
    deployFragment.inputs,
    actionResult
  ) as any

  return {
    ...action,
    skip: false,
    actionType: SphinxActionType.DEPLOY_CONTRACT.toString(),
  }
}

// TODO(end): Sometimes, the 'contractName' in the Foundry artifact is null for a contract
// deployment, which means we can't get its fully qualified name. This can happen for CREATE or
// CREATE2. There are two reasons this can happen:
// 1. The user is deploying bytecode which belongs to a contract that doesn't exist in their repo.
//    This probably also applies to contracts that only exist in a dependency, but I haven't checked
//    that.
// 2. The user is deploying a contract whose name isn't unique in their repo.

export const makeParsedConfig = (
  deploymentInfo: DeploymentInfo,
  rawInputs: Array<RawActionInput>,
  configArtifacts: ConfigArtifacts,
  remoteExecution: boolean
): ParsedConfig => {
  const {
    authAddress,
    managerAddress,
    chainId,
    newConfig,
    isLiveNetwork,
    initialState,
  } = deploymentInfo

  const coder = ethers.AbiCoder.defaultAbiCoder()
  const actionInputs: Array<ActionInput> = []
  const verify: ParsedConfig['verify'] = {}
  for (const input of rawInputs) {
    if (isRawDeployContractActionInput(input)) {
      const create3Salt = getCreate3Salt(input.referenceName, input.userSalt)
      const create3Address = getCreate3Address(managerAddress, create3Salt)

      const { abi } = configArtifacts[input.fullyQualifiedName].artifact
      const iface = new ethers.Interface(abi)
      const constructorFragment = iface.fragments.find(
        ConstructorFragment.isFragment
      )
      let decodedConstructorArgs: ParsedVariable
      if (constructorFragment) {
        const decodedResult = coder.decode(
          constructorFragment.inputs,
          input.constructorArgs
        )
        // Convert from an Ethers `Result` into a plain object.
        decodedConstructorArgs = recursivelyConvertResult(
          constructorFragment.inputs,
          decodedResult
        ) as ParsedVariable
      } else {
        decodedConstructorArgs = {}
      }

      const decodedAction: DecodedAction = {
        referenceName: input.referenceName,
        functionName: 'constructor',
        variables: decodedConstructorArgs,
      }
      verify[create3Address] = {
        fullyQualifiedName: input.fullyQualifiedName,
        initCodeWithArgs: ethers.concat([
          input.initCode,
          input.constructorArgs,
        ]),
      }
      actionInputs.push({ create3Address, decodedAction, ...input })
    } else if (isRawCreate2ActionInput(input)) {
      if (input.contractName) {
        // Check if the `contractName` is a fully qualified name or a contract name.
        if (input.contractName.includes(':')) {
          // It's a fully qualified name.

          const fullyQualifiedName = input.contractName
          const contractName = fullyQualifiedName.split(':')[1]

          verify[input.create2Address] = {
            fullyQualifiedName,
            initCodeWithArgs: input.data,
          }
          actionInputs.push({
            fullyQualifiedName: input.contractName,
            decodedAction: {
              referenceName: contractName,
              functionName: 'deploy',
              variables: 'TODO',
            },
            create2Address: input.create2Address,
            skip: input.skip,
            data: input.data,
            to: input.to,
            actionType: input.actionType,
            gas: input.gas,
          })
        } else {
          // It's a contract name.

          const { fullyQualifiedName } = getConfigArtifactForContractName(
            input.contractName,
            configArtifacts
          )

          verify[input.create2Address] = {
            fullyQualifiedName,
            initCodeWithArgs: input.data,
          }
          actionInputs.push({
            fullyQualifiedName,
            decodedAction: {
              referenceName: input.contractName,
              functionName: 'deploy',
              variables: 'TODO',
            },
            create2Address: input.create2Address,
            skip: input.skip,
            data: input.data,
            to: input.to,
            actionType: input.actionType,
            gas: input.gas,
          })
        }
      } else {
        // There's no contract name associated with this CREATE2 action, so
        // we use the raw action.
        actionInputs.push(input)
      }
    } else if (isRawCreateActionInput(input)) {
      throw new Error(
        `TODO(docs): unsupported, pls use create2 or create3 instead.`
      )
    } else if (isRawFunctionCallActionInput(input)) {
      actionInputs.push(input)

      // TODO
      // if (input.additionalContracts.length > 0) {
      //   const create3 = input.additionalContracts.find(
      //     (e) => e.initCode === input.data
      //   )
      //   if (create3) {
      //     verify[create3.address] = {
      //       fullyQualifiedName,
      //       initCodeWithArgs: create3.initCode,
      //     }
      //   }
      // }

      // Some context for the following if-statement: If a contract name is not unique in the repo and it's
      // deployed via CREATE2, Foundry will make its 'contractName' null in the corresponding
      // transaction. This is likely a bug in Foundry. This limitation prevents us from recovering
      // the contract's fully qualified name, which means we won't be able to verify it on
      // Etherscan. However, if a function is called on such a contract, its fully qualified name
      // will appear in the function call's transaction. This allows us to recover the fully
      // qualified name of the contract. The following code covers this scenario.
      if (
        typeof input.contractName === 'string' &&
        input.contractName.includes(':')
      ) {
        const fullyQualifiedName = input.contractName
        const create2Input = rawInputs
          .filter(isRawCreate2ActionInput)
          .find((a) => a.create2Address === input.to)

        // This could happen if the function call corresponds to a CREATE action instead of a
        // CREATE2 action, but we don't currently support CREATE.
        if (!create2Input) {
          throw new Error(`TODO: should never happen.`)
        }

        // Get the creation code of the CREATE2 deployment by removing the salt,
        // which is the first 32 bytes of the data.
        const initCodeWithArgs = ethers.dataSlice(create2Input.to, 32)

        verify[input.to] = {
          fullyQualifiedName,
          initCodeWithArgs,
        }
      }

      // TODO: remove this if you remove preview.
      // const targetContractActionInput = rawInputs
      //   .filter(isRawDeployContractActionInput)
      //   .find(
      //     (a) =>
      //       input.to ===
      //       getCreate3Address(
      //         managerAddress,
      //         getCreate3Salt(a.referenceName, a.userSalt)
      //       )
      //   )

      // if (targetContractActionInput) {
      //   const { fullyQualifiedName, referenceName } = targetContractActionInput
      //   const { abi } = configArtifacts[fullyQualifiedName].artifact
      //   const iface = new ethers.Interface(abi)

      //   const selector = ethers.dataSlice(input.data, 0, 4)
      //   const functionParamsResult = iface.decodeFunctionData(
      //     selector,
      //     input.data
      //   )
      //   const functionFragment = iface.getFunction(selector)
      //   if (!functionFragment) {
      //     throw new Error(
      //       `Could not find function fragment for selector: ${selector}. Should never happen.`
      //     )
      //   }

      //   // Convert the Ethers `Result` into a plain object.
      //   const decodedFunctionParams = recursivelyConvertResult(
      //     functionFragment.inputs,
      //     functionParamsResult
      //   ) as ParsedVariable

      //   const functionName = iface.getFunctionName(selector)

      //   const decodedAction: DecodedAction = {
      //     referenceName,
      //     functionName,
      //     variables: decodedFunctionParams,
      //   }
      //   const decodedCall: DecodedFunctionCallActionInput = {
      //     decodedAction,
      //     fullyQualifiedName,
      //     referenceName,
      //     ...input,
      //   }
      //   actionInputs.push(decodedCall)
      // } else {
      //   actionInputs.push(input)
      // }
    } else {
      throw new Error(`Unknown action input type. Should never happen.`)
    }
  }

  return {
    verify,
    authAddress,
    managerAddress,
    chainId,
    newConfig,
    isLiveNetwork,
    initialState,
    actionInputs,
    remoteExecution,
  }
}
