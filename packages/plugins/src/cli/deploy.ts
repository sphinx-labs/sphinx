import { join, relative } from 'path'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'

// TODO(end): rm
Error.stackTraceLimit = Infinity

import {
  displayDeploymentTable,
  fundAccountMaxBalance,
  getSphinxWalletPrivateKey,
  isFile,
  readDeploymentArtifactsForNetwork,
  signMerkleRoot,
  spawnAsync,
} from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import {
  getPreview,
  getPreviewString,
  SphinxPreview,
  makeDeploymentData,
  makeDeploymentArtifacts,
  DeploymentConfig,
  makeDeploymentConfig,
  verifyDeploymentWithRetries,
  SphinxTransactionReceipt,
  ExecutionMode,
  ConfigArtifacts,
  checkSystemDeployed,
  writeDeploymentArtifacts,
  isLegacyTransactionsRequiredForNetwork,
  MAX_UINT64,
  attemptDeployment,
  Deployment,
  fetchNameForNetwork,
  DeploymentContext,
  HumanReadableAction,
  executeTransactionViaSigner,
  InjectRoles,
  RemoveRoles,
  injectRoles,
  removeRoles,
  NetworkConfig,
  DeploymentArtifacts,
  ensureSphinxAndGnosisSafeDeployed,
  simulateExecution,
} from '@sphinx-labs/core'
import { red } from 'chalk'
import ora from 'ora'
import { ethers } from 'ethers'
import { SphinxMerkleTree, makeSphinxMerkleTree } from '@sphinx-labs/contracts'

import {
  assertNoLinkedLibraries,
  assertValidVersions,
  compile,
  getInitCodeWithArgsArray,
  getSphinxConfigFromScript,
  parseScriptFunctionCalldata,
  readInterface,
  writeSystemContracts,
} from '../foundry/utils'
import { getFoundryToml } from '../foundry/options'
import { decodeDeploymentInfo, makeNetworkConfig } from '../foundry/decode'
import { simulate } from '../hardhat/simulate'
import { SphinxContext } from './context'

export interface DeployArgs {
  scriptPath: string
  network: string
  skipPreview: boolean
  silent: boolean
  sphinxContext: SphinxContext
  verify: boolean
  targetContract?: string
  sig?: Array<string>
}

export const deploy = async (
  args: DeployArgs
): Promise<{
  deploymentConfig?: DeploymentConfig
  merkleTree?: SphinxMerkleTree
  preview?: ReturnType<typeof getPreview>
  receipts?: Array<SphinxTransactionReceipt>
  configArtifacts?: ConfigArtifacts
  deploymentArtifacts?: DeploymentArtifacts
}> => {
  // if (!process.env.LABEL) {
  //   throw new Error(`Include a LABEL env var.`)
  // }

  const {
    network,
    skipPreview,
    silent,
    sphinxContext,
    verify,
    targetContract,
  } = args
  const sig = args.sig === undefined ? ['run()'] : args.sig

  const projectRoot = process.cwd()

  // Normalize the script path to be in the format "path/to/file.sol". This isn't strictly
  // necessary, but we're less likely to introduce a bug if it's always in the same format.
  const scriptPath = relative(projectRoot, args.scriptPath)

  if (!isFile(scriptPath)) {
    throw new Error(
      `File does not exist at: ${scriptPath}\n` +
        `Please make sure this is a valid file path.`
    )
  }

  /**
   * Run the compiler. It's necessary to do this before we read any contract interfaces.
   * We request the build info here which we need to build info to generate the compiler
   * config.
   *
   * We do not force recompile here because the user may have a custom compilation pipeline
   * that yields additional artifacts which the standard forge compiler does not.
   */
  compile(
    silent,
    false, // Do not force recompile
    true // Generate build info
  )

  const scriptFunctionCalldata = await parseScriptFunctionCalldata(sig)

  const spinner = ora({ isSilent: silent })
  spinner.start(`Collecting transactions...`)

  const foundryToml = await getFoundryToml()
  const {
    artifactFolder,
    buildInfoFolder,
    cachePath,
    rpcEndpoints,
    etherscan,
  } = foundryToml

  await assertValidVersions(scriptPath, targetContract)

  const forkUrl = rpcEndpoints[network]
  if (!forkUrl) {
    console.error(
      red(
        `No RPC endpoint specified in your foundry.toml for the network: ${network}.`
      )
    )
    process.exit(1)
  }

  // If the verification flag is specified, then make sure there is an etherscan configuration for the target network
  if (verify) {
    if (!etherscan || !etherscan[network]) {
      console.error(
        red(
          `No etherscan configuration detected for ${network}. Please configure it in your foundry.toml file:\n` +
            `[etherscan]\n` +
            `${network} = { key = "<your api key>" }`
        )
      )
      process.exit(1)
    }
  }

  const provider = new SphinxJsonRpcProvider(forkUrl)

  const [isLiveNetwork, { chainId }] = await Promise.all([
    sphinxContext.isLiveNetwork(provider),
    provider.getNetwork(),
  ])

  // We must load any ABIs after compiling the contracts to prevent a situation where the user
  // clears their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxPluginTypesInterface = readInterface(
    artifactFolder,
    'SphinxPluginTypes'
  )

  const getConfigArtifacts = sphinxContext.makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    projectRoot,
    cachePath
  )

  const deploymentInfoPath = join(cachePath, 'sphinx-deployment-info.txt')

  // Remove the existing DeploymentInfo file if it exists. This ensures that we don't accidentally
  // use a file from a previous deployment.
  if (existsSync(deploymentInfoPath)) {
    unlinkSync(deploymentInfoPath)
  }

  const systemContractsFilePath = writeSystemContracts(
    sphinxPluginTypesInterface,
    foundryToml.cachePath
  )

  // We fetch the block number ahead of time and store it in the deploymentInfo, so that we can use the
  // exact same block number during the simulation phase. We have to do this using a call to the provider
  // instead of using `block.number` within forge b/c some networks have odd changes to what `block.number`
  // means. For example, on Arbitrum` `block.number` returns the block number on ETH instead of Arbitrum.
  // This could cause the simulation to use an invalid block number and fail.
  const blockNumber = await provider.getBlockNumber()

  const executionMode = isLiveNetwork
    ? ExecutionMode.LiveNetworkCLI
    : ExecutionMode.LocalNetworkCLI
  const forgeScriptCollectArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxCollectDeployment(bytes,uint8,string,string)',
    scriptFunctionCalldata,
    executionMode.toString(),
    deploymentInfoPath,
    systemContractsFilePath,
    '--rpc-url',
    forkUrl,
    '--always-use-create-2-factory',
  ]
  if (
    isLegacyTransactionsRequiredForNetwork(
      (await provider.getNetwork()).chainId
    )
  ) {
    forgeScriptCollectArgs.push('--legacy')
  }
  if (targetContract) {
    forgeScriptCollectArgs.push('--target-contract', targetContract)
  }

  const { safeAddress } = await getSphinxConfigFromScript(
    scriptPath,
    sphinxPluginTypesInterface,
    targetContract,
    spinner
  )

  // Collect the transactions.
  const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs, {
    // Set the block gas limit to the max amount allowed by Foundry. This overrides lower block
    // gas limits specified in the user's `foundry.toml`, which can cause the script to run out of
    // gas. We use the `FOUNDRY_BLOCK_GAS_LIMIT` environment variable because it has a higher
    // priority than `DAPP_BLOCK_GAS_LIMIT`.
    FOUNDRY_BLOCK_GAS_LIMIT: MAX_UINT64.toString(),
    ETH_FROM: safeAddress,
    // We specify build info to be false so that calling the script does not cause the users entire
    // project to be rebuilt if they have `build_info=true` defined in their foundry.toml file.
    // We do need the build info, but that is generated when we compile at the beginning of the script.
    FOUNDRY_BUILD_INFO: 'false',
  })

  if (spawnOutput.code !== 0) {
    spinner.stop()
    // The `stdout` contains the trace of the error.
    console.log(spawnOutput.stdout)
    // The `stderr` contains the error message.
    console.log(spawnOutput.stderr)
    process.exit(1)
  }

  const serializedDeploymentInfo = readFileSync(deploymentInfoPath, 'utf-8')
  const deploymentInfo = decodeDeploymentInfo(
    serializedDeploymentInfo,
    sphinxPluginTypesInterface,
    blockNumber
  )

  spinner.succeed(`Collected transactions.`)
  spinner.start(`Building deployment...`)

  let signer: ethers.Wallet
  let inject: InjectRoles
  let remove: RemoveRoles
  if (executionMode === ExecutionMode.LiveNetworkCLI) {
    const privateKey = process.env.PRIVATE_KEY
    // Check if the private key exists. It should always exist because we checked that it's defined
    // when we collected the transactions in the user's Forge script.
    if (!privateKey) {
      throw new Error(`Could not find 'PRIVATE_KEY' environment variable.`)
    }
    signer = new ethers.Wallet(privateKey, provider)

    // We use no role injection when deploying on the live network since that obviously would not work
    inject = async () => {
      return
    }
    remove = async () => {
      return
    }
  } else if (executionMode === ExecutionMode.LocalNetworkCLI) {
    signer = new ethers.Wallet(getSphinxWalletPrivateKey(0), provider)
    await fundAccountMaxBalance(signer.address, provider)

    // We use the same role injection as the simulation for local network deployments so that they
    // work even without the need for keys for all Safe signers
    inject = injectRoles
    // We need to remove the injected owners after successfully deploying on a local node
    remove = removeRoles
  } else {
    throw new Error(`Unknown execution mode.`)
  }

  const initCodeWithArgsArray = getInitCodeWithArgsArray(
    deploymentInfo.accountAccesses
  )
  const { configArtifacts, buildInfos } = await getConfigArtifacts(
    initCodeWithArgsArray
  )

  await assertNoLinkedLibraries(
    scriptPath,
    foundryToml.cachePath,
    foundryToml.artifactFolder,
    projectRoot,
    targetContract
  )

  const isSystemDeployed = await checkSystemDeployed(provider)

  await ensureSphinxAndGnosisSafeDeployed(
    provider,
    signer,
    ExecutionMode.LocalNetworkCLI,
    false
  )

  const networkConfig = makeNetworkConfig(
    deploymentInfo,
    isSystemDeployed,
    configArtifacts,
    [] // We don't currently support linked libraries.
  )

  if (networkConfig.actionInputs.length === 0) {
    spinner.info(`Nothing to deploy. Exiting early.`)
    return {}
  }

  // TODO(later-later): consider removing b/c it may not be worth the trouble for the deploy
  // command. e.g. we'll need to account for anvil nodes, and the user may have a bad RPC URL.
  await simulateExecution(networkConfig, provider)

  await ensureSphinxAndGnosisSafeDeployed(
    provider,
    signer,
    ExecutionMode.LocalNetworkCLI,
    false
  )

  const deploymentData = makeDeploymentData([networkConfig])

  const merkleTree = makeSphinxMerkleTree(deploymentData)

  const deploymentConfig = makeDeploymentConfig(
    [networkConfig],
    configArtifacts,
    buildInfos,
    merkleTree
  )

  await simulate(deploymentConfig, chainId.toString(), forkUrl)

  spinner.succeed(`Built deployment.`)

  let preview: SphinxPreview | undefined
  if (skipPreview) {
    spinner.info(`Skipping preview.`)
  } else {
    preview = getPreview([networkConfig])
    spinner.stop()
    const previewString = getPreviewString(preview, true)
    await sphinxContext.prompt(previewString)
  }

  const treeSigner = {
    signer: signer.address,
    signature: await signMerkleRoot(merkleTree.root, signer),
  }
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
    treeSigners: [treeSigner],
  }
  const deploymentContext: DeploymentContext = {
    throwError: (message: string) => {
      throw new Error(message)
    },
    handleError: (e) => {
      throw e
    },
    handleAlreadyExecutedDeployment: () => {
      throw new Error(
        'Deployment has already been executed. This is a bug. Please report it to the developers.'
      )
    },
    handleExecutionFailure: (
      _deploymentContext: DeploymentContext,
      _networkConfig: NetworkConfig,
      failureReason: HumanReadableAction
    ) => {
      throw new Error(
        `The following action reverted during the execution:\n${failureReason.reason}`
      )
    },
    handleSuccess: async () => {
      return
    },
    executeTransaction: executeTransactionViaSigner,
    injectRoles: inject,
    removeRoles: remove,
    deployment,
    wallet: signer,
    provider,
    spinner,
  }
  const result = await attemptDeployment(deploymentContext)

  if (!result) {
    throw new Error(
      'Simulation failed for an unexpected reason. This is a bug. Please report it to the developers.'
    )
  }

  const { receipts } = result

  spinner.start(`Building deployment artifacts...`)

  const { projectName } = networkConfig.newConfig

  // Get the existing contract deployment artifacts and execution artifacts for the current network.
  // This object will potentially be modified when we make the new deployment artifacts.
  // Specifically, the `history` field of the contract deployment artifacts could be modified. Even
  // though we don't currently modify the execution artifacts, we include them anyways in case we
  // add logic in the future that modifies them. We don't include the compiler input artifacts
  // mainly as a performance optimization and because we don't expect to modify them in the future.
  const networkArtifacts = readDeploymentArtifactsForNetwork(
    projectName,
    chainId,
    executionMode
  )
  const deploymentArtifacts = {
    networks: {
      [chainId.toString()]: networkArtifacts,
    },
    compilerInputs: {},
  }

  await makeDeploymentArtifacts(
    {
      [chainId.toString()]: {
        provider,
        deploymentConfig,
        receipts,
      },
    },
    merkleTree.root,
    configArtifacts,
    deploymentArtifacts
  )

  spinner.succeed(`Built deployment artifacts.`)
  spinner.start(`Writing deployment artifacts...`)

  writeDeploymentArtifacts(
    projectName,
    networkConfig.executionMode,
    deploymentArtifacts
  )

  // Note that we don't display the artifact paths for the deployment artifacts because we may not
  // modify all of the artifacts that we read from the file system earlier.
  spinner.succeed(`Wrote deployment artifacts.`)

  if (!silent) {
    displayDeploymentTable(networkConfig)
  }

  if (networkConfig.executionMode === ExecutionMode.LiveNetworkCLI && verify) {
    spinner.info(`Verifying contracts on Etherscan.`)

    const etherscanApiKey = etherscan[network].key

    await verifyDeploymentWithRetries(
      deploymentConfig,
      provider,
      etherscanApiKey
    )
  }

  return {
    deploymentConfig,
    merkleTree,
    preview,
    receipts,
    configArtifacts,
    deploymentArtifacts,
  }
}

// TODO(end): make ticket: investigate the UX of a transaction reverting in the `SphinxSimulator`
// when we're getting the Merkle leaf gas fields. the error is probably opaque. i don't think this
// situation will occur often because it either means there's a bug in our logic or there's some
// chain-specific thing that's causing the failure.

// TODO(end): add to ticket for importing existing gnosis safes: we need to differentiate between
// L1 and L2 gnosis safes in the SphinxSimulator to properly estimate the Merkle leaf gas values.
// The L2 Safes have an `execTransactionFromModule` function that's more expensive.

// TODO(end): gh: I created SphinxPeripheryDataTypes mainly because it needs to

// TODO(end): slither/solhint.

// TODO(end): create a ticket for incorporating the simulation into the backend. we'll also need to
// update logic in the `propose` function (link lines starting with "Running simulation"). if we
// keep the current logic in the Deploy and Propose commands, we'll need two API endpoints: one to
// get the Merkle leaf gas fields, and the other to run the simulation. Ideally, the simulation can
// occur before the preview. maybe it'd fit into some sort of validation endpoint. Mention that this
// is the current flow:
// 1. deploymentInfo
// 2. configArtifacts
// 3. networkConfig
// 4. simulation

// TODO(end): do we need to change the license of the SphinxSimulator to LGPL since i copied a
// couple functions from the Gnosis Safe?

// TODO(docs): gh: we put the Merkle leaf gas buffers off-chain so that we can adjust them in the
// future without re-deploying the `SphinxSimulator` contract.

// TODO(docs): we don't call `execTransactionFromModule` directly because the SphinxSimulator isn't
// a module.

// TODO(docs): we need to replace the Hardhat simulation because this situation could occur on
// Rootstock, where transactions generally use less gas than the EVM:
// 1. Say a contract deployment costs 3M on Rootstock, but 5M on Ethereum. Since we're using an
//    on-chain simulation to calculate the Merkle leaf gas, we'll set it a little greater than 3M.
// 2. The Hardhat simulation, which uses the EVM, thinks that the contract deployment costs 5M gas,
//    causing the action to fail because it's underfunded. This will cause the simulation to throw
//    an error.

// TODO(docs): the `simulateAndRevert` function is identical between Gnosis Safe v1.3.0 and v1.4.1.

// TODO(docs):
// https://dev.rootstock.io/guides/quickstart/overview/rootstock-ethereum-differences/#gas-differences
// "The EVM and RVM are compatible in that they support the same op-codes, and therefore can run the
// same smart contracts. However, the price of each op-code (measured in units known as gas) is
// different between EVM and RVM, thus the total gas consumed in various transactions is different."

// TODO(docs): all Solidity code.

// TODO(later-later): write logic to skip certain networks under certain conditions.

// TODO(later-later): test that the simulations work with the `msg.value` feature.

// TODO(later-later): test that you can transfer value as part of the eth_call in your tests that
// run against the live network RPC URLs.

// TODO(later-later): remove the hardhat simulation.

// TODO(later-later): handle case where the calldata is too large. started in `long.ts`.

// TODO(later-later): handle case where the gas limit is exceeded.

// TODO(later-later): optimize SphinxSimulator to maximize the size of the deployment. consider not
// ABI encoding the input array. first, check the difference in size between packing the bytes and
// abi encoding them.

// TODO(later-later): sanity check that the `gasEstimates` returned by your new logic and the old
// logic are roughly the same.

// TODO(later-later): do we need to adjust any of our heuristics on rootstock?

// TODO(later-later): maybe you can run the simulations without actually deploying the
// `SphinxSimulator`. (put the `simulate` function in its constructor).

// TODO(later-later): (if you need to deploy the SphinxSimulator): how will the SphinxSimulator
// contract get deployed in production on the networks supported by the DevOps platform?

// TODO(later-later): EthersJS throws an error when ABI decoding on celo alfajores w/ 3-MyLargeContract.

// TODO(later-later): ethersJS abi encoding may fail for very large deployments. (i forget if it's
// abi encoding or decoding that fails).

// ----------------------------------- TODO(later) ------------------------------------

// TODO(later): remove hardhat simulation logic, and the dependency on them in package.json.

// TODO(later): can we do this without deploying the SphinxSimulator?

// TODO(later): What are reasonable upper bounds for the calldata limit and gas limit?

// TODO(later): Handle deployments that use more gas than the simulation allows.

// TODO(later): Handle deployments with calldata that’s too long for the simulation. (Do we throw an
// error or just skip the simulation?)

// TODO(later): is there an ABI encoding size limit for EthersJS that we need to be aware of?

// TODO(later): we don't simulate via the ManagedService because we aren't using this exact logic in
// production, so there isn't much benefit. Also, we're gas constrained. Also, it's not clear
// how we'd use the managed service. how would we?

// TODO(later): should we run the simulation through the ManagedService? if not, document why.

// TODO(later): You’ll need to use the merkle leaf simulation for the deploy cli command. May as well do the second simulation too.

// TODO(later): Attempt to do the simulations on anvil in the deploy command. Are you limited by the
// gas limit or calldata limit?

// TODO(later): how will we support the live network deploy CLI command in the simulations?

// TODO(later): case: the deployment has already been completed.

// TODO(later): case: the system contracts aren't deployed yet.

// TODO(later): should we run the `attemptDeployment` function using a mock provider? maybe it's not
// worth the additional surface area of bugs. regardless, we need to do the batch stuff.

// TODO(later): handle the case where the execution process fails on an `EXECUTE` leaf. we should
// pass back something useful.

// -------------------------------- TODO(later) ------------------------------------

// TODO(later): what do we currently rely on the hardhat simulation for?
// - Making sure that the `attemptDeployment` function doesn't have a bug.
// - Checking if a Merkle leaf gas value is too low. (If it's too low, the action will fail
//   on-chain, causing the simulation to throw an error).
// - Checking if a valid batch size can't be created. (i.e. a Merkle leaf gas value is too large).
// - Getting the deployment gas estimate for proposals.

// TODO(later): which API endpoint will trigger the simulation in the backend?

// TODO(later): do the mock provider thing in the `attemptDeployment` function?

// TODO(later): remove entire plugins/src/hardhat directory.
