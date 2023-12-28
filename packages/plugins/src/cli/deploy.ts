import { join } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'

// string private rootPluginPath =
// vm.envOr("DEV_FILE_PATH", string("./node_modules/@sphinx-labs/plugins/"));

import {
  approveDeploymentViaManagedService,
  approveDeploymentViaSigner,
  displayDeploymentTable,
  estimateGasViaManagedService,
  estimateGasViaSigner,
  executeActionsViaManagedService,
  executeActionsViaSigner,
  getSphinxWalletPrivateKey,
  isLiveNetwork,
  isSupportedNetworkName,
  runEntireDeploymentProcess,
  spawnAsync,
} from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import {
  getPreview,
  getPreviewString,
  userConfirmation,
  getChainConfig,
  SUPPORTED_NETWORKS,
  ParsedConfig,
  SphinxPreview,
  ensureSphinxAndGnosisSafeDeployed,
  getParsedConfigWithCompilerInputs,
  makeDeploymentData,
  verifyDeploymentWithRetries,
} from '@sphinx-labs/core'
import { red } from 'chalk'
import ora from 'ora'
import { ethers } from 'ethers'
import { makeSphinxMerkleTree } from '@sphinx-labs/contracts'

import {
  getFoundrySingleChainDryRunPath,
  getSphinxLeafGasEstimates,
  getSphinxSafeAddressFromScript,
  getUniqueNames,
  makeGetConfigArtifacts,
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

export const deploy = async (
  scriptPath: string,
  network: string,
  skipPreview: boolean,
  silent: boolean,
  targetContract?: string,
  verify?: boolean,
  skipForceRecompile: boolean = false,
  prompt: (q: string) => Promise<void> = userConfirmation
): Promise<{
  parsedConfig?: ParsedConfig
  preview?: ReturnType<typeof getPreview>
  receipts?: Array<ethers.TransactionReceipt>
}> => {
  const projectRoot = process.cwd()
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

  if (!isSupportedNetworkName(network)) {
    throw new Error(
      `Network name ${network} is not supported. You must use a supported network: \n${Object.keys(
        SUPPORTED_NETWORKS
      ).join('\n')}`
    )
  }
  const chainId = SUPPORTED_NETWORKS[network]

  // If the verification flag is specified, then make sure there is an etherscan configuration for the target network
  if (verify) {
    if (!etherscan || !etherscan[network]) {
      const chainConfig = getChainConfig(chainId)
      console.error(
        red(
          `No etherscan configuration detected for ${network}. Please configure it in your foundry.toml file:\n` +
            `[etherscan]\n` +
            `${network} = { key = "<your api key>", url = "${chainConfig.urls.apiURL}", chain = ${SUPPORTED_NETWORKS[network]} }`
        )
      )
      process.exit(1)
    }
  }

  const provider = new SphinxJsonRpcProvider(forkUrl)
  await ensureSphinxAndGnosisSafeDeployed(provider)

  // Compile to make sure the user's contracts are up to date.
  const forgeBuildArgs = silent ? ['build', '--silent'] : ['build']
  // Force re-compile the contracts unless it's explicitly been disabled or if we're not on a live
  // network. This ensures that we're using the correct artifacts for live network deployments. This
  // is mostly out of an abundance of caution, since using an incorrect contract artifact will
  // prevent us from writing the deployment artifact for that contract.
  if (!skipForceRecompile && !(await isLiveNetwork(provider))) {
    forgeBuildArgs.push('--force')
  }

  const { status: compilationStatus } = spawnSync(`forge`, forgeBuildArgs, {
    stdio: 'inherit',
  })
  // Exit the process if compilation fails.
  if (compilationStatus !== 0) {
    process.exit(1)
  }

  // We must load any ABIs after running `forge build` to prevent a situation where the user clears
  // their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxPluginTypesInterface = readInterface(
    artifactFolder,
    'SphinxPluginTypes'
  )

  const getConfigArtifacts = makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    projectRoot,
    cachePath
  )

  const spinner = ora({ isSilent: silent })
  spinner.start(`Collecting transactions...`)

  const deploymentInfoPath = join(cachePath, 'sphinx-deployment-info.txt')

  // Remove the existing DeploymentInfo file if it exists. This ensures that we don't accidentally
  // use a file from a previous deployment.
  if (existsSync(deploymentInfoPath)) {
    unlinkSync(deploymentInfoPath)
  }

  const safeAddress = await getSphinxSafeAddressFromScript(
    scriptPath,
    forkUrl,
    targetContract,
    spinner
  )

  const forgeScriptCollectArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxCollectDeployment(string,string)',
    network,
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
    return { parsedConfig: undefined, preview: undefined }
  }

  const actionInputs = convertFoundryDryRunToActionInputs(
    deploymentInfo,
    dryRunFile,
    dryRunPath
  )

  spinner.succeed(`Collected transactions.`)
  spinner.start(`Estimating gas...`)

  const gasEstimatesArray = await getSphinxLeafGasEstimates(
    scriptPath,
    foundryToml,
    [network],
    sphinxPluginTypesInterface,
    [{ actionInputs, deploymentInfo }],
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

  const { uniqueFullyQualifiedNames, uniqueContractNames } = getUniqueNames(
    [actionInputs],
    [deploymentInfo]
  )

  const configArtifacts = await getConfigArtifacts(
    uniqueFullyQualifiedNames,
    uniqueContractNames
  )

  const parsedConfig = makeParsedConfig(
    deploymentInfo,
    actionInputs,
    gasEstimates,
    configArtifacts
  )

  const { configUri, compilerConfigs } =
    await getParsedConfigWithCompilerInputs(
      [parsedConfig],
      false,
      configArtifacts
    )

  if (compilerConfigs.length !== 1) {
    throw new Error(
      `The 'compilerConfigs' array length is: ${compilerConfigs.length}. Expected: 1. Should never happen.`
    )
  }
  const compilerConfig = compilerConfigs[0]

  const deploymentData = makeDeploymentData(configUri, compilerConfigs)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  let signer: ethers.Wallet
  if (parsedConfig.isLiveNetwork) {
    const privateKey = process.env.PRIVATE_KEY
    // Check if the private key exists. It should always exist because we checked that it's defined
    // when we collected the transactions in the user's Forge script.
    if (!privateKey) {
      throw new Error(`Could not find 'PRIVATE_KEY' environment variable.`)
    }
    signer = new ethers.Wallet(privateKey, provider)
  } else {
    signer = new ethers.Wallet(getSphinxWalletPrivateKey(0), provider)
  }

  const estimateGas = parsedConfig.isLiveNetwork
    ? estimateGasViaSigner
    : estimateGasViaManagedService
  const approveDeployment = parsedConfig.isLiveNetwork
    ? approveDeploymentViaSigner
    : approveDeploymentViaManagedService
  const executeActions = parsedConfig.isLiveNetwork
    ? executeActionsViaSigner
    : executeActionsViaManagedService

  // TODO(end): rm
  const initial = Date.now()

  await simulate(
    parsedConfig,
    merkleTree,
    forkUrl,
    signer,
    parsedConfig.isLiveNetwork,
    estimateGas,
    approveDeployment,
    executeActions
  )

  // TODO(end): rm
  console.log('deploy', (Date.now() - initial) / 1000)

  spinner.succeed(`Built deployment.`)

  let preview: SphinxPreview | undefined
  if (skipPreview) {
    spinner.info(`Skipping preview.`)
  } else {
    preview = getPreview([parsedConfig])
    spinner.stop()
    const previewString = getPreviewString(preview, true)
    await prompt(previewString)
  }

  const { receipts } = await runEntireDeploymentProcess(
    parsedConfig,
    merkleTree,
    provider,
    signer,
    parsedConfig.isLiveNetwork,
    estimateGas,
    approveDeployment,
    executeActions,
    spinner
  )

  // TODO(artifacts): update this.

  // spinner.start(`Writing contract deployment artifacts...`)

  // const deploymentArtifactPath = await writeDeploymentArtifacts(
  //   provider,
  //   parsedConfig,
  //   executionBroadcast,
  //   deploymentFolder,
  //   configArtifacts
  // )

  // spinner.succeed(
  //   `Wrote contract deployment artifacts to: ${deploymentArtifactPath}`
  // )

  if (!silent) {
    displayDeploymentTable(parsedConfig)
  }

  if (parsedConfig.isLiveNetwork && verify) {
    spinner.info(`Verifying contracts on Etherscan.`)

    const etherscanApiKey = etherscan[network].key

    await verifyDeploymentWithRetries(
      compilerConfig,
      configArtifacts,
      provider,
      etherscanApiKey
    )
  }

  return {
    parsedConfig,
    preview,
    receipts,
  }
}
