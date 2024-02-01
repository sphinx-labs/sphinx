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
} from '@sphinx-labs/core'
import { red } from 'chalk'
import ora from 'ora'
import { ethers } from 'ethers'
import { SphinxMerkleTree, makeSphinxMerkleTree } from '@sphinx-labs/contracts'

import {
  compile,
  getFoundrySingleChainDryRunPath,
  getInitCodeWithArgsArray,
  getSphinxConfigFromScript,
  getSphinxLeafGasEstimates,
  readFoundrySingleChainDryRun,
  readInterface,
} from '../foundry/utils'
import { getFoundryToml } from '../foundry/options'
import {
  decodeDeploymentInfo,
  makeParsedConfig,
  convertFoundryDryRunToActionInputs,
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

  const foundryToml = await getFoundryToml()
  const {
    artifactFolder,
    buildInfoFolder,
    cachePath,
    rpcEndpoints,
    etherscan,
    broadcastFolder,
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

  const { safeAddress } = await getSphinxConfigFromScript(
    scriptPath,
    sphinxPluginTypesInterface,
    targetContract,
    spinner
  )

  const executionMode = isLiveNetwork
    ? ExecutionMode.LiveNetworkCLI
    : ExecutionMode.LocalNetworkCLI
  const forgeScriptCollectArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxCollectDeployment(uint8,string)',
    executionMode.toString(),
    deploymentInfoPath,
    '--rpc-url',
    forkUrl,
  ]
  if (targetContract) {
    forgeScriptCollectArgs.push('--target-contract', targetContract)
  }

  // Collect the transactions. We use the `FOUNDRY_SENDER` environment variable to set the
  // Gnosis Safe as the `msg.sender` to ensure that it's the caller for all transactions. We need
  // to do this even though we also broadcast from the Safe's address in the script.
  // Specifically, this is necessary if the user is deploying a contract via CREATE2 that uses a
  // linked library. In this scenario, the caller that deploys the library would be Foundry's
  // default sender if we don't set this environment variable. Note that `FOUNDRY_SENDER` has
  // priority over the `--sender` flag and the `DAPP_SENDER` environment variable.
  const dateBeforeForgeScriptCollect = new Date()
  const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs, {
    FOUNDRY_SENDER: safeAddress,
  })

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

  const dryRunPath = getFoundrySingleChainDryRunPath(
    broadcastFolder,
    scriptPath,
    chainId.toString(),
    `sphinxCollectDeployment`
  )
  const dryRunFile = readFoundrySingleChainDryRun(
    broadcastFolder,
    scriptPath,
    deploymentInfo.chainId,
    `sphinxCollectDeployment`,
    dateBeforeForgeScriptCollect
  )

  // Check if the dry run file exists. If it doesn't, this must mean that the deployment is empty.
  // We return early in this case.
  if (!dryRunFile) {
    spinner.info(`Nothing to deploy. Exiting early.`)
    return {}
  }

  const actionInputs = convertFoundryDryRunToActionInputs(
    deploymentInfo,
    dryRunFile
  )

  spinner.succeed(`Collected transactions.`)
  spinner.start(`Estimating gas...`)

  const gasEstimatesArray = await getSphinxLeafGasEstimates(
    scriptPath,
    foundryToml,
    sphinxPluginTypesInterface,
    [{ actionInputs, deploymentInfo, forkUrl }],
    targetContract,
    spinner
  )
  if (gasEstimatesArray.length !== 1) {
    throw new Error(
      `Gas estimates array is an incorrect length. Should never happen.`
    )
  }
  const gasEstimates = gasEstimatesArray[0]

  spinner.succeed(`Estimated gas.`)
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

  const initCodeWithArgsArray = getInitCodeWithArgsArray(actionInputs)
  const configArtifacts = await getConfigArtifacts(initCodeWithArgsArray)

  const isSystemDeployed = await checkSystemDeployed(provider)
  const parsedConfig = makeParsedConfig(
    deploymentInfo,
    actionInputs,
    gasEstimates,
    isSystemDeployed,
    configArtifacts,
    dryRunFile.libraries,
    dryRunPath
  )

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
