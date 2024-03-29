import {
  SphinxSimulatorABI,
  getSphinxSimulatorAddress,
} from '@sphinx-labs/contracts'
import { ethers } from 'ethers'

import { DeploymentInfo, NetworkConfig } from './config'
import { SphinxJsonRpcProvider } from './provider'
import { toGnosisSafeTransaction } from './utils'

export const getMerkleLeafGasFields = async (
  deploymentInfo: DeploymentInfo,
  provider: SphinxJsonRpcProvider
): Promise<Array<string>> => {
  const sphinxSimulatorAddress = getSphinxSimulatorAddress()
  const simulatorInterface = new ethers.Interface(SphinxSimulatorABI)

  const { safeInitData, accountAccesses, newConfig, safeAddress } =
    deploymentInfo

  const gnosisSafeTxns = accountAccesses
    .map((access) => access.root)
    .map(toGnosisSafeTransaction)

  const simulationCalldata = simulatorInterface.encodeFunctionData(
    'getMerkleLeafGasEstimates',
    [gnosisSafeTxns, safeAddress]
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
  const returnData = simulatorInterface.decodeFunctionResult(
    'simulate',
    rawReturnData
  )[0]
  const [success, , encodedGasEstimates] =
    ethers.AbiCoder.defaultAbiCoder().decode(
      ['bool', 'uint256', 'bytes'],
      returnData
    )

  if (!success) {
    // TODO(docs): this can happen if there's a bug in Sphinx's logic, or if the user's transaction
    // reverted on-chain. not sure if there are other situations.
    throw new Error(`TODO(docs)`)
  }

  const gasEstimates: Array<bigint> = ethers.AbiCoder.defaultAbiCoder().decode(
    ['uint256[]'],
    encodedGasEstimates
  )[0]

  const buffered = gasEstimates.map(
    (gas) => BigInt(60_000) + (gas * BigInt(11)) / BigInt(10)
  )

  return buffered.map(String)
}
