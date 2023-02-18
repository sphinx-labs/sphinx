import process from 'process'

import { ethers } from 'ethers'
import ora from 'ora'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'
import { ProxyABI } from '@chugsplash/contracts'

import {
  CanonicalChugSplashConfig,
  ChugSplashInput,
  ParsedChugSplashConfig,
  readParsedChugSplashConfig,
  readUserChugSplashConfig,
  verifyBundle,
} from '../config'
import {
  assertValidParsedChugSplashFile,
  assertValidContracts,
  computeBundleId,
  displayDeploymentTable,
  displayProposerTable,
  formatEther,
  generateFoundryTestArtifacts,
  getBundleCompletionTxnHash,
  getChugSplashManager,
  getChugSplashManagerProxyAddress,
  getChugSplashRegistry,
  getEIP1967ProxyAdminAddress,
  getGasPriceOverrides,
  getProjectOwnerAddress,
  isDefaultProxy,
  isProjectRegistered,
  isTransparentProxy,
  isUUPSProxy,
  readBuildInfo,
  registerChugSplashProject,
  setProxiesToReferenceNames,
  writeCanonicalConfig,
} from '../utils'
import { ArtifactPaths, getMinimumCompilerInput } from '../languages'
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
} from '../actions'
import { getAmountToDeposit, getOwnerWithdrawableAmount } from '../fund'
import { monitorExecution, postExecutionActions } from '../execution'
import { ChugSplashExecutorType, FoundryContractArtifact } from '../types'
import {
  trackAddProposers,
  trackApproved,
  trackCancel,
  trackClaimProxy,
  trackDeployed,
  trackFund,
  trackListProjects,
  trackListProposers,
  trackProposed,
  trackRegistered,
  trackTransferProxy,
  trackWithdraw,
} from '../analytics'

export const chugsplashRegisterAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedChugSplashConfig,
  owner: string,
  silent: boolean,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const spinner = ora({ isSilent: silent, stream })

  spinner.start(`Registering ${parsedConfig.options.projectName}...`)

  const isFirstTimeRegistered = await registerChugSplashProject(
    provider,
    signer,
    await signer.getAddress(),
    parsedConfig.options.projectName,
    owner
  )

  const networkName = await resolveNetworkName(provider, integration)

  const projectName = parsedConfig.options.projectName
  await trackRegistered(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

  isFirstTimeRegistered
    ? spinner.succeed(
        `Project successfully registered on ${networkName}. Owner: ${owner}`
      )
    : spinner.fail(
        `Project was already registered by the caller on ${networkName}.`
      )
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
  canonicalConfigPath: string,
  skipStorageCheck: boolean,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const spinner = ora({ isSilent: silent, stream })
  if (integration === 'hardhat') {
    spinner.start('Booting up ChugSplash...')
  }

  assertValidContracts(parsedConfig, artifactPaths)

  const userConfig = readUserChugSplashConfig(configPath)
  await assertValidParsedChugSplashFile(
    provider,
    parsedConfig,
    userConfig,
    artifactPaths,
    integration,
    remoteExecution,
    canonicalConfigPath,
    skipStorageCheck,
    confirm,
    spinner
  )

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    await errorProjectNotRegistered(provider, configPath, integration)
  }

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  if (integration === 'hardhat') {
    spinner.succeed('ChugSplash is ready to go.')
  }

  spinner.start('Setting proxies to reference names...')

  await setProxiesToReferenceNames(
    provider,
    ChugSplashManager,
    parsedConfig.contracts
  )

  spinner.succeed('Set proxies to reference names.')

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
    canonicalConfigPath,
    integration
  )

  spinner.start(`Checking the status of ${parsedConfig.options.projectName}...`)

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  const networkName = await resolveNetworkName(provider, integration)
  if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    spinner.fail(
      `Project was already proposed and is currently being executed on ${networkName}.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.COMPLETED) {
    spinner.fail(`Project was already completed on ${networkName}.`)
  } else if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `Project was already cancelled on ${networkName}. Please propose a new project
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

      await proposeChugSplashBundle(
        provider,
        signer,
        parsedConfig,
        bundle,
        configUri,
        remoteExecution,
        ipfsUrl,
        configPath,
        spinner,
        confirm,
        artifactPaths,
        canonicalConfigPath,
        silent,
        integration
      )
      const message = await successfulProposalMessage(
        provider,
        amountToDeposit,
        configPath,
        integration
      )
      spinner.succeed(message)
    } else {
      // Bundle was already in the `PROPOSED` state before the call to this task.
      spinner.fail(
        await alreadyProposedMessage(
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
  canonicalConfigPath: string,
  integration: Integration,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<{
  bundle: ChugSplashActionBundle
  configUri: string
  bundleId: string
}> => {
  const networkName = await resolveNetworkName(provider, integration)
  if (spinner) {
    commitToIpfs
      ? spinner.start(
          `Committing ${parsedConfig.options.projectName} on ${networkName}.`
        )
      : spinner.start('Building the project...')
  }

  const chugsplashInputs: Array<ChugSplashInput> = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const buildInfo = readBuildInfo(artifactPaths[referenceName].buildInfoPath)

    const prevChugSplashInput = chugsplashInputs.find(
      (input) => input.solcLongVersion === buildInfo.solcLongVersion
    )

    // Split the contract's fully qualified name
    const [sourceName, contractName] = contractConfig.contract.split(':')

    const { language, settings, sources } = getMinimumCompilerInput(
      buildInfo.input,
      buildInfo.output.contracts,
      sourceName,
      contractName
    )

    if (prevChugSplashInput === undefined) {
      const chugsplashInput: ChugSplashInput = {
        solcVersion: buildInfo.solcVersion,
        solcLongVersion: buildInfo.solcLongVersion,
        input: {
          language,
          settings,
          sources,
        },
      }
      chugsplashInputs.push(chugsplashInput)
    } else {
      prevChugSplashInput.input.sources = {
        ...prevChugSplashInput.input.sources,
        ...sources,
      }
    }
  }

  const canonicalConfig: CanonicalChugSplashConfig = {
    ...parsedConfig,
    inputs: chugsplashInputs,
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
      `To deploy on ${networkName}, you must first setup an IPFS project with
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
    writeCanonicalConfig(canonicalConfigPath, configUri, canonicalConfig)
  }

  if (spinner) {
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
  canonicalConfigPath: string,
  deploymentFolderPath: string,
  remoteExecution: boolean,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const parsedConfig = await readParsedChugSplashConfig(
    provider,
    configPath,
    artifactPaths,
    integration
  )

  const networkName = await resolveNetworkName(provider, integration)

  const spinner = ora({ isSilent: silent, stream })
  spinner.start(
    `Approving ${parsedConfig.options.projectName} on ${networkName}...`
  )

  const projectName = parsedConfig.options.projectName
  const signerAddress = await signer.getAddress()

  if (!(await isProjectRegistered(signer, projectName))) {
    await errorProjectNotRegistered(provider, configPath, integration)
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

npx hardhat chugsplash-propose --network <network> --config-path ${configPath}`)
  } else if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    spinner.succeed(`Project has already been approved. It should be executed shortly.
Run the following command to monitor its status:

npx hardhat chugsplash-monitor --network <network> --config-path ${configPath}`)
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
npx hardhat chugsplash-fund --network <network> --amount ${amountToDeposit.mul(
        EXECUTION_BUFFER_MULTIPLIER
      )} --config-path <configPath>`)
    }

    await (
      await ChugSplashManager.approveChugSplashBundle(
        bundleId,
        await getGasPriceOverrides(provider)
      )
    ).wait()

    await trackApproved(
      await getProjectOwnerAddress(signer, projectName),
      projectName,
      networkName,
      integration
    )

    spinner.succeed(
      `${parsedConfig.options.projectName} approved on ${networkName}.`
    )

    if (!skipMonitorStatus) {
      await monitorExecution(
        provider,
        signer,
        parsedConfig,
        bundle,
        bundleId,
        spinner
      )
      await postExecutionActions(
        provider,
        signer,
        parsedConfig,
        await getBundleCompletionTxnHash(ChugSplashManager, bundleId),
        !noWithdraw,
        networkName,
        deploymentFolderPath,
        artifactPaths,
        integration,
        remoteExecution,
        undefined,
        spinner
      )
      displayDeploymentTable(parsedConfig, silent)

      spinner.succeed(`${projectName} successfully deployed on ${networkName}.`)
    }
  }
}

export const chugsplashFundAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  amount: ethers.BigNumber,
  autoEstimate: boolean,
  silent: boolean,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  if (amount.eq(0) && autoEstimate !== true) {
    throw new Error(
      `User must either include an amount to send by specifying '--amount <amountInWei>' or including\n` +
        `the '--auto-estimate' flag to automatically estimate the amount necessary to fund the deployment.`
    )
  }

  if (amount.gt(0) && autoEstimate) {
    throw new Error(
      `User specified an '--amount' flag and an '--auto-estimate' flag. Please choose one.`
    )
  }

  const spinner = ora({ isSilent: silent, stream })

  const parsedConfig = await readParsedChugSplashConfig(
    provider,
    configPath,
    artifactPaths,
    integration
  )
  const projectName = parsedConfig.options.projectName
  const chugsplashManagerAddress = getChugSplashManagerProxyAddress(projectName)
  const signerBalance = await signer.getBalance()
  const networkName = await resolveNetworkName(provider, integration)

  if (!(await isProjectRegistered(signer, projectName))) {
    await errorProjectNotRegistered(provider, configPath, integration)
  }

  const amountToDeposit = autoEstimate
    ? await getAmountToDeposit(
        provider,
        await bundleLocal(parsedConfig, artifactPaths, integration),
        0,
        parsedConfig.options.projectName,
        true
      )
    : amount

  if (amountToDeposit.eq(0)) {
    spinner.fail(
      `No funds were sent. Reason: ${
        autoEstimate
          ? `Project already has sufficient funds.`
          : `User specified an amount of 0.`
      }`
    )
    return
  }

  if (signerBalance.lt(amountToDeposit)) {
    throw new Error(`Signer's balance is less than the amount required to fund your project.

Signer's balance: ${ethers.utils.formatEther(signerBalance)} ETH
Amount: ${ethers.utils.formatEther(amountToDeposit)} ETH

Please send more ETH to ${await signer.getAddress()} on ${networkName} then try again.`)
  }

  spinner.start(
    `Depositing ${formatEther(
      amountToDeposit,
      4
    )} ETH for the project: ${projectName}...`
  )
  const txnRequest = await getGasPriceOverrides(provider, {
    value: amountToDeposit,
    to: chugsplashManagerAddress,
  })
  await (await signer.sendTransaction(txnRequest)).wait()

  await trackFund(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

  spinner.succeed(
    `Deposited ${formatEther(
      amountToDeposit,
      4
    )} ETH for the project: ${projectName}.`
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
  canonicalConfigPath: string,
  deploymentFolder: string,
  integration: Integration,
  skipStorageCheck: boolean,
  executor?: ChugSplashExecutorType,
  stream: NodeJS.WritableStream = process.stderr
): Promise<FoundryContractArtifact[] | undefined> => {
  const spinner = ora({ isSilent: silent, stream })
  const networkName = await resolveNetworkName(provider, integration)

  if (executor === undefined && !remoteExecution) {
    throw new Error(
      'You must pass in a ChugSplashExecutor if executing locally'
    )
  }

  const signerAddress = await signer.getAddress()

  spinner.start('Parsing ChugSplash config file...')

  const userConfig = readUserChugSplashConfig(configPath)
  const parsedConfig = await readParsedChugSplashConfig(
    provider,
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

  assertValidContracts(parsedConfig, artifactPaths)

  await assertValidParsedChugSplashFile(
    provider,
    parsedConfig,
    userConfig,
    artifactPaths,
    integration,
    remoteExecution,
    canonicalConfigPath,
    skipStorageCheck,
    confirm,
    spinner
  )

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

  spinner.start('Setting proxies to reference names...')

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  await setProxiesToReferenceNames(
    provider,
    ChugSplashManager,
    parsedConfig.contracts
  )

  spinner.succeed('Set proxies to reference names.')

  // Get the bundle ID without publishing anything to IPFS.
  const { bundleId, bundle, configUri } = await chugsplashCommitAbstractSubtask(
    provider,
    signer,
    parsedConfig,
    ipfsUrl,
    false,
    artifactPaths,
    canonicalConfigPath,
    integration
  )

  spinner.start(`Checking the status of ${projectName}...`)

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )
  let currBundleStatus = bundleState.status

  if (currBundleStatus === ChugSplashBundleStatus.COMPLETED) {
    await createDeploymentArtifacts(
      provider,
      parsedConfig,
      await getBundleCompletionTxnHash(ChugSplashManager, bundleId),
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
      return
    } else {
      return generateFoundryTestArtifacts(parsedConfig)
    }
  } else if (currBundleStatus === ChugSplashBundleStatus.CANCELLED) {
    spinner.fail(`${projectName} was already cancelled on ${networkName}.`)
    throw new Error(
      `${projectName} was previously cancelled on ${networkName}.`
    )
  }

  if (currBundleStatus === ChugSplashBundleStatus.EMPTY) {
    spinner.succeed(`${projectName} has not been proposed before.`)
    spinner.start(`Proposing ${projectName}...`)
    await proposeChugSplashBundle(
      provider,
      signer,
      parsedConfig,
      bundle,
      configUri,
      remoteExecution,
      ipfsUrl,
      configPath,
      spinner,
      confirm,
      artifactPaths,
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

      await chugsplashFundAbstractTask(
        provider,
        signer,
        configPath,
        amountToDeposit,
        false,
        silent,
        artifactPaths,
        integration,
        stream
      )
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
      spinner
    )
  } else if (executor !== undefined) {
    spinner.start(`Executing ${projectName}...`)
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
    await executor.main(canonicalConfigPath, integration, false)
    spinner.succeed(`Executed ${projectName}.`)
  } else {
    throw new Error(`Local execution specified but no executor was given.`)
  }

  const bundleCompletionTxnHash = await getBundleCompletionTxnHash(
    ChugSplashManager,
    bundleId
  )

  await postExecutionActions(
    provider,
    signer,
    parsedConfig,
    bundleCompletionTxnHash,
    withdraw,
    networkName,
    deploymentFolder,
    artifactPaths,
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
    spinner.info(
      "Thank you for using ChugSplash! We'd love to see you in the Discord: https://discord.gg/m8NXjJcvDR"
    )
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
  canonicalConfigPath: string,
  deploymentFolder: string,
  integration: Integration,
  remoteExecution: boolean,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const networkName = await resolveNetworkName(provider, integration)
  const spinner = ora({ isSilent: silent, stream })
  spinner.start(`Loading project information...`)

  const parsedConfig = await readParsedChugSplashConfig(
    provider,
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
    await errorProjectNotRegistered(provider, configPath, integration)
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

  await monitorExecution(
    provider,
    signer,
    parsedConfig,
    bundle,
    bundleId,
    spinner
  )

  await postExecutionActions(
    provider,
    signer,
    parsedConfig,
    await getBundleCompletionTxnHash(ChugSplashManager, bundleId),
    !noWithdraw,
    networkName,
    deploymentFolder,
    artifactPaths,
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
  const networkName = await resolveNetworkName(provider, integration)

  const parsedConfig = await readParsedChugSplashConfig(
    provider,
    configPath,
    artifactPaths,
    integration
  )
  const projectName = parsedConfig.options.projectName

  const spinner = ora({ stream })
  spinner.start(`Cancelling ${projectName} on ${networkName}.`)

  if (!(await isProjectRegistered(signer, projectName))) {
    await errorProjectNotRegistered(provider, configPath, integration)
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

  await trackCancel(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

  spinner.succeed(
    `Refunded ${formatEther(
      refund,
      4
    )} ETH on ${networkName} to the project owner: ${await signer.getAddress()}.`
  )
}

export const chugsplashWithdrawAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  silent: boolean,
  artifactPaths: ArtifactPaths,
  canonicalConfigPath: string,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const networkName = await resolveNetworkName(provider, integration)
  const parsedConfig = await readParsedChugSplashConfig(
    provider,
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
    await errorProjectNotRegistered(provider, configPath, integration)
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
    canonicalConfigPath,
    integration
  )

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  if (bundleState.status === ChugSplashBundleStatus.APPROVED) {
    errorProjectCurrentlyActive(integration, configPath)
  }

  const amountToWithdraw = await getOwnerWithdrawableAmount(
    provider,
    projectName
  )

  await trackWithdraw(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

  if (amountToWithdraw.gt(0)) {
    await (
      await ChugSplashManager.withdrawOwnerETH(
        await getGasPriceOverrides(provider)
      )
    ).wait()

    spinner.succeed(
      `Withdrew ${formatEther(
        amountToWithdraw,
        4
      )} ETH on ${networkName} to the project owner: ${await signer.getAddress()}.`
    )
  } else {
    spinner.fail(
      `No funds available to withdraw on ${networkName} for the project: ${projectName}.`
    )
  }
}

export const chugsplashListProjectsAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  integration: Integration,
  stream: NodeJS.WritableStream = process.stderr
) => {
  const networkName = await resolveNetworkName(provider, integration)
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
    if (event.args === undefined) {
      throw new Error(
        `No event args found for ChugSplashProjectRegistered. Should never happen.`
      )
    }

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

  await trackListProjects(signerAddress, networkName, integration)

  if (numProjectsOwned > 0) {
    spinner.succeed(
      `Retrieved all projects on ${networkName} owned by: ${signerAddress}`
    )
    console.table(projects)
  } else {
    spinner.fail(`No projects on ${networkName} owned by: ${signerAddress}`)
  }
}

export const chugsplashListProposersAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  artifactPaths: ArtifactPaths,
  integration: Integration
) => {
  const parsedConfig = await readParsedChugSplashConfig(
    provider,
    configPath,
    artifactPaths,
    integration
  )

  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    await errorProjectNotRegistered(provider, configPath, integration)
  }

  const ChugSplashManager = getChugSplashManager(
    signer,
    parsedConfig.options.projectName
  )

  const proposers: Array<string> = []

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
    if (proposerEvent.args === undefined) {
      throw new Error(
        `No args found for ProposerAdded event. Should never happen.`
      )
    }

    const address = proposerEvent.args.proposer
    const isStillProposer = await ChugSplashManager.proposers(address)
    if (isStillProposer && !proposers.includes(address)) {
      proposers.push(address)
    }
  }

  const networkName = await resolveNetworkName(provider, integration)
  const projectName = parsedConfig.options.projectName
  await trackListProposers(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

  // Display the list of proposers
  displayProposerTable(proposers)
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

  const parsedConfig = await readParsedChugSplashConfig(
    provider,
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
    await errorProjectNotRegistered(provider, configPath, integration)
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

  const networkName = await resolveNetworkName(provider, integration)
  const projectName = parsedConfig.options.projectName
  await trackAddProposers(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

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

  const parsedConfig = await readParsedChugSplashConfig(
    provider,
    configPath,
    artifactPaths,
    integration
  )

  // Throw an error if the project has not been registered
  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    await errorProjectNotRegistered(provider, configPath, integration)
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

  const networkName = await resolveNetworkName(provider, integration)
  const projectName = parsedConfig.options.projectName
  await trackClaimProxy(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

  spinner.succeed(`Proxy ownership claimed by address ${signerAddress}`)
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

  const parsedConfig = await readParsedChugSplashConfig(
    provider,
    configPath,
    artifactPaths,
    integration
  )

  // Throw an error if the project has not been registered
  if (
    (await isProjectRegistered(signer, parsedConfig.options.projectName)) ===
    false
  ) {
    await errorProjectNotRegistered(provider, configPath, integration)
  }

  spinner.succeed('Project registration detected')
  spinner.start('Checking proxy compatibility...')

  const networkName = await resolveNetworkName(provider, integration)
  if ((await provider.getCode(proxy)) === '0x') {
    throw new Error(`Proxy is not deployed on ${networkName}: ${proxy}`)
  }

  if (
    (await isDefaultProxy(provider, proxy)) === false &&
    (await isTransparentProxy(provider, proxy)) === false &&
    (await isUUPSProxy(provider, proxy)) === false
  ) {
    throw new Error(`ChugSplash does not support your proxy type.
Currently ChugSplash only supports UUPS and Transparent proxies that implement EIP-1967 which yours does not appear to do.
If you believe this is a mistake, please reach out to the developers or open an issue on GitHub.`)
  }

  // Fetch ChugSplashManager address for this project
  const managerAddress = getChugSplashManagerProxyAddress(
    parsedConfig.options.projectName
  )

  const ownerAddress = await getEIP1967ProxyAdminAddress(provider, proxy)

  // If proxy owner is already ChugSplash, then throw an error
  if (managerAddress.toLowerCase() === ownerAddress.toLowerCase()) {
    throw new Error('Proxy is already owned by ChugSplash')
  }

  // If the signer doesn't own the proxy, then throw an error
  const signerAddress = await signer.getAddress()
  if (ownerAddress.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Proxy is owned by: ${ownerAddress}.
  You attempted to transfer ownership of the proxy using the address: ${signerAddress}`)
  }

  spinner.succeed('Proxy compatibility verified')
  spinner.start('Transferring proxy ownership to ChugSplash...')

  // Transfer ownership of the proxy to the ChugSplashManager.
  const Proxy = new ethers.Contract(proxy, ProxyABI, signer)
  await (
    await Proxy.changeAdmin(
      managerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  const projectName = parsedConfig.options.projectName
  await trackTransferProxy(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

  spinner.succeed('Proxy ownership successfully transferred to ChugSplash')
}

export const proposeChugSplashBundle = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedChugSplashConfig,
  bundle: ChugSplashActionBundle,
  configUri: string,
  remoteExecution: boolean,
  ipfsUrl: string,
  configPath: string,
  spinner: ora.Ora = ora({ isSilent: true }),
  confirm: boolean,
  artifactPaths: ArtifactPaths,
  canonicalConfigPath: string,
  silent: boolean,
  integration: Integration
) => {
  const projectName = parsedConfig.options.projectName

  spinner.start(`Checking if the caller is a proposer...`)

  spinner.succeed(`Caller is a proposer.`)

  spinner.start(`Proposing ${projectName}...`)

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  if (remoteExecution) {
    await chugsplashCommitAbstractSubtask(
      provider,
      signer,
      parsedConfig,
      ipfsUrl,
      true,
      artifactPaths,
      canonicalConfigPath,
      integration,
      spinner
    )
    // Verify that the bundle has been committed to IPFS with the correct bundle hash.
    await verifyBundle({
      configUri,
      bundleId: computeBundleId(bundle.root, bundle.actions.length, configUri),
      ipfsUrl,
      artifactPaths,
      integration,
    })
  }
  // Propose the bundle.
  await (
    await ChugSplashManager.proposeChugSplashBundle(
      bundle.root,
      bundle.actions.length,
      configUri,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  const networkName = await resolveNetworkName(provider, integration)
  await trackProposed(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

  spinner.succeed(`Proposed ${projectName}.`)
}
