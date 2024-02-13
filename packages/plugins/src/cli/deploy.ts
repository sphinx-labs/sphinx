import { join, relative } from 'path'
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'fs'

import {
  displayDeploymentTable,
  getNetworkNameDirectory,
  getSphinxWalletPrivateKey,
  isFile,
  spawnAsync,
} from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import {
  getPreview,
  getPreviewString,
  SphinxPreview,
  makeDeploymentData,
  makeDeploymentArtifacts,
  ContractDeploymentArtifact,
  isContractDeploymentArtifact,
  CompilerConfig,
  getParsedConfigWithCompilerInputs,
  verifyDeploymentWithRetries,
  SphinxTransactionReceipt,
  ExecutionMode,
  runEntireDeploymentProcess,
  ConfigArtifacts,
  checkSystemDeployed,
  fetchChainIdForNetwork,
  writeDeploymentArtifacts,
  isLegacyTransactionsRequiredForNetwork,
  MAX_UINT64,
} from '@sphinx-labs/core'
import { red } from 'chalk'
import ora from 'ora'
import { ethers } from 'ethers'
import { SphinxMerkleTree, makeSphinxMerkleTree } from '@sphinx-labs/contracts'

import {
  assertSphinxFoundryForkInstalled,
  compile,
  getInitCodeWithArgsArray,
  readInterface,
  writeSystemContracts,
} from '../foundry/utils'
import { getFoundryToml } from '../foundry/options'
import {
  decodeDeploymentInfo,
  inferLinkedLibraries,
  makeParsedConfig,
} from '../foundry/decode'
import { simulate } from '../hardhat/simulate'
import { SphinxContext } from './context'
import { checkLibraryVersion } from './utils'

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
  compilerConfig?: CompilerConfig
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

  await assertSphinxFoundryForkInstalled(scriptPath, targetContract)

  const forkUrl = rpcEndpoints[network]
  if (!forkUrl) {
    console.error(
      red(
        `No RPC endpoint specified in your foundry.toml for the network: ${network}.`
      )
    )
    process.exit(1)
  }

  const chainId = fetchChainIdForNetwork(network)

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

  const isLiveNetwork = await sphinxContext.isLiveNetwork(provider)

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

  // Collect the transactions.
  const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs, {
    // Set the block gas limit to the max amount allowed by Foundry. This overrides lower block
    // gas limits specified in the user's `foundry.toml`, which can cause the script to run out of
    // gas. We use the `FOUNDRY_BLOCK_GAS_LIMIT` environment variable because it has a higher
    // priority than `DAPP_BLOCK_GAS_LIMIT`.
    FOUNDRY_BLOCK_GAS_LIMIT: MAX_UINT64.toString(),
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
    sphinxPluginTypesInterface
  )

  checkLibraryVersion(deploymentInfo.sphinxLibraryVersion)

  spinner.succeed(`Collected transactions.`)
  spinner.start(`Building deployment...`)

  let signer: ethers.Wallet
  if (executionMode === ExecutionMode.LiveNetworkCLI) {
    const privateKey = process.env.PRIVATE_KEY
    // Check if the private key exists. It should always exist because we checked that it's defined
    // when we collected the transactions in the user's Forge script.
    if (!privateKey) {
      throw new Error(`Could not find 'PRIVATE_KEY' environment variable.`)
    }
    signer = new ethers.Wallet(privateKey, provider)
  } else if (executionMode === ExecutionMode.LocalNetworkCLI) {
    signer = new ethers.Wallet(getSphinxWalletPrivateKey(0), provider)
  } else {
    throw new Error(`Unknown execution mode.`)
  }

  const initCodeWithArgsArray = getInitCodeWithArgsArray(
    deploymentInfo.accountAccesses
  )
  const configArtifacts = await getConfigArtifacts(initCodeWithArgsArray)

  const isSystemDeployed = await checkSystemDeployed(provider)
  const parsedConfig = makeParsedConfig(
    deploymentInfo,
    isSystemDeployed,
    configArtifacts,
    libraries
  )

  if (parsedConfig.actionInputs.length === 0) {
    spinner.info(`Nothing to deploy. Exiting early.`)
    return {}
  }

  const deploymentData = makeDeploymentData([parsedConfig])

  const merkleTree = makeSphinxMerkleTree(deploymentData)

  await simulate([parsedConfig], chainId.toString(), forkUrl)

  spinner.succeed(`Built deployment.`)

  let preview: SphinxPreview | undefined
  if (skipPreview) {
    spinner.info(`Skipping preview.`)
  } else {
    preview = getPreview([parsedConfig])
    spinner.stop()
    const previewString = getPreviewString(preview, true)
    await sphinxContext.prompt(previewString)
  }

  const { receipts } = await runEntireDeploymentProcess(
    parsedConfig,
    merkleTree,
    provider,
    signer,
    spinner
  )

  spinner.start(`Building deployment artifacts...`)

  const { projectName } = parsedConfig.newConfig

  // Get the existing contract deployment artifacts
  const contractArtifactDirPath = join(
    `deployments`,
    projectName,
    getNetworkNameDirectory(chainId.toString(), parsedConfig.executionMode)
  )
  const artifactFileNames = existsSync(contractArtifactDirPath)
    ? readdirSync(contractArtifactDirPath)
    : []
  const previousContractArtifacts: {
    [fileName: string]: ContractDeploymentArtifact
  } = {}
  for (const fileName of artifactFileNames) {
    if (fileName.endsWith('.json')) {
      const filePath = join(contractArtifactDirPath, fileName)
      const fileContent = readFileSync(filePath, 'utf8')
      const artifact = JSON.parse(fileContent)
      if (isContractDeploymentArtifact(artifact)) {
        previousContractArtifacts[fileName] = artifact
      }
    }
  }

  const [compilerConfig] = getParsedConfigWithCompilerInputs(
    [parsedConfig],
    configArtifacts
  )

  const deploymentArtifacts = await makeDeploymentArtifacts(
    {
      [chainId.toString()]: {
        provider,
        compilerConfig,
        receipts,
        previousContractArtifacts,
      },
    },
    merkleTree.root,
    configArtifacts
  )

  spinner.succeed(`Built deployment artifacts.`)
  spinner.start(`Writing deployment artifacts...`)

  writeDeploymentArtifacts(
    projectName,
    parsedConfig.executionMode,
    deploymentArtifacts
  )

  // Note that we don't display the artifact paths for the deployment artifacts because we may not
  // modify all of the artifacts that we read from the file system earlier.
  spinner.succeed(`Wrote deployment artifacts.`)

  if (!silent) {
    displayDeploymentTable(parsedConfig)
  }

  if (parsedConfig.executionMode === ExecutionMode.LiveNetworkCLI && verify) {
    spinner.info(`Verifying contracts on Etherscan.`)

    const etherscanApiKey = etherscan[network].key

    await verifyDeploymentWithRetries(
      parsedConfig,
      configArtifacts,
      provider,
      etherscanApiKey
    )
  }

  return {
    compilerConfig,
    merkleTree,
    preview,
    receipts,
    configArtifacts,
  }
}

// TODO(later): see the description in this PR: https://github.com/foundry-rs/foundry/pull/586

// TODO(later): throw error if:
// - scriptPath doesn't exist in solidity-files-cache
// - there's more than one key in the 'artifact' object for the scriptPath _and_ no `targetContract` was specified.
// - there are no keys in the `artifact` object for the scriptPath

// TODO(end): gh: i manually checked that foundry automatically sets the correct initial nonce for
// the gnosis safe's nonce after deploying the libraries.

// TODO(later): throw an error if there are any libraries in the `linkReferences` but not in
// `deployedLinkReferences`. we don't support this rn because there isn't a straightforward
// way to get the script's init code with the resolved library references, which means we can't
// infer the addresses of the libraries used only in the constructor, which means we can't
// create actions for them, which means `ContractWithManyLibraries` deployed below won't have
// deployed linked libraries, which is hazardous. make a ticket to add support for this. we can
// support it in the future by getting all `accountAccesses` that are `Create`, then getting each
// of their artifacts, then using the artifacts to get all of the linked libraries w/ their addresses
// instead of using the script's artifact.deployedLinkReferences`. this'd be non-trivial with our
// current parsing logic because we'd need the contract artifacts in `decodeDeploymentInfo`,
// but they aren't available until we call `getConfigArtifacts`, which happens after
//  `decodeDeploymentInfo`.
//
// contract CounterScript is Script {
//   bytes public b;
//   constructor() {
//       b = type(ContractWithManyLibraries).creationCode;
//   }
//   function run() public {
//       address sender = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
//       vm.startPrank(sender);
//       bytes memory c = b; // Using a memory variable simplifies the assembly block
//       address addr;
//       assembly {
//           addr := create(0, add(c, 0x20), mload(c))
//       }
//   }
// }

// TODO(end): are any of the previous PRs unnecessary?

// TODO(later-later): manually check that verification succeeds when the deployment includes a
// dynamically linked _and_ a pre-linked library. in the latter case, it's fine if we don't very the
// pre-linked library (since it's already deployed), but verification shouldn't randomly fail due to
// its presence.

// TODO(end): do we already have a ticket for removing unused libraries? if not, add one: currently,
// this is a limitation in foundry too
// ([source](https://github.com/foundry-rs/foundry/issues/3295)). notes: make sure you don't mess up
// the gnosis safe's nonce. e.g. if nonce 3 corresponds to an unused library, all subsequent nonces
// must change, which impacts the user's transactions.

// TODO(end): make a note somewhere that deploying libraries via `CREATE` will add complexity to the
// code that optimizes the proposal collection process by forking within the script. specifically,
// we can't always fork every chain in a single script because we can't assume that the gnosis safe
// has the same nonce across every chain. so, we must batch chains that have the same gnosis safe
// nonce.

// TODO(end): set the "fix dead link in faq" ticket to "in review".
