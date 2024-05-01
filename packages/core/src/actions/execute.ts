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
import { TransactionReceipt, ethers } from 'ethers'

import { DeploymentConfig, NetworkConfig } from '../config'
import {
  ApproveDeployment,
  EstimateGas,
  ExecuteActions,
  HumanReadableAction,
  HumanReadableActions,
  MerkleRootState,
  MerkleRootStatus,
} from './types'
import { ExecutionMode } from '../constants'
import { SphinxJsonRpcProvider } from '../provider'
import {
  addSphinxWalletsToGnosisSafeOwners,
  findLeafWithProof,
  getGasPriceOverrides,
  getMaxGasLimit,
  getReadableActions,
  getSphinxWalletsSortedByAddress,
  removeSphinxWalletsFromGnosisSafeOwners,
  setManagedServiceRelayer,
  toSphinxLeafWithProofArray,
} from '../utils'
import {
  implementsEIP2028,
  isActionTransactionBatchingEnabled,
  shouldBufferExecuteActionsGasLimit,
} from '../networks'
import {
  SphinxTransactionReceipt,
  ensureSphinxAndGnosisSafeDeployed,
} from '../languages'
import { convertEthersTransactionReceipt } from '../artifacts'

export type TreeSigner = {
  signer: string
  signature: string
}

/**
 * These fields are only used on the website:
 *
 * @field id: id of the deployment on a specific network
 * @field multichainDeploymentId: id of the entire multichain deployment
 * @field projectId: id of the project this deployment is part of
 *
 * These are required in all situations:
 * @field chainId: The numeric network id (i.e 1 for eth mainnet)
 * @field status: The current status of the deployment (this is always 'approved'
 * in the deploy and propose command since we do not have any retry logic)
 * @field safeAddress: The address of the Safe to execute the deployment through
 * @field moduleAddress: The address of the Sphinx module associated with the safe
 * @field deploymentConfig: The compiler config which contains all the data for the
 * deployment.
 * @field networkName: The human readable name for the network. This should correspond
 * to one of the official network names in the SPHINX_NETWORKS array.
 * @field treeSigners: Array of objects containing the address of an owner of the
 * Gnosis Safe along with a signature from that Safe.
 */
export type Deployment = {
  id: string
  multichainDeploymentId: string
  projectId: string
  chainId: string
  status:
    | 'approved'
    | 'cancelled'
    | 'executed'
    | 'verified'
    | 'verification_unsupported'
    | 'failed'
  safeAddress: string
  moduleAddress: string
  deploymentConfig: DeploymentConfig
  networkName: string
  treeSigners: Array<TreeSigner>
}

export type HandleError = (e: any, deployment: Deployment) => Promise<void>

export type ThrowError = (
  message: string,
  deploymentId: string,
  networkName: string
) => Promise<void>

export type HandleAlreadyExecutedDeployment = (
  deploymentContext: DeploymentContext,
  networkConfig: NetworkConfig
) => Promise<void>

export type HandleExecutionFailure = (
  deploymentContext: DeploymentContext,
  networkConfig: NetworkConfig,
  failureAction: HumanReadableAction | undefined
) => Promise<void>

export type HandleSuccess = (
  deploymentContext: DeploymentContext,
  networkConfig: NetworkConfig
) => Promise<void>

export type MinimumTransaction = {
  to: string
  chainId: string
  data: string
  gasLimit?: string
  value?: string
}

export type ExecuteTransaction = (
  deploymentContext: DeploymentContext,
  transaction: MinimumTransaction,
  executionMode: ExecutionMode,
  minimumActionsGasLimit?: number
) => Promise<TransactionReceipt>

export type InjectRoles = (
  deploymentContext: DeploymentContext,
  executionMode: ExecutionMode
) => Promise<void>

export type RemoveRoles = (
  deploymentContext: DeploymentContext,
  networkConfig: NetworkConfig,
  executionMode: ExecutionMode
) => Promise<void>

/**
 * Before calling the `attemptDeployment` function, we have to construct a DeploymentContext
 * which implements a number of functions that vary depending on the specific context in which the function
 * is executed. This allows us to share the `attemptDeployment` function between the proposal
 * simulation, deploy cli command simulation/execution, and the website execution flow.
 *
 * Using a single function for all of these related flows improves maintainability and also reduces the
 * chance that a deployment will be proposed successfully and then later fail due to a bug that only exists
 * in the execution logic on the website.
 *
 * So to acheive those benefits, we aim to share as much logic between these different execution cases by
 * limiting the amount of logic that is implemented within the `DeploymentContext` object. We should *only*
 * use the `DeploymentContext` object to store logic which absolutely cannot be used within all three flows.
 *
 */
export type DeploymentContext = {
  /**
   * Used when we need to throw an error ourselves.
   *
   * We use the `DeploymentContext` for this because the website needs to log errors to sentry
   * while the propose and deploy commands should simply throw an error.
   */
  throwError: ThrowError

  /**
   * Used when catching an error throw by some dependency or function call.
   *
   * We use the `DeploymentContext` for this because the website needs to log errors to sentry
   * while the propose and deploy commands should simply throw an error.
   */
  handleError: HandleError

  /**
   * Handles if the deployment has already been executed.
   *
   * We use the `DeploymentContext` for this because the website implements retry logic, as a result
   * there are some cases where the deployment may be partially or fully executed already when we call
   * the `attemptDeployment` function. For the propose/deploy commands, this should never happen
   * so we just error.
   *
   * It's worth noting that if we wanted to implement retry logic in the deploy cli command to make it more
   * reliable, we would want to do that by implementing this function and then repeatedly calling the
   * `attemptDeployment` function. This is how the website currently works.
   */
  handleAlreadyExecutedDeployment: HandleAlreadyExecutedDeployment

  /**
   * Handles if the deployment failed midway due to some on chain revert that is not our fault.
   *
   * We use the `DeploymentContext` for this because the website needs to record information about
   * partial executions in the database.
   */
  handleExecutionFailure: HandleExecutionFailure

  /**
   * Handles post execution cleanup after successful execution.
   *
   * We use the `DeploymentContext` for this because like deployment failures, the website need to record information
   * about successes in the database.
   */
  handleSuccess: HandleSuccess

  /**
   * Handles executing a transaction.
   *
   * We use the `DeploymentContext` for this because the website sends transactions using the relayer service rather
   * than an ethers signer like the deploy/propose commands.
   *
   * There are cases within the `attemptDeployment` where we can just use a signer to send transactions
   * without breaking the website (any time we send a transaction that will *never* get send on the website). However,
   * we bias towards always using this function even if it's not strictly necessary. It's generally easier to reason
   * about always using this function than it is to reason about if it's necessary in specific cases or not.
   */
  executeTransaction: ExecuteTransaction

  /**
   * Handles injecting roles that are necessary for successful execution in the simulation and on local networks. For
   * example, we set new Gnosis Safe owners when deploying on local nodes so that the user does not have to have access
   * to all of their owner wallet keys.
   *
   * We use `DeploymentContext` for this because injecting roles will not work and is not necessary when executing
   * against a live network.
   */
  injectRoles: InjectRoles

  /**
   * Handles removing injected roles after they are no longer needed. We use a dedicated function for this instead of
   * handling in `handleSuccess` or elsewhere since we want the injected gnosis safe owners to be removed as early as
   * possible so that if the user tries to fetch the safe owners during the deployment, the correct value will be
   * returned.
   */
  removeRoles: RemoveRoles

  /**
   * We also include some additional objects which are just convenient to store in the `DeploymentContext` object
   * since it's already being passed around everywhere. These fields are not strictly necessary to be included here.
   */

  /**
   * Stores the deployment metadata for easy access.
   *
   * Provides us with a common interface for information about the deployment. In the website this is a real object
   * in the DB. We use a minimal type here to make it easy to work with in the deploy and propose command logic.
   */
  deployment: Deployment

  /**
   * Stores the rpc provider we should use throughout the deployment.
   *
   * Allows us to generate and supply the rpc provider in whatever way we would like.
   */
  provider: SphinxJsonRpcProvider | HardhatEthersProvider

  /**
   * An optional wallet.
   *
   * This wallet will be available in the `executeTransaction` function and can be used to send transactions in cases
   * where an ethers signer is desirable. It will not be available when the `attemptDeployment` function is
   * invoked in the website backend. It's up to the `executeTransaction` function to ensure the field exists if it's
   * required.
   */
  wallet?: ethers.Wallet

  /**
   * An optional logger.
   *
   * This is used to log errors or traces by in the website.
   */
  logger?: Logger

  /**
   * An optional spinner.
   *
   * This is used to provide feedback to the user.
   */
  spinner?: ora.Ora
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
  estimateGas: EstimateGas,
  chainId: bigint
): number => {
  if (leaves.length === 0) {
    throw new Error(`Must enter at least one Merkle leaf.`)
  }

  const maxBatchSize = isActionTransactionBatchingEnabled(chainId)
    ? leaves.length
    : 1

  // Start with the smallest batch size (1) and incrementally try larger batches. We don't start
  // with the largest possible batch size and incrementally try smaller batches because the gas
  // estimation logic ABI encodes the Merkle leaves, which can be very slow for large amounts of
  // data.
  for (let i = 1; i <= maxBatchSize; i++) {
    if (
      !isExecutable(
        leaves.slice(0, i),
        maxGasLimit,
        moduleAddress,
        estimateGas,
        chainId
      )
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
  return isActionTransactionBatchingEnabled(chainId) ? leaves.length : 1
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
  sphinxModuleReadOnly: ethers.Contract,
  blockGasLimit: bigint,
  humanReadableActions: HumanReadableActions,
  executionMode: ExecutionMode,
  executeActions: ExecuteActions,
  estimateGas: EstimateGas,
  deploymentContext: DeploymentContext
): Promise<{
  status: bigint
  executionReceipts: ethers.TransactionReceipt[]
  batches: SphinxLeafWithProof[][]
  failureAction?: HumanReadableAction
}> => {
  const { deployment, logger } = deploymentContext
  const { chainId } = deployment

  const executionReceipts: ethers.TransactionReceipt[] = []
  const batches: SphinxLeafWithProof[][] = []

  const maxGasLimit = getMaxGasLimit(blockGasLimit)

  // Pull the Merkle root state from the contract so we're guaranteed to be up to date.
  const activeRoot = await sphinxModuleReadOnly.activeMerkleRoot()
  let state: MerkleRootState = await sphinxModuleReadOnly.merkleRootStates(
    activeRoot
  )

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

  const moduleAddress = await sphinxModuleReadOnly.getAddress()
  let executed = 0
  while (executed < filtered.length) {
    // Figure out the maximum number of actions that can be executed in a single batch.
    const batchSize = findMaxBatchSize(
      filtered.slice(executed),
      maxGasLimit,
      moduleAddress,
      estimateGas,
      BigInt(chainId)
    )

    // Pull out the next batch of actions.
    const batch = filtered.slice(executed, executed + batchSize)

    // Keep 'em notified.
    logger?.info(
      `[Sphinx]: executing actions ${executed} to ${executed + batchSize} of ${
        filtered.length
      }...`
    )

    const receipt = await executeActions(
      batch,
      executionMode,
      blockGasLimit,
      deploymentContext
    )

    if (!receipt) {
      throw new Error(
        `Could not find transaction receipt. Should never happen.`
      )
    }

    executionReceipts.push(receipt)
    batches.push(batch)

    // Return early if the deployment failed.
    state = await sphinxModuleReadOnly.merkleRootStates(activeRoot)

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
  estimateGas: EstimateGas,
  chainid: bigint
): boolean => {
  return maxGasLimit > estimateGas(moduleAddress, selected, chainid)
}

export const approveDeploymentViaSigner: ApproveDeployment = async (
  merkleRoot,
  approvalLeafWithProof,
  executionMode,
  ownerSignatures,
  deploymentContext
) => {
  const { moduleAddress } = deploymentContext.deployment
  const sphinxModuleReadOnly = new ethers.Contract(
    moduleAddress,
    SphinxModuleABI
  )

  const packedOwnerSignatures = ethers.solidityPacked(
    new Array(ownerSignatures.length).fill('bytes'),
    ownerSignatures
  )
  const approvalData = sphinxModuleReadOnly.interface.encodeFunctionData(
    'approve',
    [merkleRoot, approvalLeafWithProof, packedOwnerSignatures]
  )

  return deploymentContext.executeTransaction(
    deploymentContext,
    {
      to: moduleAddress,
      data: approvalData,
      chainId: deploymentContext.deployment.chainId,
    },
    executionMode
  )
}

export const executeTransactionViaSigner: ExecuteTransaction = async (
  deploymentContext: DeploymentContext,
  transaction: MinimumTransaction,
  executionMode: ExecutionMode
): Promise<ethers.TransactionReceipt> => {
  const { wallet } = deploymentContext

  if (!wallet) {
    throw new Error(
      'No signer passed to executeTransaction. This is a bug, please report it to the developers.'
    )
  }

  const txReceipt = await (
    await wallet.sendTransaction(
      await getGasPriceOverrides(
        deploymentContext.provider,
        wallet,
        executionMode,
        transaction
      )
    )
  ).wait()

  if (txReceipt === null) {
    throw new Error(
      'No transaction receipt returned by ethers. This is a bug, please report it to the developers.'
    )
  }

  return txReceipt
}

/**
 * We use this function to inject various roles during simulation and execution on local nodes.
 * We have to handle this using dependency injection because it would not work when executing
 * on a live network.
 */
export const injectRoles: InjectRoles = async (
  deploymentContext: DeploymentContext,
  executionMode: ExecutionMode
) => {
  const { wallet } = deploymentContext

  if (!wallet) {
    throw new Error(
      'No wallet provided when injecting roles. This is a bug, please report it to the developers.'
    )
  }

  // Before we can execute the deployment, we must assign the relayer role to the signer so they
  // will be able to execute transactions via the managed service contract.
  await setManagedServiceRelayer(wallet.address, deploymentContext.provider)

  // Before we can approve the deployment, we must add a set of auto-generated wallets as owners of
  // the Gnosis Safe. This allows us to approve the deployment without knowing the private keys of
  // the actual Gnosis Safe owners.
  await addSphinxWalletsToGnosisSafeOwners(
    deploymentContext.deployment.safeAddress,
    deploymentContext.deployment.moduleAddress,
    executionMode,
    deploymentContext.provider
  )
}

export const removeRoles: RemoveRoles = async (
  deploymentContext: DeploymentContext,
  networkConfig: NetworkConfig,
  executionMode: ExecutionMode
) => {
  // Create a list of auto-generated wallets. We'll add these as the Gnosis Safe owners.
  const sphinxWallets = getSphinxWalletsSortedByAddress(
    BigInt(networkConfig.newConfig.threshold),
    deploymentContext.provider
  )

  // Remove the auto-generated wallets that are currently Gnosis Safe owners. This isn't
  // strictly necessary, but it ensures that the Gnosis Safe owners and threshold match the
  // production environment.
  await removeSphinxWalletsFromGnosisSafeOwners(
    sphinxWallets,
    networkConfig.safeAddress,
    networkConfig.moduleAddress,
    executionMode,
    deploymentContext.provider
  )
}

export const approveDeploymentViaManagedService: ApproveDeployment = async (
  merkleRoot,
  approvalLeafWithProof,
  executionMode,
  ownerSignatures,
  deploymentContext
) => {
  const { moduleAddress } = deploymentContext.deployment
  const managedServiceReadOnly = new ethers.Contract(
    getManagedServiceAddress(),
    ManagedServiceABI
  )
  const packedOwnerSignatures = ethers.solidityPacked(
    new Array(ownerSignatures.length).fill('bytes'),
    ownerSignatures
  )

  const sphinxModuleReadOnly = new ethers.Contract(
    moduleAddress,
    SphinxModuleABI
  )

  const approvalData = sphinxModuleReadOnly.interface.encodeFunctionData(
    'approve',
    [merkleRoot, approvalLeafWithProof, packedOwnerSignatures]
  )

  const execData = managedServiceReadOnly.interface.encodeFunctionData('exec', [
    moduleAddress,
    approvalData,
  ])

  return deploymentContext.executeTransaction(
    deploymentContext,
    {
      to: getManagedServiceAddress(),
      data: execData,
      chainId: deploymentContext.deployment.chainId,
    },
    executionMode
  )
}

export const executeActionsViaManagedService: ExecuteActions = async (
  batch,
  executionMode,
  blockGasLimit,
  deploymentContext
) => {
  const { provider } = deploymentContext
  const { moduleAddress, chainId } = deploymentContext.deployment
  const managedService = new ethers.Contract(
    getManagedServiceAddress(),
    ManagedServiceABI
  )

  const sphinxModuleReadOnly = new ethers.Contract(
    moduleAddress,
    SphinxModuleABI,
    provider
  )

  const executionData = sphinxModuleReadOnly.interface.encodeFunctionData(
    'execute',
    [batch]
  )
  const managedServiceExecData = managedService.interface.encodeFunctionData(
    'exec',
    [moduleAddress, executionData]
  )

  let minimumActionsGasLimit: number | undefined
  if (shouldBufferExecuteActionsGasLimit(BigInt(chainId))) {
    minimumActionsGasLimit = estimateGasViaManagedService(
      moduleAddress,
      batch,
      BigInt(deploymentContext.deployment.chainId)
    )
  }

  return deploymentContext.executeTransaction(
    deploymentContext,
    {
      to: getManagedServiceAddress(),
      data: managedServiceExecData,
      chainId: deploymentContext.deployment.chainId,
    },
    executionMode,
    minimumActionsGasLimit
  )
}

export const executeActionsViaSigner: ExecuteActions = async (
  batch,
  executionMode,
  blockGasLimit,
  deploymentContext
) => {
  const { provider, wallet } = deploymentContext
  const { moduleAddress, chainId } = deploymentContext.deployment
  const sphinxModuleReadOnly = new ethers.Contract(
    moduleAddress,
    SphinxModuleABI,
    provider
  )

  const executionData = sphinxModuleReadOnly.interface.encodeFunctionData(
    'execute',
    [batch]
  )

  if (!wallet) {
    throw new Error(
      'No signer passed to executeActionsViaSigner. This is a bug, please report it to the developers.'
    )
  }

  const minimumActionGas = estimateGasViaSigner(
    moduleAddress,
    batch,
    BigInt(deploymentContext.deployment.chainId)
  )
  const overrides: ethers.TransactionRequest = {}
  if (shouldBufferExecuteActionsGasLimit(BigInt(chainId))) {
    const gasEstimate = await wallet.estimateGas({
      to: moduleAddress,
      data: executionData,
    })

    let limit = BigInt(gasEstimate) + BigInt(minimumActionGas)
    const maxGasLimit = getMaxGasLimit(blockGasLimit)
    if (limit > maxGasLimit) {
      limit = maxGasLimit
    }
    overrides.gasLimit = limit
  }

  return deploymentContext.executeTransaction(
    deploymentContext,
    {
      to: moduleAddress,
      data: executionData,
      gasLimit: overrides.gasLimit?.toString(),
      chainId: deploymentContext.deployment.chainId,
    },
    executionMode
  )
}

/**
 * Some networks may have a different gas cost per byte of gas if they do not implement EIP-2028.
 * For example, Rootstock is like this. So we use this function to properly calculate the gas
 * cost per call data for both networks that implement EIP-2028 and those that do not.
 */
const getGasPerCalldata = (byte: number, chainId: bigint) => {
  // If the byte is 0, then the cost is 4 no matter what
  if (byte === 0) {
    return 4
  } else if (implementsEIP2028(chainId)) {
    // If the byte is not 0 and EIP-2028 is implemented, then the cost is 16
    return 16
  } else {
    // If the byte is not 0 and EIP-2028 is not implemented, then the cost is 68
    return 68
  }
}

/**
 * Estimate the amount of gas that will be used by executing a batch of `EXECUTE` Merkle leaves
 * through the `ManagedService` contract. We use heuristics instead of the `eth_estimateGas` RPC
 * method, which is unacceptably slow for large deployments on local networks. The heuristic is the
 * sum of:
 *
 * 1. 21k, which is the cost of initiating a transaction on Ethereum.
 * 2. The transaction calldata, which is 16 gas per non-zero byte of calldata and 4 bytes per
 * zero-byte of calldata. There are some networks what the cost per non-zero byte is 68 because
 * they do not implement EIP-2028. We use the `getGasPerCalldata` function to handle this.
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
 * After summing these values, we include a buffer to ensure that the heuristic overestimates the
 * amount of gas. This ensures we don't underestimate the gas, which would otherwise be a concern
 * because we don't incorporate the cost of executing the `DELEGATECALL` on the `SphinxModuleProxy`,
 * or the cost of potentially returning data from the `exec` function on the `ManagedService`. This
 * buffer also makes our estimate closer to the value that would be returned by the
 * `eth_estimateGas` RPC method, which tends to overestimate the amount of gas.
 */
export const estimateGasViaManagedService: EstimateGas = (
  moduleAddress,
  batch,
  chainId
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
    .map((e) => getGasPerCalldata(e, chainId))
    .reduce((a, b) => a + b, 0)

  const managedServiceGas =
    0.00000191 * moduleCallData.length * moduleCallData.length +
    0.3789 * moduleCallData.length +
    10205.7165

  const estimate =
    21_000 + callDataGas + estimateModuleExecutionGas(batch) + managedServiceGas

  return Math.round(estimate * 1.08 + 40_000) // Include a buffer
}

/**
 * Estimate the amount of gas that will be used by executing a batch of `EXECUTE` Merkle leaves
 * directly on the `SphinxModuleProxy`. We use heuristics instead of the `eth_estimateGas` RPC
 * method, which is unacceptably slow for large deployments on local networks. The heuristic is the
 * sum of:
 *
 * 1. 21k, which is the cost of initiating a transaction on Ethereum.
 * 2. The transaction calldata, which is 16 gas per non-zero byte of calldata and 4 bytes per
 * zero-byte of calldata. There are some networks what the cost per non-zero byte is 68 because
 * they do not implement EIP-2028. We use the `getGasPerCalldata` function to handle this.
 * 3. The estimated cost of executing the logic in the `SphinxModule`.
 *
 * After summing these values, we include a buffer to ensure that the heuristic overestimates the
 * amount of gas. This ensures we don't underestimate the gas, which would otherwise be a concern
 * because we don't incorporate the cost of executing the `DELEGATECALL` on the `SphinxModuleProxy`.
 * This buffer also makes our estimate closer to the value that would be returned by the
 * `eth_estimateGas` RPC method, which tends to overestimate the amount of gas.
 */
export const estimateGasViaSigner: EstimateGas = (
  moduleAddress,
  batch,
  chainId
) => {
  const sphinxModuleIface = new ethers.Interface(SphinxModuleABI)

  const callDataHex = sphinxModuleIface.encodeFunctionData('execute', [batch])
  const callDataGas = ethers
    .getBytes(callDataHex)
    .map((e) => getGasPerCalldata(e, chainId))
    .reduce((a, b) => a + b, 0)

  const estimate = 21_000 + callDataGas + estimateModuleExecutionGas(batch)

  return Math.round(estimate * 1.08 + 40_000) // Include a buffer
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

export const handleStatus = (
  status: bigint,
  batches: SphinxLeafWithProof[][],
  receipts: ethers.TransactionReceipt[],
  failureAction: HumanReadableAction | undefined,
  spinner?: ora.Ora
) => {
  if (status === MerkleRootStatus.FAILED) {
    spinner?.fail(`Deployment failed.`)
    return { receipts, batches, finalStatus: status, failureAction }
  } else if (status === MerkleRootStatus.CANCELED) {
    spinner?.fail(`Deployment cancelled by user.`)
    return { receipts, batches, finalStatus: status }
  } else if (status === MerkleRootStatus.COMPLETED) {
    spinner?.succeed(`Deployment succeeded.`)
    return { receipts, batches, finalStatus: status }
  } else {
    throw new Error(`Unknown status: ${status}`)
  }
}

/**
 * We do not recommend using this function directly. We prefer to us the `attemptDeployment` function
 * below which is shared between the deploy command, propose command, simulation, and website backend.
 */
const executeDeployment = async (
  networkConfig: NetworkConfig,
  merkleTree: SphinxMerkleTree,
  ownerSignatures: Array<string>,
  deploymentContext: DeploymentContext
): Promise<{
  receipts: Array<ethers.TransactionReceipt>
  batches: Array<Array<SphinxLeafWithProof>>
  finalStatus: MerkleRootState['status']
  failureAction?: HumanReadableAction
}> => {
  const { chainId, executionMode, actionInputs } = networkConfig
  const { spinner, provider } = deploymentContext

  const humanReadableActions = {
    [chainId]: getReadableActions(actionInputs, chainId),
  }

  let estimateGas: EstimateGas
  let approveDeployment: ApproveDeployment
  let executeActions: ExecuteActions
  if (
    executionMode === ExecutionMode.LocalNetworkCLI ||
    executionMode === ExecutionMode.Platform
  ) {
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

  /**
   * Currently, this would fail if executed by the website backend. However, since we only support a specific
   * set of network on the website this cannot occur.
   *
   * Since this will never be executed on the website, we can safely assume `deploymentContext.wallet` will
   * always be defined.
   *
   * If/when we add support for deployments on arbitrary app rollups, we'll probably want to refactor this
   * so that it could be executed by the website. That way we could automatically deploy all the system contracts
   * on a new network as part of the first deployment on that network.
   *
   * Relevant ticket:
   * https://linear.app/chugsplash/issue/CHU-527/support-deploying-system-contracts-on-new-networks-from-the-website
   */
  if (!networkConfig.isSystemDeployed) {
    await ensureSphinxAndGnosisSafeDeployed(
      provider,
      deploymentContext.wallet!,
      executionMode,
      false,
      [],
      // We only include the spinner here if executing on a live network since the output is verbose and unnecessary
      // when deploying on local nodes.
      executionMode === ExecutionMode.LiveNetworkCLI ? spinner : undefined
    )
  }

  // Handle transferring funds to the safe.
  // `networkConfig.safeFundingRequest` may be undefined for configs generated
  // with previous Sphinx plugin versions that did not support transferring funds
  // to the safe.
  if (networkConfig.safeFundingRequest) {
    const safeBalance = await provider.getBalance(networkConfig.safeAddress)
    const { startingBalance, fundsRequested } = networkConfig.safeFundingRequest
    const requiredBalance = BigInt(startingBalance) + BigInt(fundsRequested)

    /**
     * If the Safe does not have the required funds, then trigger a transfer to it.
     *
     * Note that there is an edge case that is not covered here which may cause funds to be
     * transferred to the Safe multiple times:
     * 1. Propose a script for a safe that already has funds in it.
     * 2. After the proposal completes but before the deployment is executed, transfer funds
     * away from the Safe.
     * 3. Execute the deployment. If the execution times out at any point and the deployment
     * is retried, then funds may be transferred to the additional times.
     *
     * We don't address this edge case here because it is non-trivial to do in a reliable way
     * just by looking at the on-chain state. Instead, we rely on the websites implementation
     * of `deploymentContext.executeTransaction` to be idempotent on a per deployment basis.
     * So that even if the deployment times out and `deploymentContext.executeTransaction` is
     * called multiple times, it wont result in additional transfers because the website backend
     * still only sends a single transaction.
     *
     * This issue could still potentially occur in the deploy CLI command if/when we implement
     * retries for that command. I've documented this in the ticket to improve the deploy CLI
     * command:
     * https://linear.app/chugsplash/issue/CHU-447/implement-timeout-and-retry-logic-in-deploy-cli-command
     */
    if (safeBalance < requiredBalance) {
      await deploymentContext.executeTransaction(
        deploymentContext,
        {
          to: networkConfig.safeAddress,
          chainId: networkConfig.chainId,
          value: fundsRequested.toString(),
          data: '0x',
        },
        executionMode
      )
    }
  }

  const sphinxModuleReadOnly = new ethers.Contract(
    networkConfig.moduleAddress,
    SphinxModuleABI,
    deploymentContext.provider
  )

  const ethersReceipts: Array<ethers.TransactionReceipt> = []

  // The value for `isSafeDeployed` in the parsed config may be incorrect (if the deployment is being retried and
  // the safe was deployed in a previous attempt), we sanity check by checking if the contract exists at the expected
  // address.
  if (!networkConfig.initialState.isSafeDeployed) {
    if ((await provider.getCode(networkConfig.safeAddress)) === '0x') {
      spinner?.start(`Deploying Gnosis Safe and Sphinx Module...`)

      const gnosisSafeProxyFactory = new ethers.Contract(
        getGnosisSafeProxyFactoryAddress(),
        GnosisSafeProxyFactoryArtifact.abi
      )

      const gnosisSafeDeploymentData =
        gnosisSafeProxyFactory.interface.encodeFunctionData(
          'createProxyWithNonce',
          [
            getGnosisSafeSingletonAddress(),
            networkConfig.safeInitData,
            networkConfig.newConfig.saltNonce,
          ]
        )

      const gnosisSafeDeploymentReceipt =
        await deploymentContext.executeTransaction(
          deploymentContext,
          {
            to: getGnosisSafeProxyFactoryAddress(),
            data: gnosisSafeDeploymentData,
            chainId: deploymentContext.deployment.chainId,
          },
          executionMode
        )
      ethersReceipts.push(gnosisSafeDeploymentReceipt)

      spinner?.succeed(`Deployed Gnosis Safe and Sphinx Module.`)
    }
  }

  await deploymentContext.injectRoles(deploymentContext, executionMode)

  const approvalLeafWithProof = findLeafWithProof(
    merkleTree,
    SphinxLeafType.APPROVE,
    BigInt(networkConfig.chainId)
  )

  spinner?.start(`Checking deployment status...`)

  const merkleRootState: MerkleRootState =
    await sphinxModuleReadOnly.merkleRootStates(merkleTree.root)

  if (merkleRootState.status === MerkleRootStatus.EMPTY) {
    spinner?.succeed(`Deployment is new.`)
    spinner?.start(`Approving deployment...`)

    const approvalReceipt = await approveDeployment(
      merkleTree.root,
      approvalLeafWithProof,
      executionMode,
      ownerSignatures,
      deploymentContext
    )
    ethersReceipts.push(approvalReceipt)

    await deploymentContext.removeRoles(
      deploymentContext,
      networkConfig,
      executionMode
    )

    spinner?.succeed(`Approved deployment.`)
  } else if (merkleRootState.status !== MerkleRootStatus.APPROVED) {
    return handleStatus(
      merkleRootState.status,
      [],
      ethersReceipts,
      humanReadableActions[chainId.toString()][
        Number(merkleRootState.leavesExecuted) - 2
      ],
      spinner
    )
  } else {
    spinner?.succeed(`Deployment is already approved.`)
  }

  spinner?.start(`Executing deployment...`)

  const networkLeaves = merkleTree.leavesWithProofs.filter(
    (leaf) => leaf.leaf.chainId === BigInt(networkConfig.chainId)
  )
  const { status, failureAction, executionReceipts, batches } =
    await executeBatchActions(
      networkLeaves,
      sphinxModuleReadOnly,
      BigInt(networkConfig.blockGasLimit),
      humanReadableActions,
      executionMode,
      executeActions,
      estimateGas,
      deploymentContext
    )

  spinner?.succeed(`Executed deployment.`)
  spinner?.start(`Checking final deployment status...`)

  ethersReceipts.push(...executionReceipts)

  return handleStatus(status, batches, ethersReceipts, failureAction, spinner)
}

/**
 * @notice Sorts an array of hex strings in ascending order. This function mutates the array.
 */
export const sortSigners = (arr: Array<TreeSigner>): void => {
  arr.sort((a, b) => {
    const aBigInt = BigInt(a.signer)
    const bBigInt = BigInt(b.signer)

    if (aBigInt < bBigInt) {
      return -1
    } else if (aBigInt > bBigInt) {
      return 1
    } else {
      return 0
    }
  })
}

/**
 * This is a utility function that is helpful for recovering from a deployment that has timed out. It fetches
 * all the transaction receipts related to a deployment using the expected events and returns them. If this
 * function is used when some of the transaction receipts are already tracked, they can be passed in and this
 * function will return an array of all of the unique transactions.
 *
 * This function modifies the passed in `receipts` array.
 *
 * This function returns standard ethers.TransactionReceipt objects instead of our SphinxTransactionReceipt
 * type because that is more flexible and generally useful.
 */
export const fetchExecutionTransactionReceipts = async (
  receipts: ethers.TransactionReceipt[],
  moduleAddress: string,
  merkleRoot: string,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
) => {
  const module = new ethers.Contract(moduleAddress, SphinxModuleABI, provider)

  const SphinxMerkleRootApprovedFilter =
    module.filters.SphinxMerkleRootApproved(merkleRoot)
  const SphinxMerkleRootCanceledFilter =
    module.filters.SphinxMerkleRootCanceled(merkleRoot)
  const SphinxMerkleRootFailedFilter =
    module.filters.SphinxMerkleRootFailed(merkleRoot)
  const SphinxActionSucceededFilter =
    module.filters.SphinxActionSucceeded(merkleRoot)
  const SphinxActionFailedFilter = module.filters.SphinxActionFailed(merkleRoot)

  const filters = [
    SphinxMerkleRootApprovedFilter,
    SphinxMerkleRootCanceledFilter,
    SphinxMerkleRootFailedFilter,
    SphinxActionSucceededFilter,
    SphinxActionFailedFilter,
  ]

  const txHashes = receipts.map((r) => r.hash)

  const latestBlock = await provider.getBlockNumber()
  for (const filter of filters) {
    const startingBlock = latestBlock - 1999 > 0 ? latestBlock - 1999 : 0
    const events = await module.queryFilter(filter, startingBlock, latestBlock)

    for (const event of events) {
      const receipt = await provider.getTransactionReceipt(
        event.transactionHash
      )
      if (receipt && !txHashes.includes(receipt.hash)) {
        txHashes.push(receipt.hash)
        receipts.push(receipt)
      }
    }
  }

  return receipts
}

/**
 * This is the primary function used for executing deployments in the deploy command, propose command simulation,
 * and website backend. There is some logic in this function that may not be strictly necessary in all situations.
 *
 * We chose to reuse it in all situations because it is easier to maintain a single interface and because we want
 * to improve the chance that bugs will get caught during the initial proposal simulation step rather than occuring
 * when a deployment is actually happening on the website.
 *
 * The allow for this function to be reused in all three situations this function accepts a `deploymentContext` object
 * which implements all the logic that needs to be different in each of the three situations.
 *
 * We aim to *only* use the `deploymentContext` for logic which absolutely cannot be shared. For example, logic for
 * writing information about a deployment to the website backend is implemented in the `deploymentContext`.
 *
 * See documentation on the `DeploymentContext` type at the top of this file for more information of the specific fields
 * and justification for why the logic implemented in them cannot be shared.
 */
export const attemptDeployment = async (
  deploymentContext: DeploymentContext
): Promise<
  | {
      receipts: SphinxTransactionReceipt[]
      batches: SphinxLeafWithProof[][]
      finalStatus: BigInt
      failureAction: HumanReadableAction | undefined
    }
  | undefined
> => {
  const { deployment } = deploymentContext
  const networkName = deployment.networkName
  const deploymentId = deployment.id
  const deploymentConfig = deployment.deploymentConfig
  deploymentConfig.merkleTree.leavesWithProofs = toSphinxLeafWithProofArray(
    deploymentConfig.merkleTree.leavesWithProofs
  )
  const { merkleTree } = deploymentConfig
  const { logger } = deploymentContext
  const deploymentTransactionReceipts: ethers.TransactionReceipt[] = []

  logger?.info(`[Executor ${networkName}]: retrieving the deployment...`)

  deploymentContext.spinner?.start('Preparing for execution...')

  const targetNetworkNetworkConfig = deploymentConfig.networkConfigs.find(
    (config) => config.chainId === deployment.chainId.toString()
  )
  if (!targetNetworkNetworkConfig) {
    await deploymentContext.throwError(
      `[Executor ${networkName}]: Error could not find target network config. This should never happen please report it to the developers.`,
      deploymentId,
      networkName
    )
    return
  }

  // get active deployment ID for this project
  const moduleAddress = deployment.moduleAddress
  const sphinxModuleReadOnly = new ethers.Contract(
    moduleAddress,
    SphinxModuleABI,
    deploymentContext.provider
  )

  if ((await deploymentContext.provider.getCode(moduleAddress)) !== '0x') {
    const deploymentState = await sphinxModuleReadOnly.merkleRootStates(
      merkleTree.root
    )

    // We check that the deployment has been completed by looking at the real on chain state instead of relying
    // entirely on deploymentContext.deployment.status because we want the website to be able to recover from any
    // failure state including one where we failed to properly update information about the deployment in the DB
    // such as the current status of the deployment
    if (deploymentState.status === MerkleRootStatus.COMPLETED) {
      await deploymentContext.handleAlreadyExecutedDeployment(
        deploymentContext,
        targetNetworkNetworkConfig
      )

      return
    }
  }

  deploymentContext.spinner?.start('Execution ready')

  if (deployment.status === 'approved') {
    let receipts: ethers.TransactionReceipt[] = []
    let batches: SphinxLeafWithProof[][] = []
    let finalStatus: bigint
    let failureAction: HumanReadableAction | undefined
    // execute deployment
    try {
      const signers = deployment.treeSigners
      sortSigners(signers)
      const signatures: string[] = signers
        .map((signer) => signer.signature)
        .filter((signature) => signature !== null) as any

      ;({ receipts, batches, finalStatus, failureAction } =
        await executeDeployment(
          targetNetworkNetworkConfig,
          merkleTree,
          signatures,
          deploymentContext
        ))

      deploymentTransactionReceipts.push(...receipts)

      if (finalStatus !== MerkleRootStatus.COMPLETED) {
        await deploymentContext.handleExecutionFailure(
          deploymentContext,
          targetNetworkNetworkConfig,
          failureAction
        )
        return {
          receipts: deploymentTransactionReceipts.map(
            convertEthersTransactionReceipt
          ),
          batches,
          finalStatus,
          failureAction,
        }
      }
    } catch (e: any) {
      await deploymentContext.handleError(e, deployment)
      return
    }

    await deploymentContext.handleSuccess(
      deploymentContext,
      targetNetworkNetworkConfig
    )

    // If we make it to this point, we know that the executor has executed the deployment (or that it
    // has been cancelled by the owner).
    logger?.info(`[Executor ${networkName}]: execution successful`, {
      deploymentId,
    })

    return {
      receipts: deploymentTransactionReceipts.map(
        convertEthersTransactionReceipt
      ),
      batches,
      finalStatus,
      failureAction,
    }
  }
}

/**
 * An object that contains functions defined in this file. We use this object to mock its member
 * functions in tests. It's easiest to explain why this object is necessary through an example. Say
 * this object doesn't exist, and say we have a function `myFunction` that calls
 * `attemptDeployment`. To mock `attemptDeployment` when testing `myFunction`,
 * we'd write:
 * ```
 * import * as sphinxCore from '@sphinx-labs/core'
 * sinon.stub(sphinxCore, 'attemptDeployment')
 * ```
 * However, the above code will fail with the following error: "TypeError: Descriptor for property
 * attemptDeployment is non-configurable and non-writable".
 *
 * Then, say we introduce this object and we update `myFunction` to contain
 *  `sphinxCoreExecute.attemptDeployment`. We can sucessfully create the mock by writing:
 * ```
 * import { sphinxCoreExecute } from '@sphinx-labs/core'
 * sinon.stub(sphinxCoreExecute, 'attemptDeployment')
 *```
 */
export const sphinxCoreExecute = {
  attemptDeployment,
}
