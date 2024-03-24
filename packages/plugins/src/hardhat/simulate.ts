import { join } from 'path'
import { existsSync } from 'fs'

import {
  spawnAsync,
  getSphinxWalletPrivateKey,
  SphinxTransactionReceipt,
  ExecutionMode,
  MerkleRootStatus,
  SphinxJsonRpcProvider,
  fetchNameForNetwork,
  isFork,
  stripLeadingZero,
  isLiveNetwork,
  fundAccountMaxBalance,
  signMerkleRoot,
  Deployment,
  DeploymentConfig,
  DeploymentContext,
  HumanReadableAction,
  executeTransactionViaSigner,
  getSphinxWalletsSortedByAddress,
  injectRoles,
  removeRoles,
  fetchNetworkConfigFromDeploymentConfig,
  NetworkConfig,
  fetchExecutionTransactionReceipts,
  convertEthersTransactionReceipt,
  convertEthersTransactionResponse,
  SphinxTransactionResponse,
  compileAndExecuteDeployment,
  callWithTimeout,
  sleep,
  isPublicAsyncMethod,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import {
  FALLBACK_MAX_REORG,
  getLargestPossibleReorg,
} from 'hardhat/internal/hardhat-network/provider/utils/reorgs-protection'
import pLimit from 'p-limit'

export type SimulationTransactions = Array<{
  receipt: SphinxTransactionReceipt
  response: SphinxTransactionResponse
}>

/**
 * @property maxAttempts - The maximum number of attempts that Sphinx will make for a single network
 * request before throwing an error.
 * @property timeout - The maximum number of time that Sphinx will wait for a single RPC request
 * before timing out. An RPC request can stall if the RPC provider has degraded service, which would
 * cause the simulation to stall indefinitely if we don't time out. We set this value to be
 * relatively high because the execution process may submit very large transactions (specifically
 * transactions with `EXECUTE` Merkle leaves), which can cause the RPC request to be slow. We also
 * set it high because the Hardhat provider appears to make a few retries (in
 * `hardhat/internal/core/providers/http.ts`), which can contribute to the duration of a single RPC
 * call sent from our provider proxy.
 */
export const simulationConstants = {
  maxAttempts: 10,
  timeout: 150_000,
}

/**
 * These arguments are passed into the Hardhat subtask that simulates a user's deployment. There
 * can't be any functions as arguments because we pass them into a child process. There also
 * shouldn't be any fields that contain BigInts because we call `JSON.parse` to decode the data
 * returned by the subtask. (`JSON.parse` converts BigInts to strings).
 *
 * @property {Array<NetworkConfig>} networkConfigArray The NetworkConfig on all networks. This is
 * necessary to create the entire Merkle tree in the simulation, which ensures we use the same
 * Merkle root in both the simulation and the production environment.
 */
export type simulateDeploymentSubtaskArgs = {
  deploymentConfig: DeploymentConfig
  chainId: string
}

/**
 * Simulate a deployment on a fork of the target network. We use Hardhat instead of Foundry to run
 * the simulation for two reasons:
 *
 * 1. Running the simulation with Hardhat allows us to reuse the TypeScript logic that executes the
 * deployment in production. If we use Foundry, we'd need to rewrite all of this logic in
 * Solidity. Also, adding complex Solidity logic to the Sphinx plugin contracts can lead to
 * unpredictable IR compilation failures.
 *
 * 2. Running the simulation with Hardhat allows us to accurately calculate the gas used by the
 * deployment, which determines the estimated cost that we provide to the user. The estimate is
 * more accurate with Hardhat because we're able to use the `gasUsed` field of the transaction
 * receipts instead of relying on the `gas` field of Foundry's transaction responses. The latter
 * gives estimates that are anywhere between 35-55% higher than the actual gas used because it
 * uses `eth_estimateGas` under the hood.
 *
 * 3. It's non-trivial to pass a very large Merkle tree from TypeScript to Foundry. Particularly,
 * `spawn` is prone to input size limits, and EthersJS can't ABI encode extremely large amounts
 * of data (i.e. it'll fail for a Merkle tree that contains 250 contract deployments, where the
 * contract is near the maximum size limit).
 */
export const simulate = async (
  deploymentConfig: DeploymentConfig,
  chainId: string,
  rpcUrl: string
): Promise<{
  receipts: Array<SphinxTransactionReceipt>
}> => {
  const rootPluginPath =
    process.env.DEV_FILE_PATH ?? join('node_modules', '@sphinx-labs', 'plugins')

  const provider = new SphinxJsonRpcProvider(rpcUrl)

  const networkConfig = fetchNetworkConfigFromDeploymentConfig(
    BigInt(chainId),
    deploymentConfig
  )

  const expectedHardhatConfigPath = join(
    rootPluginPath,
    'dist',
    'hardhat.config.js'
  )

  if (!existsSync(expectedHardhatConfigPath)) {
    throw new Error(
      'Failed to locate simulation configuration. This is a bug, please report it to the developers'
    )
  }

  const envVars = {
    SPHINX_INTERNAL__FORK_URL: rpcUrl,
    SPHINX_INTERNAL__CHAIN_ID: chainId,
    SPHINX_INTERNAL__BLOCK_GAS_LIMIT: networkConfig.blockGasLimit,
    // We must set the Hardhat config using an environment variable so that Hardhat recognizes the
    // Hardhat config when we import the HRE in the child process.
    HARDHAT_CONFIG: expectedHardhatConfigPath,
  }

  const taskParams: simulateDeploymentSubtaskArgs = {
    deploymentConfig,
    chainId,
  }

  if ((await isLiveNetwork(provider)) || (await isFork(provider))) {
    // Use the block number from the Forge script minus the largest possible chain reorg size, which
    // is determined by Hardhat. We must subtract the reorg size so that Hardhat caches the RPC
    // calls in the simulation. Otherwise, Hardhat will send hundreds of RPC calls, which frequently
    // causes rate limit errors, especially for public or free tier RPC endpoints.
    //
    // Subtracting the reorg size can lead to the following edge case:
    // 1. User executes a transaction on the live network.
    // 2. User calls Sphinx's Propose or Deploy command using a script that relies on the state that
    //    resulted from the transaction in the previous step.
    // 3. The collection process works correctly because Foundry uses the latest block number.
    // 4. The simulation uses a block where the transaction doesn't exist yet, causing an error.
    //
    // This edge case is unlikely to happen in practice because the reorg size is pretty small. For
    // example, it's 5 blocks on Ethereum, and 30 blocks on most other networks. A reorg size of 30
    // blocks corresponds to 15 minutes on Rootstock, which is one of the slowest networks that
    // Sphinx supports as of now. If the edge case occurs, it will naturally resolve itself if the
    // user continues to attempt to propose/deploy. This is because the corresponding block will
    // eventually be included in the simulation after there have been enough block confirmations.
    const blockNumber =
      BigInt(networkConfig.blockNumber) - BigInt(getLargestReorg(chainId))
    envVars['SPHINX_INTERNAL__BLOCK_NUMBER'] = blockNumber.toString()
  } else {
    // The network is a non-forked local node (i.e. an Anvil or Hardhat node with a fresh state). We
    // do not hardcode the block number in the Hardhat config to avoid the following edge case:
    // 1. Say we create an Anvil node with Ethereum's chain ID: `anvil --chain-id 1`. The block
    //    number will be extremely low on this network (i.e. less than 100). This is standard
    //    behavior for Anvil nodes.
    // 2. Hardhat detects that the block number is extremely low and throws an error because the
    //    block number corresponds to a hardfork that's too early to be supported. Here's the thrown
    //    error:
    //    https://github.com/NomicFoundation/hardhat/blob/caa504fe0e53c183578f42d66f4740b8ec147051/packages/hardhat-core/src/internal/hardhat-network/provider/node.ts#L305-L309
    //
    // Some notes about this edge case:
    // 1. We only ran into this error when creating an Anvil node with Ethereum's chain ID, but it
    //    may also occur on other popular networks.
    // 2. We attempted to resolve this error by specifying the desired hardfork in the Hardhat
    //    config's `hardfork` option as well as its `chains.hardforkHistory` option. Neither
    //    resolved this error.
    // 3. This error is only thrown when hardcoding the block number in the Hardhat config. When we
    //    don't hardcode it, Hardhat uses the default hardfork, which is the behavior we want.

    // Fast forward the block number. This is necessary to prevent the following edge case:
    // 1. Some transactions are executed on the local network. These transactions could either be
    //    sent by the Sphinx team (during testing) or by the user during local development.
    // 2. The Deploy CLI command is executed, which creates a simulation using a block that's
    //    multiple confirmations behind the latest block. This is Hardhat's default behavior, which
    //    is meant to protect against chain reorgs on forks of live networks.
    // 3. The simulation fails because the transactions executed in step 1 don't exist on the
    //    Hardhat fork.
    const blocksToFastForward = getLargestReorg(chainId)
    const blocksHex = stripLeadingZero(ethers.toBeHex(blocksToFastForward))
    await provider.send(
      'hardhat_mine', // The `hardhat_mine` RPC method works on Anvil and Hardhat nodes.
      [blocksHex]
    )
  }

  const hardhatRunnerPath = join(
    rootPluginPath,
    'dist',
    'hardhat',
    'hardhatRunner.js'
  )
  // Execute the simulation in a child process. We don't run the simulation in the
  // current process to prevent the following edge case that was discovered in Sphinx's test suite.
  // First, some context: When Hardhat creates an in-process node that forks a standalone Anvil
  // node, the Hardhat node listens to the Anvil port from the process in which the Hardhat node is
  // created. In other words, if we create the Hardhat node in the current process and then call
  // `lsof -t -i:<ANVIL_PORT>`, one of the returned PIDs will be the current PID (i.e.
  // `process.pid`). Then, if we attempt to run `kill $(lsof -t -i:<ANVIL_PORT>)`, the current
  // process will exit with a mysterious `SIGTERM` error. This issue caused Sphinx's test suite to
  // exit early because we kill Anvil nodes after some test cases complete. It's possible
  // (although unlikely) that this same situation could happen in a user's test suite. We resolve
  // this by creating the Hardhat node in a child process via `spawnAsync`. This child process exits
  // when `spawnAsync` returns.
  const { stdout, stderr, code } = await spawnAsync(
    'node',
    [hardhatRunnerPath],
    envVars,
    JSON.stringify(taskParams)
  )

  if (code !== 0) {
    const networkName = fetchNameForNetwork(BigInt(chainId))
    let errorMessage: string = `Simulation failed for ${networkName} at block number ${networkConfig.blockNumber}.`
    try {
      // Attempt to decode the error message. This try-statement could theoretically throw an error
      // if `stdout` isn't a valid JSON string.
      const error = JSON.parse(stdout)

      // If the stack trace includes the error message, we only use the stack trace so that we don't
      // display the error reason twice.
      if (
        typeof error.stack === 'string' &&
        error.stack.includes(error.message)
      ) {
        errorMessage += `\n\n${error.stack}`
      } else {
        // Display both the error message and the stack trace.
        errorMessage += `\n\n${error.message}\n\n${error.stack}`
      }
    } catch {
      // An error occurred while attempting to decode `stdout` into an error message. We'll display
      // the raw `stdout` to the user in case it's useful.
      errorMessage += `\n\n${stdout}`
    }
    throw new Error(errorMessage)
  }

  /**
   * Occasionally an unexpected error can cause stdout to not conform to JSON format. This should never
   * happen, but if it does we will error when attempting to parse stdout. So we use a try catch here
   * and exit with the real value of stdout if an error occurs.
   */
  try {
    const receipts = JSON.parse(stdout).receipts
    return { receipts }
  } catch (e) {
    console.log(stdout)
    console.error(stderr)
    process.exit(1)
  }
}

export const setupPresimulationState = async (
  provider: any,
  executionMode: ExecutionMode
) => {
  let signer: ethers.Wallet
  if (executionMode === ExecutionMode.LiveNetworkCLI) {
    const privateKey = process.env.PRIVATE_KEY
    if (!privateKey) {
      throw new Error(`Could not find 'PRIVATE_KEY' environment variable.`)
    }
    signer = new ethers.Wallet(privateKey, provider)
  } else if (
    executionMode === ExecutionMode.LocalNetworkCLI ||
    executionMode === ExecutionMode.Platform
  ) {
    signer = new ethers.Wallet(getSphinxWalletPrivateKey(0), provider)
    await fundAccountMaxBalance(signer.address, provider)
  } else {
    throw new Error(`Unknown execution mode.`)
  }

  return signer
}

/**
 * Fetches the transaction response objects for all of the transactions in the simulation. There's some additional
 * data in the responses that is not in the receipts (data, value, etc) which is not available in the receipts. We
 * use this information to calculate deployment cost estimates on the website.
 */
export const fetchTransactionResponses = async (
  receipts: Array<SphinxTransactionReceipt>,
  provider: HardhatEthersProvider
): Promise<SimulationTransactions> => {
  const chainId = (await provider.getNetwork()).chainId

  // Since the size of receipts array is unbounded, we use pLimit to reduce the number of simultaneous calls.
  // This reduces the chance of us triggering a rate limit in the RPC provider.
  const limit = pLimit(5)
  const transactions = await Promise.all(
    receipts.map(async (receipt) => {
      const response = await limit(async () =>
        provider.getTransaction(receipt.hash)
      )
      const sphinxResponse = convertEthersTransactionResponse(
        response,
        chainId.toString()
      )

      return {
        receipt,
        response: sphinxResponse,
      }
    })
  )

  return transactions
}

/**
 * A Hardhat subtask that simulates a deployment against a forked Hardhat node. We need to load the
 * Hardhat Runtime Environment (HRE) because Hardhat doesn't document any lower-level functionality
 * for running a fork. We could theoretically interact with lower-level components, but this would
 * be brittle because Hardhat could change their internal functionality in a future minor or patch
 * version.
 */
export const simulateDeploymentSubtask = async (
  taskArgs: simulateDeploymentSubtaskArgs,
  hre: any
): Promise<{ receipts: Array<SphinxTransactionReceipt> }> => {
  // Wrap the Hardhat provider with a Proxy, which implements retry and timeout logic.
  const provider = createHardhatEthersProviderProxy(hre.ethers.provider)

  const { deploymentConfig, chainId } = taskArgs
  const { merkleTree } = deploymentConfig

  const networkConfig = fetchNetworkConfigFromDeploymentConfig(
    BigInt(chainId),
    deploymentConfig
  )

  const { executionMode } = networkConfig

  const signer = await setupPresimulationState(provider, executionMode)

  // Create a list of auto-generated wallets. We'll later add these wallets as Gnosis Safe owners.
  const sphinxWallets = getSphinxWalletsSortedByAddress(
    BigInt(networkConfig.newConfig.threshold),
    provider
  )
  const treeSigners = await Promise.all(
    sphinxWallets.map(async (wallet) => {
      return {
        signer: await wallet.getAddress(),
        signature: await signMerkleRoot(merkleTree.root, wallet),
      }
    })
  )

  let receipts: Array<SphinxTransactionReceipt> | undefined
  const deployment: Deployment = {
    id: 'only required on website',
    multichainDeploymentId: 'only required on website',
    projectId: 'only required on website',
    chainId: networkConfig.chainId,
    status: 'approved',
    moduleAddress: networkConfig.moduleAddress,
    safeAddress: networkConfig.safeAddress,
    deploymentConfig,
    networkName: fetchNameForNetwork(BigInt(networkConfig.chainId)),
    treeSigners,
  }
  const simulationContext: DeploymentContext = {
    throwError: (message: string) => {
      throw new Error(message)
    },
    handleError: (e) => {
      throw e
    },
    handleAlreadyExecutedDeployment: async (deploymentContext) => {
      receipts = (
        await fetchExecutionTransactionReceipts(
          [],
          deploymentContext.deployment.moduleAddress,
          deploymentContext.deployment.deploymentConfig.merkleTree.root,
          deploymentContext.provider
        )
      ).map(convertEthersTransactionReceipt)
    },
    handleExecutionFailure: (
      _deploymentContext: DeploymentContext,
      _networkConfig: NetworkConfig,
      failureReason: HumanReadableAction
    ) => {
      throw new Error(
        `The following action reverted during the simulation:\n${failureReason.reason}`
      )
    },
    handleSuccess: async () => {
      /* */
    },
    executeTransaction: executeTransactionViaSigner,
    deployment,
    provider,
    injectRoles,
    removeRoles,
    wallet: signer,
  }

  const result = await compileAndExecuteDeployment(simulationContext)

  if (!result) {
    throw new Error(
      'Simulation failed for an unexpected reason. This is a bug. Please report it to the developers.'
    )
  }

  const { finalStatus, failureAction } = result
  receipts = result.receipts

  if (!receipts) {
    throw new Error(
      'Simulation failed for an unexpected reason. This is a bug. Please report it to the developers.'
    )
  }

  if (finalStatus === MerkleRootStatus.FAILED) {
    if (failureAction) {
      throw new Error(
        `The following action reverted during the simulation:\n${failureAction.reason}`
      )
    } else {
      throw new Error(`An action reverted during the simulation.`)
    }
  }

  return {
    receipts,
  }
}

/**
 * Create a Proxy that wraps a `HardhatEthersProvider` to implement retry and timeout logic, which
 * isn't robust in the native provider.
 *
 * This function uses a linear backoff strategy for retries. We use a multiple of 2, and start with
 * a backoff period of two seconds.
 *
 * This function uses the `evm_snapshot` and `evm_revert` RPC methods to prevent a 'nonce too low'
 * bug caused by the Hardhat simulation (context: https://github.com/sphinx-labs/sphinx/pull/1565).
 * The fact that we use these RPC methods means that an edge case could occur:
 * 1. Say we simultaneously submit state-changing transactions from Account A and Account B (e.g. via
 * `Promise.all`).
 * 2. Say the transaction from Account A reverts but the transaction from Account B finalizes. We'll
 * call 'evm_revert' in the transaction for Account A, potentially causing the transaction from
 * Account B to be undone.
 *
 * This edge case currently isn't an issue because we don't parallelize state-changing transactions
 * in the execution process.
 */
export const createHardhatEthersProviderProxy = (
  ethersProvider: HardhatEthersProvider
): HardhatEthersProvider => {
  const proxy = new Proxy(ethersProvider, {
    get: (target, prop) => {
      return (...args: any[]) => {
        // Return the result directly if the method isn't asynchronous.
        if (!isPublicAsyncMethod(ethersProvider, prop)) {
          return target[prop](...args)
        }

        // A helper function that implements the timeout and retry logic for asynchronous calls to
        // the Hardhat provider.
        const invokeWithRetryAndSnapshot = async () => {
          // We don't allow the 'hardhat_reset' RPC method to avoid an infinite loop bug caused by
          // Hardhat. More context is in this pull request description:
          // https://github.com/sphinx-labs/sphinx/pull/1565
          if (args.length > 0 && args[0] === 'hardhat_reset') {
            throw new Error('hardhat_reset no')
          }

          let snapshotId: string
          for (
            let attempt = 0;
            attempt < simulationConstants.maxAttempts;
            attempt++
          ) {
            // Create a snapshot of the Hardhat node state. We may revert to this snapshot later in
            // this function to prevent a 'nonce too low' bug in Hardhat. We must queue the snapshot
            // before calling `target[prop](...args)` to avoid this nonce bug.
            //
            // More info on the nonce error is in this pull request description:
            // https://github.com/sphinx-labs/sphinx/pull/1565.
            //
            // This RPC method is outside of the try...catch statement below because this call
            // should never error, so if it does, it'd preferable to throw the error immediately.
            snapshotId = await target.send('evm_snapshot', [])

            try {
              // Forward the call to the Hardhat provider. We include a timeout to ensure that an
              // RPC provider with degraded service doesn't cause this call to hang indefinitely.
              // See this pull request description for more info:
              // https://github.com/sphinx-labs/sphinx/pull/1565

              const result = await callWithTimeout(
                target[prop](...args),
                simulationConstants.timeout,
                'stalled'
              )

              if (prop === 'getSigner') {
                // By default, the `HardhatEthersProxy.getSigner` method returns a signer connected
                // to the `HardhatEthersProvider` instead of this Proxy, which prevents our timeout
                // and retry logic from being used when the signer executes transactions. To avoid
                // this, we set the signer's provider to be the current Proxy instance.
                return (result as ethers.Signer).connect(proxy)
              } else {
                return result
              }
            } catch (error) {
              // The most likely reason that the call failed is a rate limit.

              // NOTE: Don't include any RPC calls to the remote node in this 'catch' block because
              // they may stall indefinitely if the user's RPC provider has degraded service. It's
              // safe to call RPC methods that begin with 'evm_' or 'hardhat_' because these
              // shouldn't be sent to the remote node, so there shouldn't be a risk of a rate limit
              // occurring for these calls.

              // We revert the Hardhat node state to ensure that there weren't any local state
              // changes made by the failed RPC request. There should be no state changes because
              // the call threw an error. This is a precaution against the "nonce too low" error,
              // which is described in this pull request description:
              // https://github.com/sphinx-labs/sphinx/pull/1565
              const success = await target.send('evm_revert', [snapshotId])
              if (!success) {
                throw new Error(`Failed to call 'evm_revert'.`)
              }

              // Pass the error up if we're out of attempts.
              if (attempt === simulationConstants.maxAttempts - 1) {
                throw error
              }

              // We use linear backoff starting at 2 seconds. This serves as a cooldown period
              // for rate limit errors.
              const sleepTime = 2 * (attempt + 1) * 1000
              await sleep(sleepTime)
            }
          }
        }

        // Return a thenable promise for asynchronous calls, which ensures that the asynchronous
        // operations in `invokeWithRetryAndSnapshot` occur after the asynchronous method call is
        // awaited.
        return Promise.resolve({
          then: (resolve, reject) => {
            ;(async () => {
              try {
                const result = await invokeWithRetryAndSnapshot()
                resolve(result)
              } catch (error) {
                reject(error)
              }
            })()
          },
        })
      }
    },
  })
  return proxy
}

const getLargestReorg = (chainId: string): bigint => {
  return getLargestPossibleReorg(Number(chainId)) ?? FALLBACK_MAX_REORG
}

export const getUndeployedContractErrorMesage = (address: string): string =>
  `Simulation succeeded, but the following contract wasn't deployed at its expected address:\n` +
  address
