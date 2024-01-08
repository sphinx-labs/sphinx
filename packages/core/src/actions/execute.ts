import { ethers } from 'ethers'
import { Logger } from '@eth-optimism/common-ts'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import {
  SphinxLeafWithProof,
  ManagedServiceABI,
  SphinxMerkleTree,
  getManagedServiceAddress,
  SphinxLeafType,
  getGnosisSafeSingletonAddress,
  GnosisSafeProxyFactoryArtifact,
  getGnosisSafeProxyFactoryAddress,
  SphinxModuleABI,
  decodeExecuteLeafData,
} from '@sphinx-labs/contracts'
import ora from 'ora'

import {
  MerkleRootState,
  MerkleRootStatus,
  HumanReadableAction,
  HumanReadableActions,
  EstimateGas,
  ExecuteActions,
  ApproveDeployment,
} from './types'
import {
  addSphinxWalletsToGnosisSafeOwners,
  findLeafWithProof,
  fundAccountMaxBalance,
  getGasPriceOverrides,
  getMaxGasLimit,
  getReadableActions,
  removeSphinxWalletsFromGnosisSafeOwners,
  setManagedServiceRelayer,
  signMerkleRoot,
  stringifyMerkleRootStatus,
} from '../utils'
import { SphinxJsonRpcProvider } from '../provider'
import { ExecutionMode } from '../constants'
import { convertEthersTransactionReceipt } from '../artifacts'
import { SphinxTransactionReceipt } from '../languages'
import { ParsedConfig } from '../config'

export const executeDeployment = async (
  module: ethers.Contract,
  merkleTree: SphinxMerkleTree,
  signatures: string[],
  humanReadableActions: HumanReadableActions,
  blockGasLimit: bigint,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  signer: ethers.Signer,
  logger?: Logger | undefined
): Promise<{
  success: boolean
  receipts: ethers.TransactionReceipt[]
  failureAction?: HumanReadableAction
}> => {
  logger?.info(`[Sphinx]: preparing to execute the project...`)

  const receipts: ethers.TransactionReceipt[] = []

  const chainId = await provider.getNetwork().then((n) => n.chainId)
  // filter for leaves on the target network
  const networkLeaves = merkleTree.leavesWithProofs.filter(
    (leaf) => leaf.leaf.chainId === chainId
  )

  // Encode the `APPROVE` leaf.
  const approvalLeaf = networkLeaves[0]
  const packedSignatures = ethers.solidityPacked(
    signatures.map(() => 'bytes'),
    signatures
  )
  const managedService = new ethers.Contract(
    getManagedServiceAddress(),
    ManagedServiceABI,
    signer
  )
  const approvalData = module.interface.encodeFunctionData('approve', [
    merkleTree.root,
    approvalLeaf,
    packedSignatures,
  ])

  const state: MerkleRootState = await module.merkleRootStates(merkleTree.root)

  if (state.status === MerkleRootStatus.EMPTY) {
    // Execute the `APPROVE` leaf.
    receipts.push(
      await (
        await managedService.exec(
          await module.getAddress(),
          approvalData,
          await getGasPriceOverrides(provider, signer)
        )
      ).wait()
    )
  }

  // Execute the `EXECUTE` leaves of the Merkle tree.
  logger?.info(`[Sphinx]: executing actions...`)
  const { status, failureAction, executionReceipts } =
    await executeBatchActions(
      networkLeaves,
      chainId,
      module,
      blockGasLimit,
      humanReadableActions,
      signer,
      provider,
      executeActionsViaManagedService,
      estimateGasViaManagedService,
      logger
    )

  receipts.push(...executionReceipts)

  if (status === MerkleRootStatus.FAILED) {
    return { success: false, receipts, failureAction }
  } else {
    logger?.info(`[Sphinx]: executed actions`)
  }

  // We're done!
  logger?.info(`[Sphinx]: successfully deployed project`)
  return { success: true, receipts }
}

/**
 * Helper function for finding the maximum number of batch elements that can be executed from a
 * given input list of actions. This is done by finding the largest batch size that does not exceed
 * the maximum gas limit.
 *
 * @param actions List of actions to execute.
 * @returns Maximum number of actions that can be executed.
 */
const findMaxBatchSize = (
  leaves: SphinxLeafWithProof[],
  maxGasLimit: bigint,
  moduleAddress: string,
  estimateGas: EstimateGas
): number => {
  if (leaves.length === 0) {
    throw new Error(`Must enter at least one Merkle leaf.`)
  }

  // Start with the smallest batch size (1) and incrementally try larger batches. We don't start
  // with the largest possible batch size and incrementally try smaller batches because the gas
  // estimation logic ABI encodes the Merkle leaves, which can be very slow for large amounts of
  // data.
  for (let i = 1; i <= leaves.length; i++) {
    if (
      !isExecutable(leaves.slice(0, i), maxGasLimit, moduleAddress, estimateGas)
    ) {
      // If the first batch itself is not executable, throw an error.
      if (i === 1) {
        throw new Error(`Could not find a valid batch size.`)
      } else {
        // For larger batches, return the size of the previous batch as the maximum executable batch
        // size.
        return i - 1
      }
    }
  }

  // If all batches are executable, return the full length.
  return leaves.length
}

/**
 * Helper function for executing a list of actions in batches. We execute actions in batches to
 * reduce the total number of transactions, which makes the deployment faster and cheaper.
 *
 * @returns An object containing:
 * - `status`: Final deployment status.
 * - `executionReceipts`: Array of transaction receipts from executed actions.
 * - `batches`: An array of arrays of `EXECUTE` Merkle leaves representing grouped leaves processed in
 * each batch. This array only contains leaves that were executed in this call and not leaves that were
 * previously executed.
 * - `failureAction`: An optional HumanReadableAction indicating the action that caused a deployment
 * to fail.
 */
export const executeBatchActions = async (
  leavesOnNetwork: SphinxLeafWithProof[],
  chainId: bigint,
  sphinxModule: ethers.Contract,
  blockGasLimit: bigint,
  humanReadableActions: HumanReadableActions,
  signer: ethers.Signer,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  executeActions: ExecuteActions,
  estimateGas: EstimateGas,
  logger?: Logger | undefined
): Promise<{
  status: bigint
  executionReceipts: ethers.TransactionReceipt[]
  batches: SphinxLeafWithProof[][]
  failureAction?: HumanReadableAction
}> => {
  const executionReceipts: ethers.TransactionReceipt[] = []
  const batches: SphinxLeafWithProof[][] = []

  const maxGasLimit = getMaxGasLimit(blockGasLimit)

  // Pull the Merkle root state from the contract so we're guaranteed to be up to date.
  const activeRoot = await sphinxModule.activeMerkleRoot()
  let state: MerkleRootState = await sphinxModule.merkleRootStates(activeRoot)

  if (state.status === MerkleRootStatus.FAILED) {
    return {
      status: state.status,
      executionReceipts,
      batches,
      failureAction:
        humanReadableActions[chainId.toString()][
          Number(state.leavesExecuted) - 2
        ],
    }
  }

  // Remove the actions that have already been executed.
  const filtered = leavesOnNetwork.filter((leaf) => {
    return leaf.leaf.index >= state.leavesExecuted
  })

  // We can return early if there are no actions to execute.
  if (filtered.length === 0) {
    logger?.info('[Sphinx]: no actions left to execute')
    return { status: state.status, executionReceipts, batches }
  }

  const moduleAddress = await sphinxModule.getAddress()
  let executed = 0
  while (executed < filtered.length) {
    // Figure out the maximum number of actions that can be executed in a single batch.
    const batchSize = findMaxBatchSize(
      filtered.slice(executed),
      maxGasLimit,
      moduleAddress,
      estimateGas
    )

    // Pull out the next batch of actions.
    const batch = filtered.slice(executed, executed + batchSize)

    // Keep 'em notified.
    logger?.info(
      `[Sphinx]: executing actions ${executed} to ${executed + batchSize} of ${
        filtered.length
      }...`
    )

    const executionData = sphinxModule.interface.encodeFunctionData('execute', [
      batch,
    ])
    const receipt = await executeActions(
      moduleAddress,
      executionData,
      signer,
      provider
    )

    if (!receipt) {
      throw new Error(
        `Could not find transaction receipt. Should never happen.`
      )
    }

    executionReceipts.push(receipt)
    batches.push(batch)

    // Return early if the deployment failed.
    state = await sphinxModule.merkleRootStates(activeRoot)

    if (state.status === MerkleRootStatus.FAILED) {
      return {
        status: state.status,
        batches,
        executionReceipts,
        failureAction:
          humanReadableActions[chainId.toString()][
            Number(state.leavesExecuted) - 2
          ],
      }
    }

    // Move on to the next batch if necessary.
    executed += batchSize
  }

  // Return the final deployment status.
  return { status: state.status, executionReceipts, batches }
}

/**
 * Helper function that determines if a given batch is executable.
 *
 * @param selected Selected actions to execute.
 * @returns True if the batch is executable, false otherwise.
 */
export const isExecutable = (
  selected: SphinxLeafWithProof[],
  maxGasLimit: bigint,
  moduleAddress: string,
  estimateGas: EstimateGas
): boolean => {
  return maxGasLimit > estimateGas(moduleAddress, selected)
}

export const approveDeploymentViaSigner: ApproveDeployment = async (
  safeAddress,
  moduleAddress,
  merkleRoot,
  approvalLeafWithProof,
  provider,
  signer
) => {
  const ownerSignature = await signMerkleRoot(merkleRoot, signer)

  const sphinxModule = new ethers.Contract(
    moduleAddress,
    SphinxModuleABI,
    signer
  )

  return (
    await sphinxModule.approve(
      merkleRoot,
      approvalLeafWithProof,
      ownerSignature,
      await getGasPriceOverrides(provider, signer)
    )
  ).wait()
}

export const approveDeploymentViaManagedService: ApproveDeployment = async (
  safeAddress,
  moduleAddress,
  merkleRoot,
  approvalLeafWithProof,
  provider,
  signer
) => {
  // Before we can approve the deployment, we must add a set of auto-generated wallets as owners of
  // the Gnosis Safe. This allows us to approve the deployment without knowing the private keys of
  // the actual Gnosis Safe owners.
  const sphinxWallets = await addSphinxWalletsToGnosisSafeOwners(
    safeAddress,
    provider
  )

  const managedService = new ethers.Contract(
    getManagedServiceAddress(),
    ManagedServiceABI,
    signer
  )
  const ownerSignatures = await Promise.all(
    sphinxWallets.map((wallet) => signMerkleRoot(merkleRoot, wallet))
  )
  const packedOwnerSignatures = ethers.solidityPacked(
    new Array(ownerSignatures.length).fill('bytes'),
    ownerSignatures
  )

  const sphinxModule = new ethers.Contract(
    moduleAddress,
    SphinxModuleABI,
    signer
  )

  const approvalData = sphinxModule.interface.encodeFunctionData('approve', [
    merkleRoot,
    approvalLeafWithProof,
    packedOwnerSignatures,
  ])
  const approvalReceipt = await (
    await managedService.exec(
      moduleAddress,
      approvalData,
      await getGasPriceOverrides(provider, signer)
    )
  ).wait()

  // Remove the auto-generated wallets that are currently Gnosis Safe owners. This isn't
  // strictly necessary, but it ensures that the Gnosis Safe owners and threshold match the
  // production environment.
  await removeSphinxWalletsFromGnosisSafeOwners(
    sphinxWallets,
    safeAddress,
    provider
  )

  return approvalReceipt
}

export const executeActionsViaManagedService: ExecuteActions = async (
  moduleAddress,
  executionData,
  signer,
  provider
) => {
  const managedService = new ethers.Contract(
    getManagedServiceAddress(),
    ManagedServiceABI,
    signer
  )

  return (
    await managedService.exec(
      moduleAddress,
      executionData,
      await getGasPriceOverrides(provider, signer)
    )
  ).wait()
}

export const executeActionsViaSigner: ExecuteActions = async (
  moduleAddress,
  executionData,
  signer,
  provider
) => {
  const txn = await getGasPriceOverrides(provider, signer, {
    to: moduleAddress,
    data: executionData,
  })
  const receipt = await (await signer.sendTransaction(txn)).wait()

  // Narrow the TypeScript type.
  if (!receipt) {
    throw new Error(`Receipt is null. Should never happen.`)
  }

  return receipt
}

/**
 * Estimate the amount of gas that will be used by executing a batch of `EXECUTE` Merkle leaves
 * through the `ManagedService` contract. We use heuristics instead of the `eth_estimateGas` RPC
 * method, which is unacceptably slow for large deployments on local networks. The heuristic is the
 * sum of:
 *
 * 1. 21k, which is the cost of initiating a transaction on Ethereum.
 * 2. The transaction calldata, which is 16 gas per non-zero byte of calldata and 4 bytes per
 * zero-byte of calldata.
 * 3. The estimated cost of executing the logic in the `SphinxModule`.
 * 4. The estimated cost of executing the logic in the `ManagedService` contract. This scales in
 * relation to the amount of calldata passed to the destination contract (i.e. the
 * `SphinxModuleProxy`). To estimate this, we measured the gas used in the `ManagedService`
 * contract for various lengths of calldata. The estimated values did not include the cost of
 * executing the logic at the destination address, or the cost of initiating the transaction
 * (i.e. 21k + calldata). The estimates were the same regardless of whether or not the calldata
 * consisted of non-zero or zero-bytes. The curve that best approximated the data turned out to
 * be a quadratic formula, which gave an R^2 value of ~1.0 (i.e. it's essentially a perfect fit).
 * Here are the data points in the format (<CALLDATA_LENGTH>, <GAS_ESTIMATE>):
 * (0,10202),(1000,10592),(100000,67166),(500000,676492),(1000000,2296456).
 *
 * After summing these values, we multiply by 1.1 to ensure that the heuristic overestimates the
 * amount of gas. This ensures we don't underestimate the gas, which would otherwise be a concern
 * because we don't incorporate the cost of executing the `DELEGATECALL` on the `SphinxModuleProxy`,
 * or the cost of potentially returning data from the `exec` function on the `ManagedService`. This
 * buffer also makes our estimate closer to the value that would be returned by the
 * `eth_estimateGas` RPC method, which tends to overestimate the amount of gas.
 */
export const estimateGasViaManagedService: EstimateGas = (
  moduleAddress,
  batch
) => {
  const managedServiceIface = new ethers.Interface(ManagedServiceABI)
  const sphinxModuleIface = new ethers.Interface(SphinxModuleABI)
  const moduleCallData = sphinxModuleIface.encodeFunctionData('execute', [
    batch,
  ])

  const callDataHex = managedServiceIface.encodeFunctionData('exec', [
    moduleAddress,
    moduleCallData,
  ])
  const callDataGas = ethers
    .getBytes(callDataHex)
    .map((e) => (e === 0 ? 4 : 16))
    .reduce((a, b) => a + b, 0)

  const managedServiceGas =
    0.00000191 * moduleCallData.length * moduleCallData.length +
    0.3789 * moduleCallData.length +
    10205.7165

  const estimate =
    21_000 + callDataGas + estimateModuleExecutionGas(batch) + managedServiceGas

  return Math.round(estimate * 1.1)
}

/**
 * Estimate the amount of gas that will be used by executing a batch of `EXECUTE` Merkle leaves
 * directly on the `SphinxModuleProxy`. We use heuristics instead of the `eth_estimateGas` RPC
 * method, which is unacceptably slow for large deployments on local networks. The heuristic is the
 * sum of:
 *
 * 1. 21k, which is the cost of initiating a transaction on Ethereum.
 * 2. The transaction calldata, which is 16 gas per non-zero byte of calldata and 4 bytes per
 * zero-byte of calldata.
 * 3. The estimated cost of executing the logic in the `SphinxModule`.
 *
 * After summing these values, we multiply by 1.1 to ensure that the heuristic overestimates the
 * amount of gas. This ensures we don't underestimate the gas, which would otherwise be a concern
 * because we don't incorporate the cost of executing the `DELEGATECALL` on the `SphinxModuleProxy`.
 * This buffer also makes our estimate closer to the value that would be returned by the
 * `eth_estimateGas` RPC method, which tends to overestimate the amount of gas.
 */
export const estimateGasViaSigner: EstimateGas = (moduleAddress, batch) => {
  const sphinxModuleIface = new ethers.Interface(SphinxModuleABI)

  const callDataHex = sphinxModuleIface.encodeFunctionData('execute', [batch])
  const callDataGas = ethers
    .getBytes(callDataHex)
    .map((e) => (e === 0 ? 4 : 16))
    .reduce((a, b) => a + b, 0)

  const estimate = 21_000 + callDataGas + estimateModuleExecutionGas(batch)

  return Math.round(estimate * 1.1)
}

/**
 * Estimates the amount of gas required to execute the logic in the `SphinxModule`. There are two
 * main components:
 *
 * 1. Logic inside the for-loop. This is the sum of the `gas` field of the Merkle leaves plus a
 * buffer for the logic inside the for-loop but outside the try/catch that executes the user's
 * transaction. We estimated that this buffer is 24k per leaf. This is the amount of gas used in
 * the worst case scenario: which is a deployment that has a batch size of 300 (to make
 * `MerkleProof.verify` expensive), and is marked as `FAILED`.
 * 2. Logic outside the for-loop (i.e. before and after the loop). We estimated that this is 30k in
 * the most expensive scenario, which is when the deployment is marked as `COMPLETED`. This
 * estimate factors in the cost of the `nonReentrant` modifier.
 */
const estimateModuleExecutionGas = (
  batch: Array<SphinxLeafWithProof>
): number => {
  const decodedBatch = batch.map((e) => e.leaf).map(decodeExecuteLeafData)
  const loopGas = decodedBatch
    .map((e) => e.gas)
    .map(Number)
    .reduce((a, b) => a + b + 24_000, 0)

  return 30_000 + loopGas
}

export const runEntireDeploymentProcess = async (
  parsedConfig: ParsedConfig,
  merkleTree: SphinxMerkleTree,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  signer: ethers.Wallet,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<{
  receipts: Array<SphinxTransactionReceipt>
  batches: Array<Array<SphinxLeafWithProof>>
  finalStatus: MerkleRootState['status']
  failureAction?: HumanReadableAction
}> => {
  const { chainId, executionMode, actionInputs } = parsedConfig

  const humanReadableActions = {
    [chainId]: getReadableActions(actionInputs),
  }

  let estimateGas: EstimateGas
  let approveDeployment: ApproveDeployment
  let executeActions: ExecuteActions
  if (
    executionMode === ExecutionMode.LocalNetworkCLI ||
    executionMode === ExecutionMode.Platform
  ) {
    await fundAccountMaxBalance(signer.address, provider)
    await setManagedServiceRelayer(signer.address, provider)

    estimateGas = estimateGasViaManagedService
    approveDeployment = approveDeploymentViaManagedService
    executeActions = executeActionsViaManagedService
  } else if (executionMode === ExecutionMode.LiveNetworkCLI) {
    estimateGas = estimateGasViaSigner
    approveDeployment = approveDeploymentViaSigner
    executeActions = executeActionsViaSigner
  } else {
    throw new Error(`Unknown execution mode.`)
  }

  const sphinxModule = new ethers.Contract(
    parsedConfig.moduleAddress,
    SphinxModuleABI,
    signer
  )

  const ethersReceipts: Array<ethers.TransactionReceipt> = []

  if (!parsedConfig.initialState.isSafeDeployed) {
    spinner.start(`Deploying Gnosis Safe and Sphinx Module...`)

    const gnosisSafeProxyFactory = new ethers.Contract(
      getGnosisSafeProxyFactoryAddress(),
      GnosisSafeProxyFactoryArtifact.abi,
      signer
    )
    const gnosisSafeDeploymentReceipt = await (
      await gnosisSafeProxyFactory.createProxyWithNonce(
        getGnosisSafeSingletonAddress(),
        parsedConfig.safeInitData,
        parsedConfig.newConfig.saltNonce,
        await getGasPriceOverrides(provider, signer)
      )
    ).wait()
    ethersReceipts.push(gnosisSafeDeploymentReceipt)

    spinner.succeed(`Deployed Gnosis Safe and Sphinx Module.`)
  }

  const approvalLeafWithProof = findLeafWithProof(
    merkleTree,
    SphinxLeafType.APPROVE,
    BigInt(parsedConfig.chainId)
  )

  spinner.start(`Checking deployment status...`)

  const merkleRootState: MerkleRootState = await sphinxModule.merkleRootStates(
    merkleTree.root
  )

  if (merkleRootState.status === MerkleRootStatus.EMPTY) {
    spinner.succeed(`Deployment is new.`)
    spinner.start(`Approving deployment...`)

    const approvalReceipt = await approveDeployment(
      parsedConfig.safeAddress,
      parsedConfig.moduleAddress,
      merkleTree.root,
      approvalLeafWithProof,
      provider,
      signer
    )
    ethersReceipts.push(approvalReceipt)

    spinner.succeed(`Approved deployment.`)
  } else if (merkleRootState.status !== MerkleRootStatus.APPROVED) {
    spinner.clear()
    throw new Error(
      `Deployment's status: ${stringifyMerkleRootStatus(
        merkleRootState.status
      )}`
    )
  } else {
    spinner.succeed(`Deployment is already approved.`)
  }

  spinner.start(`Executing deployment...`)

  const networkLeaves = merkleTree.leavesWithProofs.filter(
    (leaf) => leaf.leaf.chainId === BigInt(parsedConfig.chainId)
  )
  const { status, failureAction, executionReceipts, batches } =
    await executeBatchActions(
      networkLeaves,
      BigInt(parsedConfig.chainId),
      sphinxModule,
      BigInt(parsedConfig.blockGasLimit),
      humanReadableActions,
      signer,
      provider,
      executeActions,
      estimateGas
    )

  spinner.succeed(`Executed deployment.`)
  spinner.start(`Checking final deployment status...`)

  ethersReceipts.push(...executionReceipts)
  const receipts = ethersReceipts.map(convertEthersTransactionReceipt)

  if (status === MerkleRootStatus.FAILED) {
    spinner.fail(`Deployment failed.`)
    return { receipts, batches, finalStatus: status, failureAction }
  } else if (status === MerkleRootStatus.CANCELED) {
    spinner.fail(`Deployment cancelled by user.`)
    return { receipts, batches, finalStatus: status }
  } else if (status === MerkleRootStatus.COMPLETED) {
    spinner.succeed(`Deployment succeeded.`)
    return { receipts, batches, finalStatus: status }
  } else {
    throw new Error(`Unknown status: ${status}`)
  }
}
