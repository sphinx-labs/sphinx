import {
  SphinxSimulatorABI,
  getSphinxSimulatorAddress,
  makeSphinxMerkleTree,
} from '@sphinx-labs/contracts'
import { ethers } from 'ethers'

import { NetworkConfig } from './config'
import { SphinxJsonRpcProvider } from './provider'
import { makeDeploymentData } from './tasks'
import { makeSphinxWalletOwners } from './utils'

export const simulateExecution = async (
  networkConfig: NetworkConfig,
  provider: SphinxJsonRpcProvider
): Promise<void> => {
  const { safeAddress, moduleAddress, newConfig, chainId, safeInitData } =
    networkConfig

  const sphinxSimulatorAddress = getSphinxSimulatorAddress()
  const simulatorInterface = new ethers.Interface(SphinxSimulatorABI)

  const deploymentData = makeDeploymentData([networkConfig])
  deploymentData[chainId].executor = safeAddress
  const merkleTree = makeSphinxMerkleTree(deploymentData)
  const approveLeaf = merkleTree.leavesWithProofs[0]
  const executeLeaves = merkleTree.leavesWithProofs.slice(1)

  const { wallets, packedSignatures } = await makeSphinxWalletOwners(
    merkleTree.root,
    newConfig.threshold,
    provider
  )
  const sphinxWalletAddresses = wallets.map((wallet) => wallet.address)

  const simulationCalldata = simulatorInterface.encodeFunctionData(
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

  const calldata = simulatorInterface.encodeFunctionData('simulate', [
    simulationCalldata,
    safeAddress,
    safeInitData,
    newConfig.saltNonce,
  ])
  const rawReturnData = await provider.send('eth_call', [
    {
      to: sphinxSimulatorAddress,
      data: calldata,
    },
    'latest',
  ])

  // TODO(later-later): you experienced an error when `success=false`. this will also occur in the other
  // simulation, since it uses the same decoding logic.
  const returnData = simulatorInterface.decodeFunctionResult(
    'simulate',
    rawReturnData
  )[0]
  const [success, , TODO] = ethers.AbiCoder.defaultAbiCoder().decode(
    ['bool', 'uint256', 'bytes'],
    returnData
  )
}
