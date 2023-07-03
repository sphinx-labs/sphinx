import process from 'process'

import * as dotenv from 'dotenv'
import { ethers, providers } from 'ethers'
import ora from 'ora'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'
import { ProxyABI } from '@chugsplash/contracts'

import {
  ChugSplashInput,
  ParsedChugSplashConfig,
  contractKindHashes,
  UserChugSplashConfig,
  ConfigArtifacts,
  ParsedProjectConfig,
  ProjectConfigArtifacts,
  ProjectConfigCache,
  CanonicalProjectConfig,
} from '../config/types'
import {
  getDeploymentId,
  displayDeploymentTable,
  formatEther,
  getChugSplashManager,
  getChugSplashRegistry,
  getDeploymentEvents,
  getEIP1967ProxyAdminAddress,
  getGasPriceOverrides,
  isProjectRegistered,
  register,
  writeCanonicalConfig,
  writeSnapshotId,
  transferProjectOwnership,
  isHardhatFork,
} from '../utils'
import { getMinimumCompilerInput } from '../languages'
import { Integration } from '../constants'
import {
  alreadyProposedMessage,
  resolveNetworkName,
  successfulProposalMessage,
} from '../messages'
import {
  ChugSplashBundles,
  DeploymentState,
  DeploymentStatus,
  executeDeployment,
  getNumDeployContractActions,
  makeBundlesFromConfig,
  writeDeploymentArtifacts,
} from '../actions'
import {
  estimateExecutionGas,
  getAmountToDeposit,
  getOwnerWithdrawableAmount,
} from '../fund'
import { monitorExecution } from '../execution'
import { ChugSplashRuntimeEnvironment, ProposalRoute } from '../types'
import {
  trackApproved,
  trackCancel,
  trackExportProxy,
  trackDeployed,
  trackListProjects,
  trackProposed,
  trackRegistrationFinalized,
  trackImportProxy,
} from '../analytics'
import {
  isSupportedNetworkOnEtherscan,
  verifyChugSplashConfig,
} from '../etherscan'
// import { relaySignedRequest, signMetaTxRequest } from '../metatxs'
import { readUserChugSplashConfig } from '../config'
import { verifyDeployment } from '../config/fetch'
import { getChugSplashManagerAddress } from '../addresses'

// Load environment variables from .env
dotenv.config()

export const chugsplashRegisterAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  config: UserChugSplashConfig | ParsedChugSplashConfig,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })

  const { owner } = config.options
  const deployer = getChugSplashManagerAddress(owner)

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(deployer, signer)

  await register(registry, manager, owner, provider, spinner)

  const networkName = await resolveNetworkName(provider, integration)
  const projectOwner = await getChugSplashManager(deployer, signer).owner()

  await trackRegistrationFinalized(projectOwner, networkName, integration)
}

// TODO: update this function
// export const chugsplashProposeAbstractTask = async (
//   provider: ethers.providers.JsonRpcProvider,
//   signer: ethers.Signer,
//   parsedProjectConfig: ParsedProjectConfig,
//   configPath: string,
//   ipfsUrl: string,
//   integration: Integration,
//   configArtifacts: ConfigArtifacts,
//   route: ProposalRoute,
//   cre: ChugSplashRuntimeEnvironment,
//   projectConfigCache: ProjectConfigCache
// ) => {
//   const { networkName } = projectConfigCache
//   const { projectName, deployer } = parsedProjectConfig.options

//   const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
//   if (integration === 'hardhat') {
//     spinner.start('Booting up ChugSplash...')
//   }

//   const registry = getChugSplashRegistry(signer)
//   const manager = getChugSplashManager(deployer, signer)
//   if (!(await isProjectRegistered(registry, manager.address))) {
//     throw new Error(`${projectName} has not been registered yet.`)
//   }

//   if (integration === 'hardhat') {
//     spinner.succeed('ChugSplash is ready to go.')
//   }

//   const { configUri, bundles } = await getBundleInfo(
//     parsedProjectConfig,
//     configArtifacts[projectName],
//     projectConfigCache
//   )
//   const deploymentId = getDeploymentId(bundles, configUri)

//   spinner.start(`Checking the status of ${projectName}...`)

//   const deploymentState: DeploymentState = await manager.deployments(
//     deploymentId
//   )

//   if (
//     deploymentState.status === DeploymentStatus.APPROVED ||
//     deploymentState.status === DeploymentStatus.PROXIES_INITIATED
//   ) {
//     throw new Error(
//       `Project was already proposed and is currently being executed on ${networkName}.`
//     )
//   } else {
//     // If we make it to this point, we know that the deployment is either currently proposed or can be
//     // proposed.

//     // Get the amount that the user must send to the ChugSplashManager to execute the deployment
//     // including a buffer in case the gas price increases during execution.
//     const amountToDeposit = await getAmountToDeposit(
//       provider,
//       bundles,
//       0,
//       parsedProjectConfig,
//       true
//     )

//     if (deploymentState.status === DeploymentStatus.PROPOSED) {
//       throw new Error(
//         await alreadyProposedMessage(
//           provider,
//           amountToDeposit,
//           configPath,
//           integration
//         )
//       )
//     } else {
//       spinner.succeed(`${projectName} can be proposed.`)
//       spinner.start(`Proposing ${projectName}...`)

//       const signerAddress = await signer.getAddress()
//       const metatxs = await proposeChugSplashDeployment(
//         manager,
//         deploymentId,
//         bundles,
//         configUri,
//         route,
//         signerAddress,
//         provider,
//         parsedProjectConfig,
//         projectConfigCache,
//         configArtifacts[projectName],
//         spinner,
//         ipfsUrl
//       )

//       const message = await successfulProposalMessage(
//         provider,
//         amountToDeposit,
//         configPath,
//         integration
//       )
//       spinner.succeed(message)

//       await trackProposed(await manager.owner(), networkName, integration)

//       return metatxs
//     }
//   }
// }

export const chugsplashCommitAbstractSubtask = async (
  parsedProjectConfig: ParsedProjectConfig,
  commitToIpfs: boolean,
  projectConfigArtifacts: ProjectConfigArtifacts,
  ipfsUrl?: string,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<{
  configUri: string
  canonicalConfig: CanonicalProjectConfig
}> => {
  const { projectName } = parsedProjectConfig.options
  if (spinner) {
    commitToIpfs
      ? spinner.start(`Committing ${projectName}...`)
      : spinner.start('Building the project...')
  }

  const chugsplashInputs: Array<ChugSplashInput> = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedProjectConfig.contracts
  )) {
    const { buildInfo } = projectConfigArtifacts[referenceName]

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
        id: buildInfo.id,
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

  const canonicalConfig: CanonicalProjectConfig = {
    ...parsedProjectConfig,
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
      `To commit to IPFS, you must first setup an IPFS project with
Infura: https://app.infura.io/. Once you've done this, copy and paste the following
variables into your .env file:

IPFS_PROJECT_ID: ...
IPFS_API_KEY_SECRET: ...
        `
    )
  }

  const configUri = `ipfs://${ipfsHash}`

  if (spinner) {
    commitToIpfs
      ? spinner.succeed(`${projectName} has been committed to IPFS.`)
      : spinner.succeed(`Built ${projectName}.`)
  }

  return { configUri, canonicalConfig }
}

export const chugsplashApproveAbstractTask = async (
  projectConfigCache: ProjectConfigCache,
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  skipMonitorStatus: boolean,
  projectConfigArtifacts: ProjectConfigArtifacts,
  integration: Integration,
  parsedProjectConfig: ParsedProjectConfig,
  cre: ChugSplashRuntimeEnvironment
) => {
  const { silent, stream } = cre
  const networkName = await resolveNetworkName(provider, integration)

  const spinner = ora({ isSilent: silent, stream })
  const { projectName, deployer } = parsedProjectConfig.options
  spinner.start(`Approving ${projectName} on ${networkName}...`)

  const signerAddress = await signer.getAddress()

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(deployer, signer)

  if (!(await isProjectRegistered(registry, manager.address))) {
    throw new Error(`${projectName} has not been registered yet.`)
  }

  const { configUri, bundles } = await getBundleInfo(
    parsedProjectConfig,
    projectConfigArtifacts,
    projectConfigCache
  )

  const deploymentId = getDeploymentId(bundles, configUri, projectName)
  const deploymentState: DeploymentState = await manager.deployments(
    deploymentId
  )
  const activeDeploymentId = await manager.activeDeploymentId()
  if (deploymentState.status === DeploymentStatus.APPROVED) {
    spinner.succeed(
      `Project has already been approved. It should be executed shortly.`
    )
  } else if (deploymentState.status === DeploymentStatus.COMPLETED) {
    spinner.succeed(`Project was already completed on ${networkName}.`)
  } else if (deploymentState.status === DeploymentStatus.CANCELLED) {
    throw new Error(`Project was already cancelled on ${networkName}.`)
  } else if (activeDeploymentId !== ethers.constants.HashZero) {
    throw new Error(
      `Another project is currently being executed.
Please wait a couple minutes then try again.`
    )
  } else if (deploymentState.status === DeploymentStatus.EMPTY) {
    await approveDeployment(
      projectName,
      bundles,
      configUri,
      manager,
      signerAddress,
      provider
    )

    await trackApproved(await manager.owner(), networkName, integration)

    spinner.succeed(`${projectName} approved on ${networkName}.`)

    if (!skipMonitorStatus) {
      await monitorExecution(
        provider,
        signer,
        parsedProjectConfig,
        bundles,
        deploymentId,
        spinner
      )
      displayDeploymentTable(parsedProjectConfig, silent)

      spinner.succeed(`${projectName} successfully deployed on ${networkName}.`)
    }
  }
}

export const chugsplashFundAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configArtifacts: ProjectConfigArtifacts,
  parsedConfig: ParsedProjectConfig,
  configCache: ProjectConfigCache,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })

  const { projectName, deployer } = parsedConfig.options

  const manager = getChugSplashManager(deployer, signer)
  const registry = getChugSplashRegistry(signer)

  const signerBalance = await signer.getBalance()

  if (!(await isProjectRegistered(registry, manager.address))) {
    throw new Error(`${projectName} has not been registered yet.`)
  }

  const amountToDeposit = await getAmountToDeposit(
    provider,
    makeBundlesFromConfig(
      parsedConfig,
      configArtifacts,
      configCache[projectName]
    ),
    0,
    parsedConfig,
    true
  )

  if (signerBalance.lt(amountToDeposit)) {
    throw new Error(`Signer does not have enough funds to deposit.`)
  }

  const txnRequest = await getGasPriceOverrides(provider, {
    value: amountToDeposit,
    to: manager.address,
  })
  await (await signer.sendTransaction(txnRequest)).wait()

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
  canonicalConfigPath: string,
  deploymentFolder: string,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment,
  configOwner: string, // TODO: rm
  parsedProjectConfig: ParsedProjectConfig,
  projectConfigCache: ProjectConfigCache,
  projectConfigArtifacts: ProjectConfigArtifacts,
  newOwner?: string,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<void> => {
  const { projectName, deployer } = parsedProjectConfig.options
  const { networkName, blockGasLimit, localNetwork } = projectConfigCache

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(deployer, signer)

  // Register the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the user-defined new owner, if it exists.
  const signerAddress = await signer.getAddress()
  await register(registry, manager, signerAddress, provider, spinner)

  spinner.start(`Checking the status of ${projectName}...`)

  const { configUri, bundles, canonicalConfig } = await getBundleInfo(
    parsedProjectConfig,
    projectConfigArtifacts,
    projectConfigCache
  )

  if (
    bundles.actionBundle.actions.length === 0 &&
    bundles.targetBundle.targets.length === 0
  ) {
    spinner.succeed(`Nothing to execute in this deployment. Exiting early.`)
    return
  }

  const deploymentId = getDeploymentId(bundles, configUri, projectName)
  const deploymentState: DeploymentState = await manager.deployments(
    deploymentId
  )
  const initialDeploymentStatus = deploymentState.status
  let currDeploymentStatus = deploymentState.status

  if (currDeploymentStatus === DeploymentStatus.CANCELLED) {
    throw new Error(
      `${projectName} was previously cancelled on ${networkName}.`
    )
  }

  for (const [referenceName, contractConfig] of Object.entries(
    parsedProjectConfig.contracts
  )) {
    if (contractConfig.isUserDefinedAddress) {
      const existingProjectName =
        projectConfigCache.contractConfigCache[referenceName]
          .existingProjectName

      if (existingProjectName !== projectName) {
        await manager.transferContractToProject(
          contractConfig.address,
          projectName,
          await getGasPriceOverrides(provider)
        )
      }
    }
  }

  if (currDeploymentStatus === DeploymentStatus.EMPTY) {
    spinner.succeed(`${projectName} has not been deployed before.`)
    spinner.start(`Approving ${projectName}...`)
    await (
      await manager.approve(
        projectName,
        bundles.actionBundle.root,
        bundles.targetBundle.root,
        bundles.actionBundle.actions.length,
        bundles.targetBundle.targets.length,
        getNumDeployContractActions(bundles.actionBundle),
        configUri,
        false,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    currDeploymentStatus = DeploymentStatus.APPROVED
    spinner.succeed(`Approved ${projectName}.`)
  }

  if (
    currDeploymentStatus === DeploymentStatus.APPROVED ||
    currDeploymentStatus === DeploymentStatus.PROXIES_INITIATED
  ) {
    spinner.start(`Executing ${projectName}...`)

    const success = await executeDeployment(
      manager,
      bundles,
      blockGasLimit,
      projectConfigArtifacts,
      provider
    )

    if (!success) {
      throw new Error(
        `Failed to execute ${projectName}, likely because one of the user's constructors reverted during the deployment.`
      )
    }
  }

  initialDeploymentStatus === DeploymentStatus.COMPLETED
    ? spinner.succeed(`${projectName} was already completed on ${networkName}.`)
    : spinner.succeed(`Executed ${projectName}.`)

  if (newOwner) {
    spinner.start(`Transferring ownership to: ${newOwner}`)
    await transferProjectOwnership(
      manager,
      newOwner,
      signerAddress,
      provider,
      spinner
    )
    spinner.succeed(`Transferred ownership to: ${newOwner}`)
  }

  // TODO(post): foundry: this must only be called if the deployment was broadcasted.
  await postDeploymentActions(
    canonicalConfig,
    projectConfigArtifacts,
    deploymentId,
    canonicalConfigPath,
    configUri,
    localNetwork,
    networkName,
    deploymentFolder,
    integration,
    cre.silent,
    manager.owner(),
    provider,
    manager,
    spinner,
    process.env.ETHERSCAN_API_KEY
  )
}

// TODO(post): we need to make `provider` an optional parameter. it should be undefined on the in-process
// anvil node, and defined in all other cases, including the stand-alone anvil node.
export const postDeploymentActions = async (
  canonicalProjectConfig: CanonicalProjectConfig,
  projectConfigArtifacts: ProjectConfigArtifacts,
  deploymentId: string,
  canonicalConfigPath: string,
  configUri: string,
  localNetwork: boolean,
  networkName: string,
  deploymentFolder: string,
  integration: Integration,
  silent: boolean,
  owner: string,
  provider: ethers.providers.JsonRpcProvider,
  manager: ethers.Contract,
  spinner?: ora.Ora,
  etherscanApiKey?: string
) => {
  spinner?.start(`Writing deployment artifacts...`)

  if (integration === 'hardhat') {
    writeCanonicalConfig(canonicalConfigPath, configUri, canonicalProjectConfig)
  }

  await trackDeployed(owner, networkName, integration)

  // Only write deployment artifacts if the deployment was completed in the last 150 blocks.
  // This can be anywhere from 5 minutes to half an hour depending on the network
  await writeDeploymentArtifacts(
    provider,
    canonicalProjectConfig,
    await getDeploymentEvents(manager, deploymentId),
    networkName,
    deploymentFolder,
    projectConfigArtifacts
  )

  spinner?.succeed(`Wrote deployment artifacts.`)

  // TODO(post): wait to see if Foundry can automatically verify the contracts. It's unlikely because we
  // deploy them in a non-standard way, but it's possible. If foundry can do it, we should just
  // never pass in the `etherscanApiKey`. if foundry can't do it, we should  retrieve the api key
  // via `execAsync(forge config --json)` and pass it in here

  if (isSupportedNetworkOnEtherscan(networkName) && etherscanApiKey) {
    if (etherscanApiKey) {
      await verifyChugSplashConfig(
        canonicalProjectConfig,
        projectConfigArtifacts,
        provider,
        networkName,
        etherscanApiKey
      )
    } else {
      spinner?.fail(`No Etherscan API Key detected. Skipped verification.`)
    }
  }

  if (integration === 'hardhat') {
    try {
      if (localNetwork || (await isHardhatFork(provider))) {
        // We save the snapshot ID here so that tests on the stand-alone Hardhat network can be run
        // against the most recently deployed contracts.
        await writeSnapshotId(provider, networkName, deploymentFolder)
      }
    } catch (e) {
      if (!e.message.includes('hardhat_metadata')) {
        throw e
      }
    }

    displayDeploymentTable(canonicalProjectConfig, silent)
    spinner?.info(
      "Thank you for using ChugSplash! We'd love to see you in the Discord: https://discord.gg/7Gc3DK33Np"
    )
  }
}

export const chugsplashCancelAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  projectName: string,
  configPath: string,
  integration: Integration,
  cre: ChugSplashRuntimeEnvironment
) => {
  const networkName = await resolveNetworkName(provider, integration)

  const userConfig = await readUserChugSplashConfig(configPath)
  const deployer = getChugSplashManagerAddress(userConfig.options.owner)

  const spinner = ora({ stream: cre.stream })
  spinner.start(`Cancelling deployment for ${projectName} on ${networkName}.`)
  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(deployer, signer)

  if (!(await isProjectRegistered(registry, manager.address))) {
    throw new Error(`Project has not been registered yet.`)
  }

  const projectOwnerAddress = await manager.owner()
  if (projectOwnerAddress !== (await signer.getAddress())) {
    throw new Error(`Project is owned by: ${projectOwnerAddress}.
You attempted to cancel the project using the address: ${await signer.getAddress()}`)
  }

  const activeDeploymentId = await manager.activeDeploymentId()

  if (activeDeploymentId === ethers.constants.HashZero) {
    spinner.fail(
      `${projectName} does not have an active project, so there is nothing to cancel.`
    )
    return
  }

  await (
    await manager.cancelActiveChugSplashDeployment(
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Cancelled deployment for ${projectName} on ${networkName}.`)

  await trackCancel(await manager.owner(), networkName, integration)
}

export const chugsplashExportProxyAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  configPath: string,
  projectNamel: string,
  referenceName: string,
  integration: Integration,
  parsedConfig: ParsedChugSplashConfig,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  spinner.start('Checking project registration...')

  const deployer = getChugSplashManagerAddress(parsedConfig.options.owner)

  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(deployer, signer)

  // Throw an error if the project has not been registered
  if ((await isProjectRegistered(registry, manager.address)) === false) {
    throw new Error(`Project has not been registered yet.`)
  }

  const projectOwner = await manager.owner()

  const signerAddress = await signer.getAddress()
  if (projectOwner !== signerAddress) {
    throw new Error(`Caller does not own the organization.`)
  }

  spinner.succeed('Project registration detected')
  spinner.start('Claiming proxy ownership...')

  const activeDeploymentId = await manager.activeDeploymentId()
  if (activeDeploymentId !== ethers.constants.HashZero) {
    throw new Error(
      `A project is currently being executed. Proxy ownership has not been transferred.
  Please wait a couple of minutes before trying again.`
    )
  }

  const targetContract =
    parsedConfig.projects[projectNamel].contracts[referenceName]
  await (
    await manager.exportProxy(
      targetContract.address,
      contractKindHashes[targetContract.kind],
      signerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  const networkName = await resolveNetworkName(provider, integration)
  await trackExportProxy(projectOwner, networkName, integration)

  spinner.succeed(`Proxy ownership claimed by address ${signerAddress}`)
}

export const chugsplashImportProxyAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  proxy: string,
  integration: Integration,
  owner: string,
  cre: ChugSplashRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  spinner.start('Checking project registration...')

  const deployer = getChugSplashManagerAddress(owner)
  const registry = getChugSplashRegistry(signer)
  const manager = getChugSplashManager(deployer, signer)

  // Throw an error if the project has not been registered
  if ((await isProjectRegistered(registry, manager.address)) === false) {
    throw new Error(`Project has not been registered yet.`)
  }

  spinner.succeed('Project registration detected')
  spinner.start('Checking proxy compatibility...')

  const networkName = await resolveNetworkName(provider, integration)
  if ((await provider.getCode(proxy)) === '0x') {
    throw new Error(`Proxy is not deployed on ${networkName}: ${proxy}`)
  }

  // TODO: These checks were written when we didn't prompt the user for their proxy type. Now that
  // we do, we should run just the function that corresponds to the proxy type they selected. E.g.
  // if they selected oz-uups, then we should only run `isUUPSProxy`. Also, the
  // `isInternalDefaultProxy` function relies on the `DefaultProxyDeployed` event, which no longer
  // exists. I'm not even sure we need `isInternalDefaultProxy` anymore, so we should first figure
  // that out.
  //   if (
  //     (await isInternalDefaultProxy(provider, proxy)) === false &&
  //     (await isTransparentProxy(provider, proxy)) === false &&
  //     (await isUUPSProxy(provider, proxy)) === false
  //   ) {
  //     throw new Error(`ChugSplash does not support your proxy type.
  // Currently ChugSplash only supports UUPS and Transparent proxies that implement EIP-1967 which yours does not appear to do.
  // If you believe this is a mistake, please reach out to the developers or open an issue on GitHub.`)
  //   }

  const ownerAddress = await getEIP1967ProxyAdminAddress(provider, proxy)

  // If proxy owner is already ChugSplash, then throw an error
  if (
    ethers.utils.getAddress(manager.address) ===
    ethers.utils.getAddress(ownerAddress)
  ) {
    throw new Error('Proxy is already owned by ChugSplash')
  }

  // If the signer doesn't own the proxy, then throw an error
  const signerAddress = await signer.getAddress()
  if (
    ethers.utils.getAddress(ownerAddress) !==
    ethers.utils.getAddress(signerAddress)
  ) {
    throw new Error(`Proxy is owned by: ${ownerAddress}.
  You attempted to transfer ownership of the proxy using the address: ${signerAddress}`)
  }

  spinner.succeed('Proxy compatibility verified')
  spinner.start('Transferring proxy ownership to ChugSplash...')

  // Transfer ownership of the proxy to the ChugSplashManager.
  const Proxy = new ethers.Contract(proxy, ProxyABI, signer)
  await (
    await Proxy.changeAdmin(
      manager.address,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  await trackImportProxy(await manager.owner(), networkName, integration)

  spinner.succeed('Proxy ownership successfully transferred to ChugSplash')
}

// TODO: update this function
// export const proposeChugSplashDeployment = async (
//   manager: ethers.Contract,
//   deploymentId: string,
//   bundles: ChugSplashBundles,
//   configUri: string,
//   route: ProposalRoute,
//   signerAddress: string,
//   provider: ethers.providers.JsonRpcProvider,
//   parsedProjectConfig: ParsedProjectConfig,
//   projectConfigCache: ProjectConfigCache,
//   projectConfigArtifacts: ProjectConfigArtifacts,
//   spinner: ora.Ora = ora({ isSilent: true }),
//   ipfsUrl?: string
// ) => {
//   spinner.start(`Checking if the caller is a proposer...`)
//   const { projectName } = parsedProjectConfig.options

//   // Throw an error if the caller isn't the project owner or a proposer.
//   if (!(await manager.isProposer(signerAddress))) {
//     throw new Error(
//       `Caller is not a proposer for this project. Caller's address: ${signerAddress}`
//     )
//   }

//   spinner.succeed(`Caller is a proposer.`)

//   spinner.start(`Proposing for organization ${projectName}...`)

//   if (
//     route === ProposalRoute.RELAY ||
//     route === ProposalRoute.REMOTE_EXECUTION
//   ) {
//     await chugsplashCommitAbstractSubtask(
//       parsedProjectConfig,
//       true,
//       projectConfigArtifacts,
//       ipfsUrl,
//       spinner
//     )

//     // Verify that the deployment has been committed to IPFS with the correct bundle hash.
//     await verifyDeployment(
//       configUri,
//       deploymentId,
//       projectConfigArtifacts,
//       projectConfigCache,
//       ipfsUrl
//     )
//   }

//   // Propose the deployment.
//   if (route === ProposalRoute.RELAY) {
//     if (!process.env.PRIVATE_KEY) {
//       throw new Error(
//         'Must provide a PRIVATE_KEY environment variable to sign gasless proposal transactions'
//       )
//     }

//     if (!process.env.CHUGSPLASH_API_KEY) {
//       throw new Error(
//         'Must provide a CHUGSPLASH_API_KEY environment variable to use gasless proposals'
//       )
//     }

//     const { signature, request } = await signMetaTxRequest(
//       provider,
//       process.env.PRIVATE_KEY,
//       {
//         from: signerAddress,
//         to: manager.address,
//         data: manager.interface.encodeFunctionData('gaslesslyPropose', [
//           bundles.actionBundle.root,
//           bundles.targetBundle.root,
//           bundles.actionBundle.actions.length,
//           bundles.targetBundle.targets.length,
//           getNumDeployContractActions(bundles.actionBundle),
//           configUri,
//           true,
//         ]),
//       }
//     )

//     // Send the signed meta transaction to the ChugSplashManager via relay
//     if (process.env.LOCAL_TEST_METATX_PROPOSE !== 'true') {
//       const estimatedCost = await estimateExecutionGas(provider, bundles, 0)
//       await relaySignedRequest(
//         signature,
//         request,
//         parsedProjectConfig.options.deployer,
//         deploymentId,
//         provider.network.chainId,
//         estimatedCost
//       )
//     }

//     // Returning these values allows us to test meta transactions locally
//     return { signature, request, deploymentId }
//   } else {
//     await (
//       await manager.propose(
//         bundles.actionBundle.root,
//         bundles.targetBundle.root,
//         bundles.actionBundle.actions.length,
//         bundles.targetBundle.targets.length,
//         getNumDeployContractActions(bundles.actionBundle),
//         configUri,
//         route === ProposalRoute.REMOTE_EXECUTION,
//         await getGasPriceOverrides(provider)
//       )
//     ).wait()
//   }

//   spinner.succeed(`Proposed for organization ${projectName}.`)
// }

export const getBundleInfo = async (
  parsedProjectConfig: ParsedProjectConfig,
  projectConfigArtifacts: ProjectConfigArtifacts,
  projectConfigCache: ProjectConfigCache
): Promise<{
  configUri: string
  canonicalConfig: CanonicalProjectConfig
  bundles: ChugSplashBundles
}> => {
  const { configUri, canonicalConfig } = await chugsplashCommitAbstractSubtask(
    parsedProjectConfig,
    false,
    projectConfigArtifacts
  )

  const bundles = makeBundlesFromConfig(
    parsedProjectConfig,
    projectConfigArtifacts,
    projectConfigCache
  )

  return { configUri, canonicalConfig, bundles }
}

export const approveDeployment = async (
  projectName: string,
  bundles: ChugSplashBundles,
  configUri: string,
  manager: ethers.Contract,
  signerAddress: string,
  provider: providers.Provider
) => {
  const projectOwnerAddress = await manager.owner()
  if (signerAddress !== projectOwnerAddress) {
    throw new Error(
      `Caller is not the project owner.\n` +
        `Caller's address: ${signerAddress}\n` +
        `Owner's address: ${projectOwnerAddress}`
    )
  }

  await (
    await manager.approve(
      projectName,
      bundles.actionBundle.root,
      bundles.targetBundle.root,
      bundles.actionBundle.actions.length,
      bundles.targetBundle.targets.length,
      getNumDeployContractActions(bundles.actionBundle),
      configUri,
      false,
      await getGasPriceOverrides(provider)
    )
  ).wait()
}
