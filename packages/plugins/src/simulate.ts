import {
  GasSpenderABI,
  SphinxSimulatorABI,
  getSphinxSimulatorAddress,
  makeSphinxMerkleTree,
  remove0x,
} from '@sphinx-labs/contracts'
import { ethers } from 'ethers'
import {
  getApproveLeafWithProof,
  getBytesLength,
  getExecuteLeavesWithProofs,
  getGenericErrorString,
  isGenericErrorString,
  NetworkConfig,
  SphinxJsonRpcProvider,
  makeDeploymentData,
  getSphinxWalletsSortedByAddress,
  getPackedOwnerSignatures,
  toJsonRpcHexValue,
} from '@sphinx-labs/core'

import { getEstimatedGas } from './foundry/utils'

// TODO(end): tell ryan to use this check before calling into `simulateExecution`.
export const canSimulateExecution = async (
  networkConfig: NetworkConfig,
  provider: SphinxJsonRpcProvider
): Promise<boolean> => {
  const chainId = BigInt(networkConfig.chainId)

  const calldata = await getSimulationCalldata(networkConfig, provider)
  const calldataLength = getBytesLength(calldata)
  try {
    await provider.send('eth_call', [
      {
        to: ethers.ZeroAddress,
        data: '0x' + '11'.repeat(Number(calldataLength)),
      },
      'latest',
    ])
  } catch {
    return false
  }

  const deploymentData = makeDeploymentData([networkConfig])

  const merkleTree = makeSphinxMerkleTree(deploymentData)
  const executeLeaves = getExecuteLeavesWithProofs(merkleTree, chainId)
  const approveLeaf = getApproveLeafWithProof(merkleTree, BigInt(chainId))
  const { estimatedGas } = await getEstimatedGas(
    merkleTree.root,
    approveLeaf,
    [executeLeaves],
    networkConfig,
    provider
  )

  // Although the estimated gas includes a buffer, we multiply by an additional buffer because there
  // are additional costs associated with the call to the `SphinxSimulator`. For example, we add and
  // remove auto-generated owner wallets in the simulation, which isn't reflected in the estimated gas.
  const estimatedGasWithBuffer =
    (BigInt(estimatedGas) * BigInt(11)) / BigInt(10)

  const gasSpenderInterface = new ethers.Interface(GasSpenderABI)
  const initCodeWithArgs = gasSpenderInterface.encodeDeploy([
    estimatedGasWithBuffer,
  ])

  try {
    await provider.send('eth_call', [
      {
        data: initCodeWithArgs,
      },
      'latest',
    ])
  } catch {
    return false
  }

  return true
}

export const simulateExecution = async (
  networkConfig: NetworkConfig,
  provider: SphinxJsonRpcProvider
): Promise<void> => {
  const { safeFundingRequest } = networkConfig
  const abiCoder = ethers.AbiCoder.defaultAbiCoder()
  const simulatorInterface = new ethers.Interface(SphinxSimulatorABI)
  const sphinxSimulatorAddress = getSphinxSimulatorAddress()
  const simulationCalldata = await getSimulationCalldata(
    networkConfig,
    provider
  )

  const fundsRequested = safeFundingRequest?.fundsRequested
    ? toJsonRpcHexValue(safeFundingRequest?.fundsRequested)
    : undefined

  const rawReturnData = await provider.send('eth_call', [
    {
      to: sphinxSimulatorAddress,
      data: simulationCalldata,
      value: fundsRequested,
    },
    'latest',
  ])

  const returnData = simulatorInterface.decodeFunctionResult(
    'simulate',
    rawReturnData
  )[0]
  const [success] = abiCoder.decode(['bool'], returnData)

  if (success) {
    return
  }

  const response = ethers.dataSlice(returnData, 128)

  if (remove0x(response).length === 0) {
    // e.g. `require(false)` with no reason string.
    throw new Error(`TODO(docs): reverted without a reason string`)
  } else if (isGenericErrorString(response)) {
    const errorMessage = getGenericErrorString(response)
    throw new Error(`TODO(docs): reverted with:\n` + errorMessage)
  } else {
    // TODO(docs): e.g. panic from assert(false) or a custom error

    throw new Error(`TODO(docs): ${response}`)
  }
}

const getSimulationCalldata = async (
  networkConfig: NetworkConfig,
  provider: SphinxJsonRpcProvider
): Promise<string> => {
  const { safeAddress, moduleAddress, newConfig, chainId, safeInitData } =
    networkConfig

  const simulatorInterface = new ethers.Interface(SphinxSimulatorABI)

  const deploymentData = makeDeploymentData([networkConfig])
  deploymentData[chainId].executor = safeAddress
  const merkleTree = makeSphinxMerkleTree(deploymentData)
  const approveLeaf = getApproveLeafWithProof(merkleTree, BigInt(chainId))
  const executeLeaves = getExecuteLeavesWithProofs(merkleTree, BigInt(chainId))

  const wallets = getSphinxWalletsSortedByAddress(
    BigInt(newConfig.threshold),
    provider
  )
  const packedSignatures = await getPackedOwnerSignatures(
    merkleTree.root,
    wallets
  )
  const sphinxWalletAddresses = wallets.map((wallet) => wallet.address)

  const approveThenExecuteCalldata = simulatorInterface.encodeFunctionData(
    'approveThenExecute',
    [
      safeAddress,
      moduleAddress,
      merkleTree.root,
      approveLeaf,
      executeLeaves,
      packedSignatures,
      sphinxWalletAddresses,
    ]
  )

  const simulatorCalldata = simulatorInterface.encodeFunctionData('simulate', [
    approveThenExecuteCalldata,
    safeAddress,
    safeInitData,
    newConfig.saltNonce,
  ])

  return simulatorCalldata
}

export const assertSimulationSuccess = async (
  networkConfigs: Array<NetworkConfig>
): Promise<void> => {
  networkConfigs
}
