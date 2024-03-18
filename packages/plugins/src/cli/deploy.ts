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
}> => {
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

  // Run the compiler. It's necessary to do this before we read any contract interfaces.
  compile(
    silent,
    false // Do not force re-compile.
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

  await sphinxContext.assertNoLinkedLibraries(
    deploymentInfo.scriptDeployedCode,
    foundryToml.cachePath,
    foundryToml.artifactFolder,
    projectRoot
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

// TODO: left off: we're unable to get the script's artifact because
// `findContractArtifactFromDeployedCode` relies on the build info cache, which is updated later in
// the proposal process. i figured i should wait until we decide if we're going to continue using
// the build info file given that foundry creates one every time proposal is run.

// TODO(later-later): do the same thing in the deploy command.

// TODO(later-later): check the Linear ticket for stuff to do.

// TODO(later-later): consider checking what'd happen if the function selector corresponds to more
// than one function in the ABI.

// TODO(later-later): test: `decodeDeploymentInfo` works on initial deployment info

// TODO(later-later): test: SphinxUtils.serializeDeploymentInfo works on initial deployment info.

// TODO(later-later): consider making an integration test for the scenario where the user supplies
// an invalid sig.

// TODO(docs): i think it's possible for this to happen:
// 1. user supplies invalid sig
// 2. sphinxUtils.validate causes script to Forge script to fail
// 3. we detect that an invalid sig was used, and throw an error related to that instead of the real
//    reason that the script failed. IMO this is fine.
