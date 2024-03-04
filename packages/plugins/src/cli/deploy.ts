import { join, relative } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'

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
  compileAndExecuteDeployment,
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
}

export const deploy = async (
  args: DeployArgs
): Promise<{
  deploymentConfig?: DeploymentConfig
  merkleTree?: SphinxMerkleTree
  preview?: ReturnType<typeof getPreview>
  receipts?: Array<SphinxTransactionReceipt>
  configArtifacts?: ConfigArtifacts
}> => {
  const {
    network,
    skipPreview,
    silent,
    sphinxContext,
    verify,
    targetContract,
  } = args

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

  // Run the compiler. It's necessary to do this before we read any contract interfaces.
  compile(
    silent,
    false // Do not force re-compile.
  )

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
    'sphinxCollectDeployment(uint8,string,string)',
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
    FOUNDRY_SENDER: safeAddress,
    ETH_FROM: safeAddress,
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
      _configArtifacts: ConfigArtifacts,
      failureReason: HumanReadableAction
    ) => {
      throw new Error(
        `The following action reverted during the execution:\n${failureReason.reason}`
      )
    },
    verify: async () => {
      return
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
  const result = await compileAndExecuteDeployment(deploymentContext)

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
  }
}

// TODO(end): mention that dry run files are written, but the speed difference seems minor since
// we're using --skip-simulation

// TODO(end): ticket: Should we rename the sphinx modifier to something more descriptive, like
// sphinxBroadcast? If so, how can we make this backwards compatible? This should probably be in a
// different ticket.

// TODO(end): ticket: pranked txns from the gnosis safe should probably be invalid. only broadcasts
// should be valid. this would be a breaking change I think. i don't have confidence that there's
// *never* a valid reason to prank the safe w/o broadcasting. allowing pranks to create transactions
// is unexpected behavior in the context of Forge Scripts. We should consider how our existing error
// handling is impacted by this change:
// 1. We currently exit early (w/o an error) if there are no top-level txns in the user's script. It
//    may make more sense for this check to only occur for broadcasted txns.
// 2. We currently exit early (w/o an error) if there _are_ top-level txns in the user's script, but
//    they aren't sent from the gnosis safe. It also may make more sense for this check to only
//    occur for broadcasted txns.

// ------------------------------- TODO(docs) ---------------------------------

// TODO(docs): we don't throw an error if there are top-level transactions in the user's script
// because it's possible that the user has an idempotent script where they execute a transaction
// outside of a pranked/broadcasted gnosis safe call. if there actually aren't any transactions
// to collect in this scenario, throwing an error is not desirable behavior.

// ------------------------------ TODO(later-later)-------------------------------

// TODO(later-later): do our docs say anywhere that Sphinx will collect any _broadcasted_
// transaction? if so, this isn't technically accurate until we fix the bug where regular txns from
// the safe are also broadcasted.

// TODO(later-later): Handle the situation where the user doesn't include a deployer private key
//   environment variable, which causes their Forge script to fail.

// ----------------------------- TODO(end) ------------------------------------------

// TODO(later): handle the situation where:
// - The user includes their deployer private key environment variable, or they have an existing
//   hardcoded deployer address in their script. In this scenario, their script doesn't fail, but
//   their transactions won't be sent from their Gnosis Safe.
// - Check that the regular "Nothing to deploy" `spinner.info` can still be triggered.

// TODO(later): check:
// - msg.sender
// - ETH_FROM environment variable
// - FOUNDRY_SENDER environment variable
// - safeAddress()
// - Users should be able to call vm.startPrank or vm.startBroadcast with any of the variables above
//   as a parameter. It's also fine for the user to use vm.prank or vm.broadcast as long as there's
//   a single transaction in their script.
// - Additionally, users should be able to call vm.startBroadcast() with no parameters. Same with
//   vm.broadcast(), as long as there's a single transaction in their script.
// - Lastly, we should continue to allow usage of the sphinx modifier. This should continue to be
//   the default approach in the Quickstart.

// TODO(later): see if it's fine to do --skip-simulation. maybe it's safer to actually do the
// simulation?

// TODO(later): add --skip-simulation to deploy and propose

// TODO(end): Consider how our system will handle users stopping broadcasts, deploying a contract /
// calling a function, then starting broadcasts again. One of the calls this week is with a user
// that does this. E.g. I don’t think fetchNumCreateAccesses will behave correctly in this
// situation, if there are unbroadcasted contract deployments.
// https://github.com/vacp2p/rln-contract/blob/5d9108a1384cb53f73d23906d7085d212425b77b/script/Deploy.s.sol#L11-L13

// TODO(later): case: user does `vm.startBroadcast` in their script, but never does `stopBroadcast`.
// similarly, they could do `vm.broadcast()` but never have a broadcasted txn.
