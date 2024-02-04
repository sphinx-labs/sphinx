import { join } from 'path'
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'fs'

import {
  displayDeploymentTable,
  getNetworkNameDirectory,
  getSphinxWalletPrivateKey,
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
import { decodeDeploymentInfo, makeParsedConfig } from '../foundry/decode'
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
    scriptPath,
    network,
    skipPreview,
    silent,
    sphinxContext,
    verify,
    targetContract,
  } = args

  const projectRoot = process.cwd()

  // Run the compiler. It's necessary to do this before we read any contract interfaces.
  compile(
    silent,
    false // Do not force re-compile.
  )

  const spinner = ora({ isSilent: silent })
  spinner.start(`Collecting transactions...`)

  await assertSphinxFoundryForkInstalled(scriptPath, targetContract)

  const foundryToml = await getFoundryToml()
  const {
    artifactFolder,
    buildInfoFolder,
    cachePath,
    rpcEndpoints,
    etherscan,
  } = foundryToml

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
  const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs)

  if (spawnOutput.code !== 0) {
    spinner.stop()
    // The `stdout` contains the trace of the error.
    console.log(spawnOutput.stdout)
    // The `stderr` contains the error message.
    console.log(spawnOutput.stderr)
    process.exit(1)
  }

  const abiEncodedDeploymentInfo = readFileSync(deploymentInfoPath, 'utf-8')
  const deploymentInfo = decodeDeploymentInfo(
    abiEncodedDeploymentInfo,
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
    [] // We don't currently support linked libraries.
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
