import { basename, join } from 'path'
import { readFileSync } from 'fs'

import {
  ActionInput,
  ConfigArtifacts,
  DecodedAction,
  DeploymentInfo,
  Label,
  ParsedConfig,
  ParsedVariable,
  RawActionInput,
  RawCreate2ActionInput,
  RawFunctionCallActionInput,
} from '@sphinx-labs/core/dist/config/types'
import {
  isLabel,
  isRawCreate2ActionInput,
  isRawDeployContractActionInput,
  isRawFunctionCallActionInput,
  isString,
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
import {
  CREATE3_PROXY_INITCODE,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
} from '@sphinx-labs/contracts'
import ora from 'ora'

import { FoundryDryRun, ProposalOutput } from './types'
import { getConfigArtifactForContractName } from './utils'

export const decodeDeploymentInfo = (
  abiEncodedDeploymentInfo: string,
  sphinxPluginTypesABI: Array<any>
): DeploymentInfo => {
  const iface = new ethers.Interface(sphinxPluginTypesABI)
  const deploymentInfoFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'getDeploymentInfo')

  if (!deploymentInfoFragment) {
    throw new Error(
      `'getDeploymentInfo' not found in the SphinxPluginTypes ABI. Should never happen.`
    )
  }

  const deploymentInfoResult = AbiCoder.defaultAbiCoder().decode(
    deploymentInfoFragment.outputs,
    abiEncodedDeploymentInfo
  )

  const { deploymentInfo: deploymentInfoBigInt } = recursivelyConvertResult(
    deploymentInfoFragment.outputs,
    deploymentInfoResult
  ) as any

  const {
    authAddress,
    managerAddress,
    chainId,
    initialState,
    isLiveNetwork,
    newConfig,
    labels,
  } = deploymentInfoBigInt

  return {
    labels,
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

// TODO: it seems `decodeDeploymentInfo` removes BigInts, but it doesn't look like this does.
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
  sphinxPluginTypesABI: Array<any>,
  sphinxFunctionName: string,
  deploymentInfoPath: string
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

  const abiEncodedDeploymentInfo = readFileSync(deploymentInfoPath, 'utf-8')
  const deploymentInfo = decodeDeploymentInfo(
    abiEncodedDeploymentInfo,
    sphinxPluginTypesABI
  )
  const dryRun: FoundryDryRun = JSON.parse(readFileSync(dryRunPath, 'utf8'))
  const actionInputs = parseFoundryDryRun(deploymentInfo, dryRun)

  return { deploymentInfo, actionInputs }
}

export const parseFoundryDryRun = (
  deploymentInfo: DeploymentInfo,
  dryRun: FoundryDryRun
): Array<RawActionInput> => {
  const notFromSphinxManager = dryRun.transactions.filter(
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
    arguments: callArguments,
    function: functionName,
  } of dryRun.transactions) {
    const contractNameWithoutPath = contractName?.includes(':')
      ? contractName.split(':')[1]
      : contractName

    if (transaction.value !== '0x0') {
      console.error(
        `Sphinx does not support sending ETH during deployments. Let us know if you want this feature!`
      )
      process.exit(1)
    }

    if (transactionType === 'CREATE') {
      throw new Error(
        `TODO(docs): unsupported, pls use create2 or create3 instead.`
      )
    } else {
      if (!transaction.to) {
        throw new Error(`TODO(docs): should never happen.`)
      }

      const to = ethers.getAddress(transaction.to)
      if (transactionType === 'CREATE2') {
        if (to !== DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS) {
          throw new Error(
            `Detected unsupported CREATE2 factory. Please use the standard factory at: 0x4e59b44847b379578588920cA78FbF26c0B4956C`
          )
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
          additionalContracts,
          decodedAction: {
            referenceName: contractNameWithoutPath ?? create2Address,
            functionName: 'deploy',
            variables: callArguments ?? [],
            address: '',
          },
        }
        actionInputs.push(rawCreate2)
      } else if (transactionType === 'CALL') {
        const rawCall: RawFunctionCallActionInput = {
          actionType: SphinxActionType.CALL.toString(),
          skip: false,
          to,
          data: transaction.data,
          contractName,
          additionalContracts,
          decodedAction: {
            referenceName:
              contractNameWithoutPath ?? ethers.getAddress(transaction.to),
            functionName: functionName?.split('(')[0] ?? 'call',
            variables: callArguments ?? [transaction.data],
            address: contractNameWithoutPath !== null ? to : '',
          },
        }

        actionInputs.push(rawCall)
      } else {
        throw new Error(`Unknown transaction type: ${transactionType}.`)
      }
    }
  }

  return actionInputs
}

// TODO: use labeled contracts as inputs to `getConfigArtifacts` in all places.

export const makeParsedConfig = (
  deploymentInfo: DeploymentInfo,
  rawInputs: Array<RawActionInput>,
  configArtifacts: ConfigArtifacts,
  remoteExecution: boolean,
  spinner?: ora.Ora
): ParsedConfig => {
  const {
    authAddress,
    managerAddress,
    chainId,
    newConfig,
    isLiveNetwork,
    initialState,
    labels,
  } = deploymentInfo

  const coder = ethers.AbiCoder.defaultAbiCoder()
  const actionInputs: Array<ActionInput> = []
  let verify: ParsedConfig['verify'] = {}
  const unlabeled: Array<string> = []
  for (const input of rawInputs) {
    const { additionalContractsToVerify, unlabeledAdditionalContracts } =
      getAdditionalContractsToVerify(input, rawInputs, labels, configArtifacts)
    verify = {
      ...verify,
      ...additionalContractsToVerify,
    }
    unlabeled.push(...unlabeledAdditionalContracts)

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
        functionName: 'deploy',
        variables: decodedConstructorArgs,
        address: '',
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
      // Get the creation code of the CREATE2 deployment by removing the salt,
      // which is the first 32 bytes of the data.
      const initCodeWithArgs = ethers.dataSlice(input.data, 32)

      // Check if the contract is a CREATE3 proxy. If it is, we won't attempt to verify it because
      // it doesn't have its own source file in any commonly used CREATE3 library.
      if (initCodeWithArgs === CREATE3_PROXY_INITCODE) {
        continue
      } else if (input.contractName) {
        // Check if the `contractName` is a fully qualified name or a contract name.
        if (input.contractName.includes(':')) {
          // It's a fully qualified name.

          const fullyQualifiedName = input.contractName

          verify[input.create2Address] = {
            fullyQualifiedName,
            initCodeWithArgs: input.data,
          }
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
        }
      } else {
        // There's no contract name in this CREATE2 transaction.

        const label = labels.find((l) => l.addr === input.create2Address)
        if (isLabel(label)) {
          const { sourceName, contractName } =
            configArtifacts[label.fullyQualifiedName].artifact
          const fullyQualifiedName = `${sourceName}:${contractName}`
          verify[input.create2Address] = {
            fullyQualifiedName,
            initCodeWithArgs,
          }

          input.decodedAction = {
            referenceName: contractName,
            functionName: 'deploy',
            // TODO: We could probably get the constructor args from the init code with some effort since we have the FQN
            variables: {
              initCode: initCodeWithArgs,
            },
            address: '',
          }
        } else {
          // Attempt to infer the name of the contract deployed using CREATE2. We may need to do this
          // if the contract name isn't unique in the repo. This is likely a bug in Foundry.
          const contractName = rawInputs
            .filter(isRawFunctionCallActionInput)
            .filter((e) => e.to === input.create2Address)
            .map((e) => e.contractName)
            .find(isString)
          if (contractName) {
            const fullyQualifiedName = contractName.includes(':')
              ? contractName
              : getConfigArtifactForContractName(contractName, configArtifacts)
                  .fullyQualifiedName

            verify[input.create2Address] = {
              fullyQualifiedName,
              initCodeWithArgs,
            }

            input.decodedAction = {
              referenceName: fullyQualifiedName.split(':')[1],
              functionName: 'deploy',
              // TODO: We could probably get the constructor args from the init code with some effort since we have the FQN
              variables: [
                {
                  initCode: initCodeWithArgs,
                },
              ],
              address: '',
            }
          } else {
            unlabeled.push(input.create2Address)
          }
        }
      }

      actionInputs.push(input)
    } else if (isRawFunctionCallActionInput(input)) {
      actionInputs.push(input)
    } else {
      throw new Error(`Unknown action input type. Should never happen.`)
    }
  }

  if (unlabeled.length > 0) {
    spinner?.stop()
    // TODO: make this error better. it'd be nice to incorporate whether it was from a
    // create2 deployment, create3 deployment, or a nested contract deployment.
    console.error(
      `The following addresses are unlabeled:\n` + unlabeled.join(' ')
    )
    process.exit(1)
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

const getAdditionalContractsToVerify = (
  currentInput: RawActionInput,
  allInputs: Array<RawActionInput>,
  labels: Array<Label>,
  configArtifacts: ConfigArtifacts
): {
  additionalContractsToVerify: ParsedConfig['verify']
  unlabeledAdditionalContracts: Array<string>
} => {
  const verify: ParsedConfig['verify'] = {}
  const unlabeled: Array<string> = []
  for (const additionalContract of currentInput.additionalContracts) {
    const address = ethers.getAddress(additionalContract.address)

    const label = labels.find((l) => l.addr === address)
    if (isLabel(label)) {
      if (label.fullyQualifiedName !== '') {
        const { sourceName, contractName } =
          configArtifacts[label.fullyQualifiedName].artifact
        verify[address] = {
          fullyQualifiedName: `${sourceName}:${contractName}`,
          initCodeWithArgs: additionalContract.initCode,
        }
      }
    } else if (
      // Check if the current transaction is a call to deploy a contract using CREATE3. CREATE3
      // transactions are 'CALL' types where the 'data' field of the transaction is equal to the
      // contract's creation code. This transaction happens when calling the minimal CREATE3 proxy.
      isRawFunctionCallActionInput(currentInput) &&
      currentInput.data === additionalContract.initCode
    ) {
      // We'll attempt to infer the name of the contract that was deployed using CREATE3.
      const contractName = allInputs
        .filter(isRawFunctionCallActionInput)
        .filter((e) => e.to === address)
        .map((e) => e.contractName)
        .find(isString)

      if (contractName) {
        const fullyQualifiedName = contractName.includes(':')
          ? contractName
          : getConfigArtifactForContractName(contractName, configArtifacts)
              .fullyQualifiedName

        verify[address] = {
          fullyQualifiedName,
          initCodeWithArgs: additionalContract.initCode,
        }
      } else {
        unlabeled.push(address)
      }
    } else {
      unlabeled.push(address)
    }
  }

  return {
    additionalContractsToVerify: verify,
    unlabeledAdditionalContracts: unlabeled,
  }
}
