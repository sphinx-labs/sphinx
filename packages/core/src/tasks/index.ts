import * as fs from 'fs'
import * as path from 'path'
import process from 'process'

import { ethers } from 'ethers'
import ora from 'ora'
import { getChainId } from '@eth-optimism/core-utils'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'

import { CanonicalChugSplashConfig, ParsedChugSplashConfig } from '../config'
import {
  computeBundleId,
  getChugSplashManager,
  isProjectRegistered,
  registerChugSplashProject,
  writeCanonicalConfig,
} from '../utils'
import { initializeChugSplash } from '../languages'
import { Integration } from '../constants'
import {
  alreadyProposedMessage,
  errorProjectNotRegistered,
  resolveUnknownNetworkName,
  successfulProposalMessage,
} from '../messages'
import {
  bundleLocal,
  ChugSplashActionBundle,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  filterChugSplashInputs,
  getContractArtifact,
  proposeChugSplashBundle,
} from '../actions'
import { getAmountToDeposit } from '../fund'

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

    const networkName = resolveUnknownNetworkName(
      provider.network.name,
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
    errorProjectNotRegistered(
      await getChainId(provider),
      provider.network.name,
      configPath,
      integration
    )
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
    ipfsUrl,
    false,
    buildInfoFolder,
    artifactFolder,
    canonicalConfigPath,
    spinner,
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
        buildInfoFolder,
        artifactFolder,
        canonicalConfigPath,
        silent,
        integration
      )
      const message = successfulProposalMessage(
        amountToDeposit,
        configPath,
        provider.network.name,
        integration
      )
      spinner.succeed(message)
    } else {
      // Bundle was already in the `PROPOSED` state before the call to this task.
      spinner.fail(
        alreadyProposedMessage(
          amountToDeposit,
          configPath,
          provider.network.name,
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
  buildInfoFolder: string,
  artifactFolder: string,
  canonicalConfigPath: string,
  spinner: ora.Ora = ora({ isSilent: true }),
  integration: Integration
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
  let configSourceNames = Object.values(parsedConfig.contracts)
    .map((contractConfig) => contractConfig.contract)
    .map(
      (name) =>
        getContractArtifact(name, artifactFolder, integration).sourceName
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
    artifactFolder,
    buildInfoFolder,
    integration
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

  const bundle = await bundleLocal(
    parsedConfig,
    artifactFolder,
    buildInfoFolder,
    integration
  )

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
    commitToIpfs
      ? spinner.succeed(
          `${parsedConfig.options.projectName} has been committed to IPFS.`
        )
      : spinner.succeed(
          `Built ${parsedConfig.options.projectName} on ${provider.network.name}.`
        )
  }

  return { bundle, configUri, bundleId }
}
