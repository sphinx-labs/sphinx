import { basename, join } from 'path'
import { existsSync, readFileSync } from 'fs'

import {
  ActionInput,
  ConfigArtifacts,
  DeploymentInfo,
  FunctionCallActionInput,
  Label,
  ParsedConfig,
  RawActionInput,
  RawCreate2ActionInput,
  RawFunctionCallActionInput,
} from '@sphinx-labs/core/dist/config/types'
import {
  isLabel,
  isRawCreate2ActionInput,
  isRawFunctionCallActionInput,
  isString,
  recursivelyConvertResult,
} from '@sphinx-labs/core/dist/utils'
import { AbiCoder, Fragment, Interface, ethers } from 'ethers'
import {
  ParsedContractDeployments,
  SphinxActionType,
  networkEnumToName,
} from '@sphinx-labs/core'
import {
  CREATE3_PROXY_INITCODE,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  Operation,
  getManagedServiceAddress,
} from '@sphinx-labs/contracts'

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
    safeAddress,
    moduleAddress,
    nonce,
    chainId,
    initialState,
    isLiveNetwork,
    newConfig,
    labels,
  } = deploymentInfoBigInt

  return {
    labels,
    safeAddress,
    moduleAddress,
    nonce,
    chainId: chainId.toString(),
    initialState: {
      ...initialState,
    },
    isLiveNetwork,
    newConfig: {
      ...newConfig,
      testnets: newConfig.testnets.map(networkEnumToName),
      mainnets: newConfig.mainnets.map(networkEnumToName),
      threshold: newConfig.threshold.toString(),
    },
  }
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

export const readActionInputsOnSingleChain = (
  deploymentInfo: DeploymentInfo,
  scriptPath: string,
  broadcastFolder: string,
  sphinxFunctionName: string
): Array<RawActionInput> => {
  // The location for a single chain dry run is in the format:
  // <broadcastFolder>/<scriptFileName>/<chainId>/dry-run/<functionName>-latest.json
  // If the script is in a subdirectory (e.g. script/my/path/MyScript.s.sol), Foundry still only
  // uses only the script's file name, not its entire path.
  const dryRunPath = join(
    broadcastFolder,
    basename(scriptPath),
    deploymentInfo.chainId,
    'dry-run',
    `${sphinxFunctionName}-latest.json`
  )

  if (!existsSync(dryRunPath)) {
    return []
  }

  const dryRun: FoundryDryRun = JSON.parse(readFileSync(dryRunPath, 'utf8'))
  const actionInputs = parseFoundryDryRun(deploymentInfo, dryRun, dryRunPath)

  return actionInputs
}

export const parseFoundryDryRun = (
  deploymentInfo: DeploymentInfo,
  dryRun: FoundryDryRun,
  dryRunPath: string
): Array<RawActionInput> => {
  const notFromSphinxManager = dryRun.transactions
    .map((t) => t.transaction.from)
    .filter(isString)
    .filter(
      (from) =>
        // Convert the 'from' field to a checksum address.
        ethers.getAddress(from) !== deploymentInfo.safeAddress
    )
  if (notFromSphinxManager.length > 0) {
    // The user must broadcast/prank from the SphinxManager so that the msg.sender for function
    // calls is the same as it would be in a production deployment.
    throw new Error(
      `Sphinx: Detected transaction(s) in the deployment that weren't sent by the Safe.\n` +
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

    if (transaction.value !== undefined && transaction.value !== '0x0') {
      console.error(
        `Sphinx does not support sending ETH during deployments. Let us know if you want this feature!`
      )
      process.exit(1)
    }

    if (transactionType === 'CREATE') {
      console.error(
        `Sphinx does not support the 'CREATE' opcode, i.e. 'new MyContract(...)'. Please use CREATE2 or CREATE3 instead.`
      )
      process.exit(1)
    } else {
      if (!transaction.to) {
        throw new Error(
          `Transaction does not have the 'to' field. Should never happen.`
        )
      }

      const to = ethers.getAddress(transaction.to)
      if (transactionType === 'CREATE2') {
        if (to !== DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS) {
          console.error(
            `Detected unsupported CREATE2 factory. Please use the standard factory at: 0x4e59b44847b379578588920cA78FbF26c0B4956C`
          )
          process.exit(1)
        }

        if (!transaction.data || !transaction.gas) {
          throw new Error(
            `CREATE2 transaction is missing field(s). Should never happen.`
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
          value: transaction.value ?? '0x0',
          operation: Operation.Call,
          txData: transaction.data,
          actionType: SphinxActionType.CALL.toString(),
          gas: transaction.gas,
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
        if (!transaction.data || !transaction.gas) {
          throw new Error(
            `CALL transaction is missing field(s). Should never happen.`
          )
        }

        const variables = callArguments ?? [
          transaction.data.length > 1000
            ? `Very large calldata. View it in Foundry's dry run file: ${dryRunPath}`
            : transaction.data,
        ]

        const rawCall: RawFunctionCallActionInput = {
          actionType: SphinxActionType.CALL.toString(),
          to,
          value: transaction.value ?? '0x0',
          txData: transaction.data,
          operation: Operation.Call,
          gas: transaction.gas,
          contractName,
          additionalContracts,
          decodedAction: {
            referenceName:
              contractNameWithoutPath ?? ethers.getAddress(transaction.to),
            functionName: functionName?.split('(')[0] ?? 'call',
            variables,
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

export const makeParsedConfig = (
  deploymentInfo: DeploymentInfo,
  rawInputs: Array<RawActionInput>,
  configArtifacts: ConfigArtifacts,
  remoteExecution: boolean
): ParsedConfig => {
  const {
    safeAddress,
    moduleAddress,
    nonce,
    chainId,
    newConfig,
    isLiveNetwork,
    initialState,
    labels,
  } = deploymentInfo

  const actionInputs: Array<ActionInput> = []
  const unlabeledAddresses: Array<string> = []
  for (const input of rawInputs) {
    const { parsedContracts, unlabeledAdditionalContracts } =
      parseAdditionalContracts(input, rawInputs, labels, configArtifacts)
    unlabeledAddresses.push(...unlabeledAdditionalContracts)

    if (isRawCreate2ActionInput(input)) {
      // Get the creation code of the CREATE2 deployment by removing the salt,
      // which is the first 32 bytes of the data.
      const initCodeWithArgs = ethers.dataSlice(input.txData, 32)

      // Check if the contract is a CREATE3 proxy. If it is, we won't attempt to verify it because
      // it doesn't have its own source file in any commonly used CREATE3 library.
      if (initCodeWithArgs !== CREATE3_PROXY_INITCODE) {
        // Check if the `contractName` is a fully qualified name.
        if (input.contractName && input.contractName.includes(':')) {
          // It's a fully qualified name.

          const fullyQualifiedName = input.contractName

          parsedContracts[input.create2Address] = {
            fullyQualifiedName,
            initCodeWithArgs,
          }
        } else if (
          // Check if the `contractName` is a standard contract name (not a fully qualified name).
          input.contractName
        ) {
          const { fullyQualifiedName } = getConfigArtifactForContractName(
            input.contractName,
            configArtifacts
          )

          parsedContracts[input.create2Address] = {
            fullyQualifiedName,
            initCodeWithArgs,
          }
        } else {
          // There's no contract name in this CREATE2 transaction.
          const label = labels.find((l) => l.addr === input.create2Address)
          if (isLabel(label)) {
            parsedContracts[input.create2Address] = {
              fullyQualifiedName: label.fullyQualifiedName,
              initCodeWithArgs,
            }

            const contractName = label.fullyQualifiedName.split(':')[1]
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
                : getConfigArtifactForContractName(
                    contractName,
                    configArtifacts
                  ).fullyQualifiedName

              parsedContracts[input.create2Address] = {
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
              unlabeledAddresses.push(input.create2Address)
            }
          }
        }
      }

      actionInputs.push({
        contracts: parsedContracts,
        ...input,
      })
    } else if (isRawFunctionCallActionInput(input)) {
      const callInput: FunctionCallActionInput = {
        contracts: parsedContracts,
        ...input,
      }

      actionInputs.push(callInput)
    } else {
      throw new Error(`Unknown action input type. Should never happen.`)
    }
  }

  return {
    safeAddress,
    moduleAddress,
    nonce,
    chainId,
    newConfig,
    isLiveNetwork,
    initialState,
    actionInputs,
    remoteExecution,
    unlabeledAddresses,
    executorAddress: getManagedServiceAddress(BigInt(chainId)),
  }
}

const parseAdditionalContracts = (
  currentInput: RawActionInput,
  allInputs: Array<RawActionInput>,
  labels: Array<Label>,
  configArtifacts: ConfigArtifacts
): {
  parsedContracts: ParsedContractDeployments
  unlabeledAdditionalContracts: Array<string>
} => {
  const parsed: ParsedContractDeployments = {}
  const unlabeled: Array<string> = []
  for (const additionalContract of currentInput.additionalContracts) {
    const address = ethers.getAddress(additionalContract.address)

    const label = labels.find((l) => l.addr === address)
    if (isLabel(label)) {
      if (label.fullyQualifiedName !== '') {
        parsed[address] = {
          fullyQualifiedName: label.fullyQualifiedName,
          initCodeWithArgs: additionalContract.initCode,
        }
      }
    } else if (
      // Check if the current transaction is a call to deploy a contract using CREATE3. CREATE3
      // transactions are 'CALL' types where the 'data' field of the transaction is equal to the
      // contract's creation code. This transaction happens when calling the minimal CREATE3 proxy.
      isRawFunctionCallActionInput(currentInput) &&
      currentInput.txData === additionalContract.initCode
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

        parsed[address] = {
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
    parsedContracts: parsed,
    unlabeledAdditionalContracts: unlabeled,
  }
}
