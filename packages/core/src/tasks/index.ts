import * as fs from 'fs'
import * as path from 'path'
import process from 'process'

import { ethers } from 'ethers'
import ora from 'ora'
import { getChainId, remove0x } from '@eth-optimism/core-utils'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'
import { ProxyABI } from '@chugsplash/contracts'

import { CanonicalChugSplashConfig, ParsedChugSplashConfig } from '../config'
import {
  computeBundleId,
  displayDeploymentTable,
  displayProposerTable,
  formatEther,
  generateFoundryTestArtifacts,
  getChugSplashManager,
  getChugSplashManagerProxyAddress,
  getChugSplashRegistry,
  getGasPriceOverrides,
  getProjectOwnerAddress,
  isProjectRegistered,
  loadParsedChugSplashConfig,
  registerChugSplashProject,
  writeCanonicalConfig,
} from '../utils'
import { ArtifactPaths, initializeChugSplash } from '../languages'
import { EXECUTION_BUFFER_MULTIPLIER, Integration } from '../constants'
import {
  alreadyProposedMessage,
  errorProjectCurrentlyActive,
  errorProjectNotRegistered,
  resolveNetworkName,
  successfulProposalMessage,
} from '../messages'
import {
  bundleLocal,
  ChugSplashActionBundle,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  createDeploymentArtifacts,
  filterChugSplashInputs,
  proposeChugSplashBundle,
} from '../actions'
import { getAmountToDeposit, getOwnerWithdrawableAmount } from '../fund'
import { monitorExecution, postExecutionActions } from '../execution'
import { getFinalDeploymentTxnHash } from '../deployments'
import { ChugSplashExecutorType, FoundryContractArtifact } from '../types'
import {
  trackApproved,
  trackCancel,
  trackClaimProxy,
  trackDeployed,
  trackFund,
  trackListProjects,
  trackListProposers,
  trackRegistered,
  trackTransferProxy,
  trackWithdraw,
} from '../analytics'

export const chugsplashRegisterAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configs: ParsedChugSplashConfig[],
  owner: string,
  silent: boolean,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const spinner = ora({ isSilent: silent, stream })
  await initializeChugSplash(provider, signer)

  for (const parsedConfig of configs) {
    spinner.start(`Registering ${parsedConfig.options.projectName}...`)

    const isFirstTimeRegistered = await registerChugSplashProject(
      provider,
      signer,
      await signer.getAddress(),
      parsedConfig.options.projectName,
      owner
    )

    const networkName = resolveNetworkName(provider, integration)

    isFirstTimeRegistered
      ? spinner.succeed(
          `Project successfully registered on ${networkName}. Owner: ${owner}`
        )
      : spinner.fail(
          `Project was already registered by the caller on ${networkName}.`
        )

    const projectName = parsedConfig.options.projectName
    await trackRegistered(
      await getProjectOwnerAddress(signer, projectName),
      projectName,
      networkName,
      integration
    )
  }
}

export const chugsplashProposeAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedChugSplashConfig,
  configPath: string,
  ipfsUrl: string,
  silent: boolean,
  remoteExecution: boolean,
  confirm: boolean,
  integration: Integration,
  artifactPaths: ArtifactPaths,
  buildInfoFolder: string,
  artifactFolder: string,
  canonicalConfigPath: string,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const spinner = ora({ isSilent: silent, stream })
  if (integration === 'hardhat') {
    spinner.start('Booting up ChugSplash...')
  }

  await initializeChugSplash(provider, signer)

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(provider, configPath, integration)
  }

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  if (integration === 'hardhat') {
    spinner.succeed('ChugSplash is ready to go.')
  }

  // Get the bundle info by calling the commit subtask locally (i.e. without publishing the
  // bundle to IPFS). This allows us to ensure that the bundle state is empty before we submit
  // it to IPFS.
  const { bundle, configUri, bundleId } = await chugsplashCommitAbstractSubtask(
    provider,
    signer,
    parsedConfig,
    '',
    false,
    artifactPaths,
    buildInfoFolder,
    canonicalConfigPath,
    integration
  )

  spinner.start(`Checking the status of ${parsedConfig.options.projectName}...`)

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    spinner.fail(
      `Project was already proposed and is currently being executed on ${provider.network.name}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    spinner.fail(`Project was already completed on ${provider.network.name}.`)
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `Project was already cancelled on ${provider.network.name}. Please propose a new project
with a name other than ${parsedConfig.options.projectName}`
    )
  } else {
    // Bundle is either in the `EMPTY` or `PROPOSED` state.

    // Get the amount that the user must send to the ChugSplashManager to execute the bundle
    // including a buffer in case the gas price increases during execution.
    const amountToDeposit = await getAmountToDeposit(
      provider,
      bundle,
      0,
      parsedConfig.options.projectName,
      true
    )

    if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
      spinner.succeed(
        `${parsedConfig.options.projectName} has not been proposed before.`
      )

      const chainId = await getChainId(provider)

      await proposeChugSplashBundle(
        provider,
        signer,
        parsedConfig,
        bundle,
        configUri,
        remoteExecution || chainId !== 31337,
        ipfsUrl,
        configPath,
        spinner,
        confirm,
        artifactPaths,
        buildInfoFolder,
        artifactFolder,
        canonicalConfigPath,
        silent,
        integration
      )
      const message = successfulProposalMessage(
        provider,
        amountToDeposit,
        configPath,
        integration
      )
      spinner.succeed(message)
    } else {
      // Bundle was already in the `PROPOSED` state before the call to this task.
      spinner.fail(
        alreadyProposedMessage(
          provider,
          amountToDeposit,
          configPath,
          integration
        )
      )
    }
  }
}

export const chugsplashCommitAbstractSubtask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedChugSplashConfig,
  ipfsUrl: string,
  commitToIpfs: boolean,
  artifactPaths: ArtifactPaths,
  buildInfoFolder: string,
  canonicalConfigPath: string,
  integration: Integration,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<{
  bundle: ChugSplashActionBundle
  configUri: string
  bundleId: string
}> => {
  if (spinner) {
    commitToIpfs
      ? spinner.start(
          `Committing ${parsedConfig.options.projectName} on ${provider.network.name}.`
        )
      : spinner.start('Building the project...')
  }

  // Get unique source names for the contracts in the ChugSplash config
  let configSourceNames = Object.values(parsedConfig.contracts).map(
    (contractConfig) => {
      // Split the contract's fully qualified name to get its source name
      const [sourceName] = contractConfig.contract.split(':')
      return sourceName
    }
  )
  configSourceNames = Array.from(new Set(configSourceNames))

  // Get the inputs from the build info folder. This also filters out build info
  // files that aren't used in this deployment.
  const inputs = fs
    .readdirSync(buildInfoFolder)
    .filter((file) => {
      return file.endsWith('.json')
    })
    .map((file) => {
      return JSON.parse(
        fs.readFileSync(path.join(buildInfoFolder, file), 'utf8')
      )
    })
    .filter((buildInfo) => {
      // Get an array of the source names for the current build info file
      const inputSourceNames = Object.keys(buildInfo.input.sources)
      // Get the intersection of source names between the current build info file
      // and the ChugSplash config file
      const intersection = configSourceNames.filter((name) =>
        inputSourceNames.includes(name)
      )
      // Keep this build info file if the arrays share at least one source name in common
      return intersection.length > 0
    })
    .map((compilerInput) => {
      return {
        solcVersion: compilerInput.solcVersion,
        solcLongVersion: compilerInput.solcLongVersion,
        input: compilerInput.input,
        output: compilerInput.output,
      }
    })

  // Filter out any sources in the ChugSplash inputs that aren't needed in this deployment.
  const filteredInputs = await filterChugSplashInputs(
    inputs,
    parsedConfig,
    artifactPaths
  )

  const canonicalConfig: CanonicalChugSplashConfig = {
    ...parsedConfig,
    inputs: filteredInputs,
  }

  const ipfsData = JSON.stringify(canonicalConfig, null, 2)

  let ipfsHash
  if (!commitToIpfs) {
    // Get the IPFS hash without publishing anything on IPFS.
    ipfsHash = await Hash.of(ipfsData)
  } else if (ipfsUrl) {
    const ipfs = create({
      url: ipfsUrl,
    })
    ipfsHash = (await ipfs.add(ipfsData)).path
  } else if (process.env.IPFS_PROJECT_ID && process.env.IPFS_API_KEY_SECRET) {
    const projectCredentials = `${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_API_KEY_SECRET}`
    const ipfs = create({
      host: 'ipfs.infura.io',
      port: 5001,
      protocol: 'https',
      headers: {
        authorization: `Basic ${Buffer.from(projectCredentials).toString(
          'base64'
        )}`,
      },
    })
    ipfsHash = (await ipfs.add(ipfsData)).path
  } else {
    throw new Error(
      `To deploy on ${provider.network.name}, you must first setup an IPFS project with
Infura: https://app.infura.io/. Once you've done this, copy and paste the following
variables into your .env file:

IPFS_PROJECT_ID: ...
IPFS_API_KEY_SECRET: ...
        `
    )
  }

  const bundle = await bundleLocal(parsedConfig, artifactPaths, integration)

  const configUri = `ipfs://${ipfsHash}`
  const bundleId = computeBundleId(
    bundle.root,
    bundle.actions.length,
    configUri
  )

  // Write the canonical config to the local file system if we aren't committing it to IPFS.
  if (!commitToIpfs) {
    writeCanonicalConfig(canonicalConfigPath, bundleId, canonicalConfig)
  }

  if (spinner) {
    const networkName = resolveNetworkName(provider, integration)
    commitToIpfs
      ? spinner.succeed(
          `${parsedConfig.options.projectName} has been committed to IPFS.`
        )
      : spinner.succeed(
          `Built ${parsedConfig.options.projectName} on ${networkName}.`
        )
  }

  return { bundle, configUri, bundleId }
}

export const chugsplashApproveAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  noWithdraw: boolean,
  silent: boolean,
  skipMonitorStatus: boolean,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  buildInfoFolder: string,
  artifactFolder: string,
  canonicalConfigPath: string,
  deploymentFolderPath: string,
  remoteExecution: boolean,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const parsedConfig = loadParsedChugSplashConfig(
    configPath,
    artifactPaths,
    integration
  )
  const networkName = resolveNetworkName(provider, integration)

  const spinner = ora({ isSilent: silent, stream })
  spinner.start(
    `Approving ${parsedConfig.options.projectName} on ${networkName}...`
  )

  const projectName = parsedConfig.options.projectName
  const signerAddress = await signer.getAddress()

  if (!(await isProjectRegistered(signer, projectName))) {
    errorProjectNotRegistered(provider, configPath, 'hardhat')
  }

  const projectOwnerAddress = await getProjectOwnerAddress(signer, projectName)
  if (signerAddress !== projectOwnerAddress) {
    throw new Error(`Caller is not the project owner on ${networkName}.
Caller's address: ${signerAddress}
Owner's address: ${projectOwnerAddress}`)
  }

  // Call the commit subtask locally to get the bundle ID without publishing
  // anything to IPFS.
  const { bundleId, bundle } = await chugsplashCommitAbstractSubtask(
    provider,
    signer,
    parsedConfig,
    '',
    false,
    artifactPaths,
    buildInfoFolder,
    canonicalConfigPath,
    integration,
    spinner
  )

  const ChugSplashManager = getChugSplashManager(signer, projectName)
  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )
  const activeBundleId = await ChugSplashManager.activeBundleId()
  if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
    throw new Error(`You must first propose the project before it can be approved.
To propose the project, run the command:

npx hardhat chugsplash-propose --network ${networkName} --config-path ${configPath}`)
  } else if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    spinner.succeed(`Project has already been approved. It should be executed shortly.
Run the following command to monitor its status:

npx hardhat chugsplash-monitor --network ${networkName} --config-path ${configPath}`)
  } else if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    spinner.succeed(`Project was already completed on ${networkName}.`)
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(`Project was already cancelled on ${networkName}.`)
  } else if (activeBundleId !== ethers.constants.HashZero) {
    throw new Error(
      `Another project is currently being executed.
Please wait a couple minutes then try again.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.PROPOSED) {
    const amountToDeposit = await getAmountToDeposit(
      provider,
      bundle,
      0,
      projectName,
      false
    )

    if (amountToDeposit.gt(0)) {
      throw new Error(`Project was not approved because it has insufficient funds.
Fund the project with the following command:
npx hardhat chugsplash-fund --network ${networkName} --amount ${amountToDeposit.mul(
        EXECUTION_BUFFER_MULTIPLIER
      )} --config-path <configPath>`)
    }

    await (
      await ChugSplashManager.approveChugSplashBundle(
        bundleId,
        await getGasPriceOverrides(provider)
      )
    ).wait()

    spinner.succeed(
      `${parsedConfig.options.projectName} approved on ${networkName}.`
    )

    if (!skipMonitorStatus) {
      const finalDeploymentTxnHash = await monitorExecution(
        provider,
        signer,
        parsedConfig,
        bundle,
        bundleId,
        spinner,
        integration
      )
      await postExecutionActions(
        provider,
        signer,
        parsedConfig,
        finalDeploymentTxnHash,
        !noWithdraw,
        networkName,
        deploymentFolderPath,
        artifactPaths,
        artifactFolder,
        buildInfoFolder,
        integration,
        remoteExecution,
        undefined,
        spinner
      )
      spinner.succeed(`${projectName} successfully deployed on ${networkName}.`)
      displayDeploymentTable(parsedConfig, silent)
    }

    await trackApproved(
      await getProjectOwnerAddress(signer, projectName),
      projectName,
      networkName,
      integration
    )
  }
}

export const chugsplashFundAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  amount: ethers.BigNumber,
  silent: boolean,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const spinner = ora({ isSilent: silent, stream })

  const parsedConfig = loadParsedChugSplashConfig(
    configPath,
    artifactPaths,
    integration
  )
  const projectName = parsedConfig.options.projectName
  const chugsplashManagerAddress = getChugSplashManagerProxyAddress(projectName)
  const signerBalance = await signer.getBalance()
  const networkName = resolveNetworkName(provider, integration)

  if (signerBalance.lt(amount)) {
    throw new Error(`Signer's balance is less than the amount required to fund your project.

Signer's balance: ${ethers.utils.formatEther(signerBalance)} ETH
Amount: ${ethers.utils.formatEther(amount)} ETH

Please send more ETH to ${await signer.getAddress()} on ${networkName} then try again.`)
  }

  if (!(await isProjectRegistered(signer, projectName))) {
    errorProjectNotRegistered(provider, configPath, 'hardhat')
  }

  spinner.start(
    `Depositing ${ethers.utils.formatEther(
      amount
    )} ETH for the project: ${projectName}...`
  )
  const txnRequest = await getGasPriceOverrides(provider, {
    value: amount,
    to: chugsplashManagerAddress,
  })
  await (await signer.sendTransaction(txnRequest)).wait()
  spinner.succeed(
    `Deposited ${ethers.utils.formatEther(
      amount
    )} ETH for the project: ${projectName}.`
  )

  await trackFund(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )
}

export const chugsplashDeployAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  silent: boolean,
  remoteExecution: boolean,
  ipfsUrl: string,
  noCompile: boolean,
  confirm: boolean,
  withdraw: boolean,
  newOwner: string,
  artifactPaths: ArtifactPaths,
  buildInfoFolder: string,
  artifactFolder: string,
  canonicalConfigPath: string,
  deploymentFolder: string,
  integration: Integration,
  executor?: ChugSplashExecutorType,
  stream: NodeJS.WritableStream = process.stderr
): Promise<FoundryContractArtifact[] | undefined> => {
  const spinner = ora({ isSilent: silent, stream })
  const networkName = resolveNetworkName(provider, integration)

  if (executor === undefined && !remoteExecution) {
    throw new Error(
      'You must pass in a ChugSplashExecutor if executing locally'
    )
  }

  const signerAddress = await signer.getAddress()

  spinner.start('Parsing ChugSplash config file...')

  const parsedConfig = loadParsedChugSplashConfig(
    configPath,
    artifactPaths,
    integration
  )
  const projectName = parsedConfig.options.projectName

  const projectPreviouslyRegistered = await isProjectRegistered(
    signer,
    projectName
  )

  spinner.succeed(`Parsed ${projectName}.`)

  if (projectPreviouslyRegistered === false) {
    spinner.start(`Registering ${projectName}...`)
    // Register the project with the signer as the owner. Once we've completed the deployment, we'll
    // transfer ownership to the project owner specified in the config.
    await registerChugSplashProject(
      provider,
      signer,
      signerAddress,
      projectName,
      signerAddress
    )
    spinner.succeed(`Successfully registered ${projectName}.`)
  }

  // Get the bundle ID without publishing anything to IPFS.
  const { bundleId, bundle, configUri } = await chugsplashCommitAbstractSubtask(
    provider,
    signer,
    parsedConfig,
    ipfsUrl,
    false,
    artifactPaths,
    buildInfoFolder,
    canonicalConfigPath,
    integration
  )

  spinner.start(`Checking the status of ${projectName}...`)

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )
  let currBundleStatus = bundleState.status

  if (currBundleStatus === ChugSplashBundleStatus.COMPLETED) {
    await createDeploymentArtifacts(
      provider,
      parsedConfig,
      await getFinalDeploymentTxnHash(ChugSplashManager, bundleId),
      artifactPaths,
      integration,
      spinner,
      networkName,
      deploymentFolder,
      remoteExecution
    )
    spinner.succeed(`${projectName} was already completed on ${networkName}.`)
    if (integration === 'hardhat') {
      displayDeploymentTable(parsedConfig, silent)
    } else {
      return generateFoundryTestArtifacts(parsedConfig)
    }
    return
  } else if (currBundleStatus === ChugSplashBundleStatus.CANCELLED) {
    spinner.fail(`${projectName} was already cancelled on ${networkName}.`)
    throw new Error(
      `${projectName} was previously cancelled on ${networkName}.`
    )
  }

  if (currBundleStatus === ChugSplashBundleStatus.EMPTY) {
    spinner.succeed(`${projectName} has not been proposed before.`)
    spinner.start(`Proposing ${projectName}...`)
    const chainId = await getChainId(provider)
    await proposeChugSplashBundle(
      provider,
      signer,
      parsedConfig,
      bundle,
      configUri,
      remoteExecution || chainId !== 31337,
      ipfsUrl,
      configPath,
      spinner,
      confirm,
      artifactPaths,
      buildInfoFolder,
      artifactFolder,
      canonicalConfigPath,
      silent,
      integration
    )
    currBundleStatus = ChugSplashBundleStatus.PROPOSED
  }

  if (currBundleStatus === ChugSplashBundleStatus.PROPOSED) {
    spinner.start(`Calculating amount to deposit...`)
    const amountToDeposit = await getAmountToDeposit(
      provider,
      bundle,
      0,
      projectName,
      true
    )

    if (amountToDeposit.gt(0)) {
      spinner.succeed(
        `Amount to deposit: ${formatEther(amountToDeposit, 4)} ETH`
      )
      spinner.start(`Funding ${projectName}...`)

      await chugsplashFundAbstractTask(
        provider,
        signer,
        configPath,
        amountToDeposit,
        silent,
        artifactPaths,
        integration,
        stream
      )

      spinner.succeed(`Funded ${projectName}.`)
    } else {
      spinner.succeed(`Sufficient funds already deposited.`)
    }

    // Approve the deployment.
    await chugsplashApproveAbstractTask(
      provider,
      signer,
      configPath,
      false,
      silent,
      true,
      artifactPaths,
      integration,
      buildInfoFolder,
      artifactFolder,
      canonicalConfigPath,
      deploymentFolder,
      remoteExecution,
      stream
    )

    currBundleStatus = ChugSplashBundleStatus.APPROVED
  }

  // At this point, we know that the bundle is active.

  if (remoteExecution) {
    await monitorExecution(
      provider,
      signer,
      parsedConfig,
      bundle,
      bundleId,
      spinner,
      integration
    )
  } else {
    // Use the in-process executor if executing the bundle locally.
    const amountToDeposit = await getAmountToDeposit(
      provider,
      bundle,
      0,
      projectName,
      true
    )
    await signer.sendTransaction({
      to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      value: amountToDeposit,
    })
    await executor.main(bundleId, canonicalConfigPath, integration)
    spinner.succeed(`Executed ${projectName}.`)
  }

  const finalDeploymentTxnHash = await getFinalDeploymentTxnHash(
    ChugSplashManager,
    bundleId
  )

  await postExecutionActions(
    provider,
    signer,
    parsedConfig,
    finalDeploymentTxnHash,
    withdraw,
    networkName,
    deploymentFolder,
    artifactPaths,
    artifactFolder,
    buildInfoFolder,
    integration,
    remoteExecution,
    newOwner,
    spinner
  )

  await trackDeployed(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

  // At this point, the bundle has been completed.
  spinner.succeed(`${projectName} completed!`)
  if (integration === 'hardhat') {
    displayDeploymentTable(parsedConfig, silent)
  } else {
    return generateFoundryTestArtifacts(parsedConfig)
  }
}

export const chugsplashMonitorAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  noWithdraw: boolean,
  silent: boolean,
  newOwner: string,
  artifactPaths: ArtifactPaths,
  buildInfoFolder: string,
  artifactFolder: string,
  canonicalConfigPath: string,
  deploymentFolder: string,
  integration: Integration,
  remoteExecution: boolean,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const networkName = resolveNetworkName(provider, 'hardhat')
  const spinner = ora({ isSilent: silent, stream })
  spinner.start(`Loading project information...`)

  const parsedConfig = loadParsedChugSplashConfig(
    configPath,
    artifactPaths,
    integration
  )
  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(provider, configPath, 'hardhat')
  }

  // Get the bundle info by calling the commit subtask locally (i.e. without publishing the
  // bundle to IPFS). This allows us to ensure that the bundle state is empty before we submit
  // it to IPFS.
  const { bundle, bundleId } = await chugsplashCommitAbstractSubtask(
    provider,
    signer,
    parsedConfig,
    '',
    false,
    artifactPaths,
    buildInfoFolder,
    canonicalConfigPath,
    integration
  )
  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  spinner.succeed(`Loaded project information.`)

  if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
    throw new Error(
      `${parsedConfig.options.projectName} has not been proposed or approved for
execution on ${networkName}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.PROPOSED) {
    throw new Error(
      `${parsedConfig.options.projectName} has not been proposed but not yet
approved for execution on ${networkName}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `Project was already cancelled on ${networkName}. Please propose a new
project with a name other than ${parsedConfig.options.projectName}`
    )
  }

  // If we make it to this point, the bundle status is either completed or approved.

  const finalDeploymentTxnHash = await monitorExecution(
    provider,
    signer,
    parsedConfig,
    bundle,
    bundleId,
    spinner,
    'hardhat'
  )

  await postExecutionActions(
    provider,
    signer,
    parsedConfig,
    finalDeploymentTxnHash,
    !noWithdraw,
    networkName,
    deploymentFolder,
    artifactPaths,
    artifactFolder,
    buildInfoFolder,
    'hardhat',
    remoteExecution,
    newOwner,
    spinner
  )

  bundleState.status === ChugSplashBundleStatus.APPROVED
    ? spinner.succeed(
        `${parsedConfig.options.projectName} successfully completed on ${networkName}.`
      )
    : spinner.succeed(
        `${parsedConfig.options.projectName} was already deployed on ${networkName}.`
      )

  displayDeploymentTable(parsedConfig, silent)
}

export const chugsplashCancelAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const networkName = resolveNetworkName(provider, integration)

  const parsedConfig = loadParsedChugSplashConfig(
    configPath,
    artifactPaths,
    integration
  )
  const projectName = parsedConfig.options.projectName

  const spinner = ora({ stream })
  spinner.start(`Cancelling ${projectName} on ${networkName}.`)

  if (!(await isProjectRegistered(signer, projectName))) {
    errorProjectNotRegistered(provider, configPath, 'hardhat')
  }

  const projectOwnerAddress = await getProjectOwnerAddress(signer, projectName)
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
You attempted to cancel the project using the address: ${await signer.getAddress()}`)
  }

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const activeBundleId = await ChugSplashManager.activeBundleId()

  if (activeBundleId === ethers.constants.HashZero) {
    spinner.fail(
      `${projectName} is not an active project, so there is nothing to cancel.`
    )
    return
  }

  await (
    await ChugSplashManager.cancelActiveChugSplashBundle(
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Cancelled ${projectName} on ${networkName}.`)
  spinner.start(`Refunding the project owner...`)

  const prevOwnerBalance = await signer.getBalance()
  await (
    await ChugSplashManager.withdrawOwnerETH(
      await getGasPriceOverrides(provider)
    )
  ).wait()
  const refund = (await signer.getBalance()).sub(prevOwnerBalance)

  spinner.succeed(
    `Refunded ${ethers.utils.formatEther(
      refund
    )} ETH on ${networkName} to the project owner: ${await signer.getAddress()}.`
  )

  await trackCancel(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )
}

export const chugsplashWithdrawAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  silent: boolean,
  artifactPaths: ArtifactPaths,
  buildInfoFolder: string,
  artifactFolder: string,
  canonicalConfigPath: string,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const networkName = resolveNetworkName(provider, integration)
  const parsedConfig = loadParsedChugSplashConfig(
    configPath,
    artifactPaths,
    integration
  )
  const projectName = parsedConfig.options.projectName

  const spinner = ora({ isSilent: silent, stream })
  spinner.start(
    `Withdrawing ETH in the project ${projectName} on ${networkName}.`
  )

  if (!(await isProjectRegistered(signer, projectName))) {
    errorProjectNotRegistered(provider, configPath, 'hardhat')
  }

  const projectOwnerAddress = await getProjectOwnerAddress(signer, projectName)
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
Caller attempted to claim funds using the address: ${await signer.getAddress()}`)
  }

  // Get the bundle info by calling the commit subtask locally (i.e. without publishing the
  // bundle to IPFS). This allows us to ensure that the bundle state is empty before we submit
  // it to IPFS.
  const { bundleId } = await chugsplashCommitAbstractSubtask(
    provider,
    signer,
    parsedConfig,
    '',
    false,
    artifactPaths,
    buildInfoFolder,
    canonicalConfigPath,
    integration
  )

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    errorProjectCurrentlyActive(provider, integration, configPath)
  }

  const amountToWithdraw = await getOwnerWithdrawableAmount(
    provider,
    projectName
  )

  if (amountToWithdraw.gt(0)) {
    await (
      await ChugSplashManager.withdrawOwnerETH(
        await getGasPriceOverrides(provider)
      )
    ).wait()

    spinner.succeed(
      `Withdrew ${ethers.utils.formatEther(
        amountToWithdraw
      )} ETH on ${networkName} to the project owner: ${await signer.getAddress()}.`
    )
  } else {
    spinner.fail(
      `No funds available to withdraw on ${networkName} for the project: ${projectName}.`
    )
  }
  await trackWithdraw(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )
}

export const chugsplashListProjectsAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const networkName = resolveNetworkName(provider, integration)
  const signerAddress = await signer.getAddress()

  const spinner = ora({ stream })
  spinner.start(`Getting projects on ${networkName} owned by: ${signerAddress}`)

  const ChugSplashRegistry = getChugSplashRegistry(signer)

  const projectRegisteredEvents = await ChugSplashRegistry.queryFilter(
    ChugSplashRegistry.filters.ChugSplashProjectRegistered()
  )

  const projects = {}
  let numProjectsOwned = 0
  for (const event of projectRegisteredEvents) {
    const ChugSplashManager = getChugSplashManager(
      signer,
      event.args.projectName
    )
    const projectOwnerAddress = await getProjectOwnerAddress(
      signer,
      event.args.projectName
    )
    if (projectOwnerAddress === signerAddress) {
      numProjectsOwned += 1
      const hasActiveBundle =
        (await ChugSplashManager.activeBundleId()) !== ethers.constants.HashZero
      const totalEthBalance = await provider.getBalance(
        ChugSplashManager.address
      )
      const ownerBalance = await getOwnerWithdrawableAmount(
        provider,
        event.args.projectName
      )

      const formattedTotalEthBalance = totalEthBalance.gt(0)
        ? formatEther(totalEthBalance, 4)
        : 0
      const formattedOwnerBalance = ownerBalance.gt(0)
        ? formatEther(ownerBalance, 4)
        : 0

      projects[numProjectsOwned] = {
        'Project Name': event.args.projectName,
        'Is Active': hasActiveBundle ? 'Yes' : 'No',
        "Project Owner's ETH": formattedOwnerBalance,
        'Total ETH Stored': formattedTotalEthBalance,
      }
    }
  }

  if (numProjectsOwned > 0) {
    spinner.succeed(
      `Retrieved all projects on ${networkName} owned by: ${signerAddress}`
    )
    console.table(projects)
  } else {
    spinner.fail(`No projects on ${networkName} owned by: ${signerAddress}`)
  }

  await trackListProjects(signerAddress, networkName, integration)
}

export const chugsplashListProposersAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  artifactPaths: ArtifactPaths,
  integration: Integration
) => {
  const parsedConfig = loadParsedChugSplashConfig(
    configPath,
    artifactPaths,
    integration
  )

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(provider, configPath, 'hardhat')
  }

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  const proposers = []

  // Fetch current owner
  const owner = await getProjectOwnerAddress(
    signer,
    parsedConfig.options.projectName
  )
  proposers.push(owner)

  // Fetch all previous proposers
  const addProposerEvents = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.ProposerAdded()
  )

  // Verify if each previous proposer is still a proposer before adding it to the list
  for (const proposerEvent of addProposerEvents) {
    const address = proposerEvent.args.proposer
    const isStillProposer = await ChugSplashManager.proposers(address)
    if (isStillProposer && !proposers.includes(address)) {
      proposers.push(address)
    }
  }

  // Display the list of proposers
  displayProposerTable(proposers)

  const networkName = resolveNetworkName(provider, integration)
  const projectName = parsedConfig.options.projectName
  await trackListProposers(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )
}

export const chugsplashAddProposersAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  newProposers: string[],
  artifactPaths: ArtifactPaths,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  if (newProposers.length === 0) {
    throw new Error('You must specify at least one proposer to add.')
  }

  const parsedConfig = loadParsedChugSplashConfig(
    configPath,
    artifactPaths,
    integration
  )

  const spinner = ora({ stream })
  spinner.start('Confirming project ownership...')

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(provider, configPath, 'hardhat')
  }

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  // Fetch current owner
  const projectOwnerAddress = await getProjectOwnerAddress(
    signer,
    parsedConfig.options.projectName
  )
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
  You attempted to add a proposer using address: ${await signer.getAddress()}`)
  }

  spinner.succeed('Project ownership confirmed.')

  for (const newProposer of newProposers) {
    spinner.start(`Adding proposer ${newProposer}...`)

    const isAlreadyProposer = await ChugSplashManager.proposers(newProposer)
    if (isAlreadyProposer) {
      throw new Error(
        `A proposer with the address ${newProposer} has already been added.`
      )
    }

    await (
      await ChugSplashManager.addProposer(
        newProposer,
        await getGasPriceOverrides(provider)
      )
    ).wait()

    spinner.succeed(`Proposer ${newProposer} successfully added!`)
  }

  await chugsplashListProposersAbstractTask(
    provider,
    signer,
    configPath,
    artifactPaths,
    integration
  )

  const networkName = resolveNetworkName(provider, integration)
  const projectName = parsedConfig.options.projectName
  await trackListProposers(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )
}

export const chugsplashClaimProxyAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  referenceName: string,
  silent: boolean,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const spinner = ora({ isSilent: silent, stream })
  spinner.start('Checking project registration...')

  const parsedConfig = loadParsedChugSplashConfig(
    configPath,
    artifactPaths,
    integration
  )

  // Throw an error if the project has not been registered
  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(provider, configPath, 'hardhat')
  }

  const owner = await getProjectOwnerAddress(
    signer,
    parsedConfig.options.projectName
  )

  const signerAddress = await signer.getAddress()
  if (owner !== signerAddress) {
    throw new Error(
      `Caller does not own the project ${parsedConfig.options.projectName}`
    )
  }

  spinner.succeed('Project registration detected')
  spinner.start('Claiming proxy ownership...')

  const manager = getChugSplashManager(signer, parsedConfig.options.projectName)

  const activeBundleId = await manager.activeBundleId()
  if (activeBundleId !== ethers.constants.HashZero) {
    throw new Error(
      `A project is currently being executed. Proxy ownership has not been transferred.
  Please wait a couple of minutes before trying again.`
    )
  }

  await (
    await manager.transferProxyOwnership(
      referenceName,
      signerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Proxy ownership claimed by address ${signerAddress}`)

  const networkName = resolveNetworkName(provider, integration)
  const projectName = parsedConfig.options.projectName
  await trackClaimProxy(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )
}

export const chugsplashTransferOwnershipAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  proxy: string,
  silent: boolean,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const spinner = ora({ isSilent: silent, stream })
  spinner.start('Checking project registration...')

  const parsedConfig = loadParsedChugSplashConfig(
    configPath,
    artifactPaths,
    integration
  )

  // Throw an error if the project has not been registered
  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    errorProjectNotRegistered(provider, configPath, 'hardhat')
  }

  spinner.succeed('Project registration detected')
  spinner.start('Checking proxy compatibility...')

  const incompatibleProxyError = `ChugSplash does not support your proxy type.
    Currently ChugSplash only supports proxies that implement EIP-1967 which yours does not appear to do.
    If you believe this is a mistake, please reach out to the developers or open an issue on GitHub.`

  // Fetch proxy bytecode and check if it contains the expected EIP-1967 function definitions
  const iface = new ethers.utils.Interface(ProxyABI)
  const bytecode = await provider.getCode(proxy)
  const checkFunctions = ['implementation', 'admin', 'upgradeTo', 'changeAdmin']
  for (const func of checkFunctions) {
    const sigHash = remove0x(iface.getSighash(func))
    if (!bytecode.includes(sigHash)) {
      throw new Error(incompatibleProxyError)
    }
  }

  // Fetch proxy owner address from storage slot defined by EIP-1967
  const ownerAddress = ethers.utils.defaultAbiCoder.decode(
    ['address'],
    await provider.getStorageAt(
      proxy,
      '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'
    )
  )[0]

  // Fetch ChugSplashManager address for this project
  const managerAddress = getChugSplashManagerProxyAddress(
    parsedConfig.options.projectName
  )

  // If proxy owner is not a valid address, then proxy type is incompatible
  if (!ethers.utils.isAddress(ownerAddress)) {
    throw new Error(incompatibleProxyError)
  }

  // If proxy owner is already ChugSplash, then throw an error
  if (managerAddress.toLowerCase() === ownerAddress.toLowerCase()) {
    throw new Error('Proxy is already owned by ChugSplash')
  }

  // If the signer doesn't own the target proxy, then throw an error
  const signerAddress = await signer.getAddress()
  if (ownerAddress.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Target proxy is owned by: ${ownerAddress}.
  You attempted to transfer ownership of the proxy using the address: ${signerAddress}`)
  }

  // Check that the proxy implementation function returns an address
  const contract = new ethers.Contract(proxy, iface, signer)
  const implementationAddress = await contract.callStatic.implementation()
  if (!ethers.utils.isAddress(implementationAddress)) {
    throw new Error(incompatibleProxyError)
  }

  spinner.succeed('Proxy compatibility verified')
  spinner.start('Transferring proxy ownership to ChugSplash...')

  // Transfer ownership of the proxy to the ChugSplashManager.
  await (
    await contract.changeAdmin(
      managerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed('Proxy ownership successfully transferred to ChugSplash')

  const networkName = resolveNetworkName(provider, integration)
  const projectName = parsedConfig.options.projectName
  await trackTransferProxy(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )
}
