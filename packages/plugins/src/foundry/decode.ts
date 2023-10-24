import { basename, join } from 'path'
import { readFileSync } from 'fs'

import {
  ConfigArtifacts,
  DeployContractActionInput,
  DeploymentInfo,
  FunctionCallActionInput,
  ParsedConfig,
  SolidityDeployContractActionInput,
} from '@sphinx-labs/core/dist/config/types'
import { recursivelyConvertResult } from '@sphinx-labs/core/dist/utils'
import { AbiCoder, Fragment, Interface } from 'ethers'

import { ProposalOutput } from './types'

export const decodeDeploymentInfo = (
  abiEncodedDeploymentInfo: string,
  abi: Array<any>
): DeploymentInfo => {
  const iface = new Interface(abi)
  const deploymentInfoFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'getDeploymentInfo')

  if (!deploymentInfoFragment) {
    throw new Error(
      `'getDeploymentInfo' not found in ABI. Should never happen.`
    )
  }

  const coder = AbiCoder.defaultAbiCoder()

  const deploymentInfoResult = coder.decode(
    deploymentInfoFragment.outputs,
    abiEncodedDeploymentInfo
  )

  const { deploymentInfo } = recursivelyConvertResult(
    deploymentInfoFragment.outputs,
    deploymentInfoResult
  ) as any

  return deploymentInfo as DeploymentInfo
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

export const makeParsedConfig = (
  deploymentInfo: DeploymentInfo,
  configArtifacts: ConfigArtifacts,
  broadcastFolder: string,
  scriptPath: string
): ParsedConfig => {
  const {
    authAddress,
    managerAddress,
    chainId,
    deployments,
    newConfig,
    isLiveNetwork: isLiveNetwork_,
    initialState,
    remoteExecution,
  } = deploymentInfo

  // TODO: uncomment
  return {} as any
  // // Decode the raw actions.
  // const actions = actionInputs.map(fromRawSphinxActionInput)

  // const extendedActions: Array<
  //   ExtendedDeployContractActionInput | ExtendedFunctionCallActionInput
  // > = []
  // for (const action of actions) {
  //   const { referenceName, fullyQualifiedName } = action
  //   const { abi } = configArtifacts[fullyQualifiedName].artifact
  //   const iface = new ethers.Interface(abi)
  //   const coder = ethers.AbiCoder.defaultAbiCoder()

  //   if (isDeployContractActionInput(action)) {
  //     const create3Salt = getCreate3Salt(referenceName, action.userSalt)
  //     const create3Address = getCreate3Address(managerAddress, create3Salt)

  //     const constructorFragment = iface.fragments.find(
  //       ConstructorFragment.isFragment
  //     )
  //     let decodedConstructorArgs: ParsedVariable
  //     if (constructorFragment) {
  //       const decodedResult = coder.decode(
  //         constructorFragment.inputs,
  //         action.constructorArgs
  //       )
  //       // Convert from an Ethers `Result` into a plain object.
  //       decodedConstructorArgs = recursivelyConvertResult(
  //         constructorFragment.inputs,
  //         decodedResult
  //       ) as ParsedVariable
  //     } else {
  //       decodedConstructorArgs = {}
  //     }

  //     const decodedAction: DecodedAction = {
  //       referenceName,
  //       functionName: 'constructor',
  //       variables: decodedConstructorArgs,
  //     }
  //     extendedActions.push({ create3Address, decodedAction, ...action })
  //   } else {
  //     const functionParamsResult = iface.decodeFunctionData(
  //       action.selector,
  //       ethers.concat([action.selector, action.functionParams])
  //     )
  //     const functionFragment = iface.getFunction(action.selector)
  //     if (!functionFragment) {
  //       throw new Error(
  //         `Could not find function fragment for selector: ${action.selector}. Should never happen.`
  //       )
  //     }

  //     // Convert the Ethers `Result` into a plain object.
  //     const decodedFunctionParams = recursivelyConvertResult(
  //       functionFragment.inputs,
  //       functionParamsResult
  //     ) as ParsedVariable

  //     const functionName = iface.getFunctionName(action.selector)

  //     const decodedAction: DecodedAction = {
  //       referenceName,
  //       functionName,
  //       variables: decodedFunctionParams,
  //     }
  //     extendedActions.push({ decodedAction, ...action })
  //   }
  // }

  // const parsedSphinxConfig: SphinxConfig<SupportedNetworkName> = {
  //   ...newConfig,
  //   testnets: newConfig.testnets.map(networkEnumToName),
  //   mainnets: newConfig.mainnets.map(networkEnumToName),
  // }

  // return {
  //   authAddress,
  //   managerAddress,
  //   chainId: chainId.toString(),
  //   newConfig: parsedSphinxConfig,
  //   isLiveNetwork: isLiveNetwork_,
  //   initialState,
  //   actionInputs: extendedActions,
  //   remoteExecution,
  // }
}

// TODO(test): add a view function and a state-changing function to your tests

// export const getActionInputs = (
//   broadcastFolder: string,
//   scriptPath: string,
//   deploymentInfo: DeploymentInfo
// ): Array<DeployContractActionInput | FunctionCallActionInput> => {
//   // TODO(docs): location: e.g. hello_foundry/broadcast/Counter.s.sol/31337/dry-run/run-latest.json
//   // TODO(docs): Foundry uses only the script's file name when writing the dry run to the
//   // filesystem, even if the script is in a subdirectory (e.g. script/my/path/MyScript.s.sol).
//   const dryRunPath = join(
//     broadcastFolder,
//     basename(scriptPath),
//     deploymentInfo.chainId.toString(),
//     'dry-run',
//     `sphinxDeployTask-latest.json`
//   )

//   const dryRunJson = JSON.parse(readFileSync(dryRunPath, 'utf8'))
//   const transactions: Array<AnvilBroadcastedTxn> = dryRunJson.transactions

//   const notFromSphinxManager = transactions.filter(
//     (t) => t.transaction.from !== deploymentInfo.managerAddress
//   )
//   if (notFromSphinxManager.length > 0) {
//     // TODO(docs): the user must broadcast from the sphinx manager's address so that the msg.sender
//     // for function calls is the same as it would be in a production deployment.
//     throw new Error(`TODO`)
//   }
// }

// TODO: mv
// TODO(docs): this doesn't include the "contractAddress", which is a field in the actual
// foundry broadcast file. we don't include it here because it can be `null` for low-level calls, so
// we prefer to always use the 'transactions.to' field instead.
type AnvilBroadcastedTxn = {
  hash: string | null
  transactionType: 'CREATE' | 'CALL'
  contractName: string | null // TODO(docs): if string, it'll be contractName if it's unique in repo, otherwise FQN
  function: string | null // TODO(docs): e.g. "myFunction(uint256)"
  arguments: Array<any> | null
  transaction: {
    type: string
    from: string
    gas: string
    value: string
    data: string
    nonce: string
    accessList: string
    // Defined if `transactionType` is 'CALL'. Undefined if `transactionType` is 'CREATE'.
    to?: string
  }
  additionalContracts: Array<any>
  isFixedGasLimit: boolean
}
