import * as fs from 'fs'
import path from 'path'

import {
  chugsplashProposeAbstractTask,
  chugsplashClaimAbstractTask,
  chugsplashListProjectsAbstractTask,
  chugsplashCancelAbstractTask,
  chugsplashExportProxyAbstractTask,
  chugsplashImportProxyAbstractTask,
  getEIP1967ProxyAdminAddress,
  readValidatedChugSplashConfig,
  getDefaultProxyAddress,
  readUserChugSplashConfig,
  getCreate3Address,
  getChugSplashManagerAddress,
  getNonProxyCreate3Salt,
  getBootloaderTwoConstructorArgs,
  bootloaderTwoConstructorFragment,
  readUnvalidatedParsedConfig,
  ProposalRoute,
  postParsingValidation,
  getChugSplashRegistryReadOnly,
  getCanonicalConfigData,
  getPreviousConfigUri,
  isLocalNetwork,
  postDeploymentActions,
  CanonicalChugSplashConfig,
  getChugSplashManagerReadOnly,
  writeCanonicalConfig,
  DeploymentState,
  ConfigArtifacts,
  FailureAction,
  initializeChugSplash,
} from '@chugsplash/core'
import { Contract, ethers } from 'ethers'
import {
  ChugSplashBootloaderOneArtifact,
  ChugSplashBootloaderTwoArtifact,
} from '@chugsplash/contracts'
import { remove0x } from '@eth-optimism/core-utils'

import {
  cleanPath,
  fetchPaths,
  getPaths,
  makeGetConfigArtifacts,
} from './utils'
import { createChugSplashRuntime } from '../utils'

const args = process.argv.slice(2)
const command = args[0]

// These variables are used to capture any errors or warnings that occur during the ChugSplash
// config validation process.
let validationWarnings: string = ''
let validationErrors: string = ''
// This function overrides the default 'stderr.write' function to capture any errors or warnings
// that occur during the validation process.
const validationStderrWrite = (message: string) => {
  if (message.startsWith('\nWarning: ')) {
    validationWarnings += message.replace('\n', '')
  } else if (message.startsWith('\nError: ')) {
    // We remove '\nError: ' because Foundry already displays the word "Error" when an error occurs.
    validationErrors += message.replace('\nError: ', '')
  } else {
    validationErrors += message
  }
  return true
}

const decodeCachedConfig = async (encodedConfigCache: string) => {
  const { artifactFolder } = await getPaths()
  const ChugSplashUtilsABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(`${artifactFolder}/ChugSplashUtils.sol/ChugSplashUtils.json`).abi
  const configCacheType = ChugSplashUtilsABI.find(
    (fragment) => fragment.name === 'configCache'
  ).outputs[0]

  const configCache = ethers.utils.defaultAbiCoder.decode(
    [configCacheType],
    encodedConfigCache
  )[0]

  const structuredConfigCache = {
    blockGasLimit: configCache.blockGasLimit,
    localNetwork: configCache.localNetwork,
    networkName: configCache.networkName,
    contractConfigCache: {},
  }

  for (const cachedContract of configCache.contractConfigCache) {
    structuredConfigCache.contractConfigCache[cachedContract.referenceName] = {
      referenceName: cachedContract.referenceName,
      isTargetDeployed: cachedContract.isTargetDeployed,
      deploymentRevert: {
        deploymentReverted: cachedContract.deploymentRevert.deploymentReverted,
        deploymentRevertReason: cachedContract.deploymentRevert.revertString
          .exists
          ? cachedContract.deploymentRevert.revertString.value
          : undefined,
      },
      importCache: {
        requiresImport: cachedContract.importCache.requiresImport,
        currProxyAdmin: cachedContract.importCache.currProxyAdmin.exists
          ? cachedContract.importCache.currProxyAdmin.value
          : undefined,
      },
      deployedCreationCodeWithArgsHash: cachedContract
        .deployedCreationCodeWithArgsHash.exists
        ? cachedContract.deployedCreationCodeWithArgsHash.value
        : undefined,
      isImplementationDeployed: cachedContract.isImplementationDeployed.exists
        ? cachedContract.isImplementationDeployed.value
        : undefined,
      previousConfigUri: cachedContract.previousConfigUri.exists
        ? cachedContract.previousConfigUri.value
        : undefined,
    }
  }

  return structuredConfigCache
}

export const getEncodedFailure = (err: Error): string => {
  // Trim a trailing '\n' character from the end of 'warnings' if it exists.
  const prettyWarnings = getPrettyWarnings()

  let prettyError: string
  if (err.name === 'ValidationError') {
    // We return the error messages and warnings.

    // Removes unnecessary '\n' characters from the end of 'errors'
    prettyError = validationErrors.endsWith('\n\n')
      ? validationErrors.substring(0, validationErrors.length - 2)
      : validationErrors
  } else {
    // A non-parsing error occurred. We return the error message and stack trace.
    prettyError = `${err.name}: ${err.message}\n\n${err.stack}`
  }

  const encodedErrorsAndWarnings = ethers.utils.defaultAbiCoder.encode(
    ['string', 'string'],
    [prettyError, prettyWarnings]
  )

  const encodedFailure = ethers.utils.hexConcat([
    encodedErrorsAndWarnings,
    ethers.utils.defaultAbiCoder.encode(['bool'], [false]), // false = failure
  ])

  return encodedFailure
}

// Removes a '\n' character from the end of 'warnings' if it exists.
const getPrettyWarnings = (): string => {
  return validationWarnings.endsWith('\n\n')
    ? validationWarnings.substring(0, validationWarnings.length - 1)
    : validationWarnings
}

;(async () => {
  switch (command) {
    case 'claim': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const silent = args[5] === 'true'
      const outPath = cleanPath(args[6])
      const buildInfoPath = cleanPath(args[7])
      let owner = args[8]
      const allowManagedProposals = args[9] === 'true'

      const { artifactFolder, buildInfoFolder, canonicalConfigFolder } =
        fetchPaths(outPath, buildInfoPath)

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const cre = await createChugSplashRuntime(
        configPath,
        false,
        true,
        canonicalConfigFolder,
        undefined,
        silent,
        process.stdout
      )

      const wallet = new ethers.Wallet(privateKey, provider)

      const { parsedConfig } = await readValidatedChugSplashConfig(
        configPath,
        provider,
        cre,
        makeGetConfigArtifacts(artifactFolder, buildInfoFolder)
      )

      const address = await wallet.getAddress()
      owner = owner !== 'self' ? owner : address

      if (!silent) {
        console.log('-- ChugSplash Claim --')
      }
      await chugsplashClaimAbstractTask(
        provider,
        wallet,
        parsedConfig,
        allowManagedProposals,
        owner,
        'foundry',
        cre
      )
      break
    }
    case 'propose': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const silent = args[5] === 'true'
      const outPath = cleanPath(args[6])
      const buildInfoPath = cleanPath(args[7])
      const ipfsUrl = args[8] !== 'none' ? args[8] : ''

      const { artifactFolder, buildInfoFolder, canonicalConfigFolder } =
        fetchPaths(outPath, buildInfoPath)

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const remoteExecution = !(await isLocalNetwork(provider))
      const cre = await createChugSplashRuntime(
        configPath,
        remoteExecution,
        true,
        canonicalConfigFolder,
        undefined,
        silent,
        process.stdout
      )

      const { parsedConfig, configArtifacts, configCache } =
        await readValidatedChugSplashConfig(
          configPath,
          provider,
          cre,
          makeGetConfigArtifacts(artifactFolder, buildInfoFolder)
        )
      const wallet = new ethers.Wallet(privateKey, provider)

      if (!silent) {
        console.log('-- ChugSplash Propose --')
      }
      await chugsplashProposeAbstractTask(
        provider,
        wallet,
        parsedConfig,
        configPath,
        ipfsUrl,
        'foundry',
        configArtifacts,
        ProposalRoute.REMOTE_EXECUTION,
        cre,
        configCache
      )
      break
    }
    case 'cancel': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)

      const cre = await createChugSplashRuntime(
        configPath,
        false,
        true,
        '',
        undefined,
        false,
        process.stdout
      )

      console.log('-- ChugSplash Cancel --')
      await chugsplashCancelAbstractTask(
        provider,
        wallet,
        configPath,
        'foundry',
        cre
      )
      break
    }
    case 'listProjects': {
      const rpcUrl = args[1]
      const network = args[2] !== 'localhost' ? args[2] : undefined
      const privateKey = args[3]

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)

      const cre = await createChugSplashRuntime(
        '',
        false,
        true,
        '',
        undefined,
        false,
        process.stdout
      )

      console.log('-- ChugSplash List Projects --')
      await chugsplashListProjectsAbstractTask(provider, wallet, 'foundry', cre)
      break
    }
    case 'exportProxy': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const silent = args[5] === 'true'
      const outPath = cleanPath(args[6])
      const buildInfoPath = cleanPath(args[7])
      const referenceName = args[8]

      const { artifactFolder, buildInfoFolder, canonicalConfigFolder } =
        fetchPaths(outPath, buildInfoPath)

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const cre = await createChugSplashRuntime(
        configPath,
        false,
        true,
        canonicalConfigFolder,
        undefined,
        silent,
        process.stdout
      )

      const { parsedConfig } = await readValidatedChugSplashConfig(
        configPath,
        provider,
        cre,
        makeGetConfigArtifacts(artifactFolder, buildInfoFolder)
      )

      const wallet = new ethers.Wallet(privateKey, provider)

      if (!silent) {
        console.log('-- ChugSplash Export Proxy --')
      }
      await chugsplashExportProxyAbstractTask(
        provider,
        wallet,
        configPath,
        referenceName,
        'foundry',
        parsedConfig,
        cre
      )
      break
    }
    case 'importProxy': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const silent = args[5] === 'true'
      const proxyAddress = args[6]

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)

      const cre = await createChugSplashRuntime(
        configPath,
        false,
        true,
        '',
        undefined,
        silent,
        process.stdout
      )

      if (!silent) {
        console.log('-- ChugSplash Import Proxy --')
      }
      await chugsplashImportProxyAbstractTask(
        provider,
        wallet,
        configPath,
        proxyAddress,
        'foundry',
        cre
      )
      break
    }
    case 'getAddress': {
      const configPath = args[1]
      const referenceName = args[2]

      const userConfig = await readUserChugSplashConfig(configPath)

      const { projectName, organizationID } = userConfig.options
      const managerAddress = getChugSplashManagerAddress(organizationID)

      if (userConfig.contracts[referenceName].kind === 'no-proxy') {
        const address = getCreate3Address(
          managerAddress,
          getNonProxyCreate3Salt(
            projectName,
            referenceName,
            userConfig.contracts[referenceName].salt ??
              ethers.constants.HashZero
          )
        )
        process.stdout.write(address)
      } else {
        const proxy =
          userConfig.contracts[referenceName].externalProxy ||
          getDefaultProxyAddress(organizationID, projectName, referenceName)
        process.stdout.write(proxy)
      }
      break
    }
    case 'getEIP1967ProxyAdminAddress': {
      const rpcUrl = args[1]
      const proxyAddress = args[2]

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
      const adminAddress = await getEIP1967ProxyAdminAddress(
        provider,
        proxyAddress
      )

      process.stdout.write(adminAddress)
      break
    }
    case 'getMinimalParsedConfig': {
      process.stderr.write = validationStderrWrite

      try {
        const configPath = args[1]

        const { artifactFolder, buildInfoFolder, canonicalConfigFolder } =
          await getPaths()

        const cre = await createChugSplashRuntime(
          configPath,
          false,
          true,
          canonicalConfigFolder,
          undefined,
          false,
          process.stderr
        )

        const getConfigArtifacts = makeGetConfigArtifacts(
          artifactFolder,
          buildInfoFolder
        )

        const { minimalParsedConfig } = await readUnvalidatedParsedConfig(
          configPath,
          cre,
          getConfigArtifacts,
          FailureAction.THROW
        )

        const ChugSplashUtilsABI =
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require(`${artifactFolder}/ChugSplashUtils.sol/ChugSplashUtils.json`).abi
        const minimalParsedConfigType = ChugSplashUtilsABI.find(
          (fragment) => fragment.name === 'minimalParsedConfig'
        ).outputs[0]

        const prettyWarnings = getPrettyWarnings()

        const encodedConfigAndWarnings = ethers.utils.defaultAbiCoder.encode(
          [minimalParsedConfigType, 'string'],
          [minimalParsedConfig, prettyWarnings]
        )

        const encodedSuccess = ethers.utils.hexConcat([
          encodedConfigAndWarnings,
          ethers.utils.defaultAbiCoder.encode(['bool'], [true]), // true = success
        ])

        process.stdout.write(encodedSuccess)
      } catch (err) {
        const encodedFailure = getEncodedFailure(err)
        process.stdout.write(encodedFailure)
      }
      break
    }
    case 'getCanonicalConfigData': {
      process.stderr.write = validationStderrWrite

      try {
        const encodedConfigCache = args[1]
        const configPath = args[2]
        const configCache = await decodeCachedConfig(encodedConfigCache)

        const { artifactFolder, buildInfoFolder, canonicalConfigFolder } =
          await getPaths()

        const cre = await createChugSplashRuntime(
          configPath,
          false,
          true,
          canonicalConfigFolder,
          undefined,
          false,
          process.stderr
        )

        const getConfigArtifacts = makeGetConfigArtifacts(
          artifactFolder,
          buildInfoFolder
        )

        // TODO: should we just do `readValidatedParsedConfig` here?
        const { parsedConfig, configArtifacts } =
          await readUnvalidatedParsedConfig(
            configPath,
            cre,
            getConfigArtifacts,
            FailureAction.THROW
          )

        await postParsingValidation(
          parsedConfig,
          configArtifacts,
          cre,
          configCache,
          FailureAction.THROW
        )

        const { configUri, bundles } = await getCanonicalConfigData(
          parsedConfig,
          configArtifacts,
          configCache
        )

        // writeCanonicalConfig(canonicalConfigFolder, configUri, canonicalConfig)

        // const ipfsHash = configUri.replace('ipfs://', '')
        // const cachePath = path.resolve('./cache')
        // // Create the canonical config network folder if it doesn't already exist.
        // if (!fs.existsSync(cachePath)) {
        //   fs.mkdirSync(cachePath)
        // }

        // // Write the canonical config to the local file system. It will exist in a JSON file that has the
        // // config URI as its name.
        // fs.writeFileSync(
        //   path.join(cachePath, `${ipfsHash}.json`),
        //   JSON.stringify(configArtifacts, null, 2)
        // )

        const ChugSplashUtilsABI =
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require(`${artifactFolder}/ChugSplashUtils.sol/ChugSplashUtils.json`).abi

        const encodedConfigUriAndWarnings = ethers.utils.defaultAbiCoder.encode(
          ['string', 'string'],
          [configUri, getPrettyWarnings()]
        )

        const actionBundleType = ChugSplashUtilsABI.find(
          (fragment) => fragment.name === 'actionBundle'
        ).outputs[0]
        const encodedActionBundle = ethers.utils.defaultAbiCoder.encode(
          [actionBundleType],
          [bundles.actionBundle]
        )
        const targetBundleType = ChugSplashUtilsABI.find(
          (fragment) => fragment.name === 'targetBundle'
        ).outputs[0]
        const encodedTargetBundle = ethers.utils.defaultAbiCoder.encode(
          [targetBundleType],
          [bundles.targetBundle]
        )

        // TODO(docs): update this and below: This is where the encoded config URI ends and the
        // encoded action bundle begins (in bytes).
        const splitIdx1 = remove0x(encodedActionBundle).length / 2
        // This is where the encoded action bundle begins and the encoded target bundle begins (in bytes).
        const splitIdx2 = splitIdx1 + remove0x(encodedTargetBundle).length / 2
        const encodedSplitIdxs = ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256'],
          [splitIdx1, splitIdx2]
        )

        const encodedSuccess = ethers.utils.hexConcat([
          encodedActionBundle,
          encodedTargetBundle,
          encodedConfigUriAndWarnings,
          encodedSplitIdxs,
          ethers.utils.defaultAbiCoder.encode(['bool'], [true]), // true = success
        ])

        process.stdout.write(encodedSuccess)
      } catch (err) {
        const encodedFailure = getEncodedFailure(err)
        process.stdout.write(encodedFailure)
      }

      break
    }
    case 'getPreviousConfigUri': {
      const rpcUrl = args[1]
      const proxyAddress = args[2]
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
      const registry = await getChugSplashRegistryReadOnly(provider)

      const configUri = await getPreviousConfigUri(
        provider,
        registry,
        proxyAddress
      )

      const exists = configUri !== undefined

      const encodedCanonicalConfigUri = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'string'],
        [exists, configUri ?? '']
      )

      process.stdout.write(encodedCanonicalConfigUri)
      break
    }
    case 'deployOnAnvil': {
      const provider = new ethers.providers.JsonRpcProvider(
        'http://localhost:8545'
      )
      const wallet = new ethers.Wallet(
        '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
        provider
      )

      try {
        await initializeChugSplash(provider, wallet, [], [], [])
      } catch (e) {
        if (!e.reason.includes('could not detect network')) {
          throw e
        }
      }

      break
    }
    case 'generateArtifacts': {
      const { canonicalConfigFolder, deploymentFolder } = await getPaths()

      const configPath = args[1]
      const networkName = args[2]
      const rpcUrl = args[3]

      const provider: ethers.providers.JsonRpcProvider =
        new ethers.providers.JsonRpcProvider(rpcUrl)

      const config = await readUserChugSplashConfig(configPath)

      const manager: Contract = await getChugSplashManagerReadOnly(
        provider,
        config.options.organizationID
      )

      // Get the most recent deployment completed event for this deployment ID.
      const deploymentCompletedEvent = (
        await manager.queryFilter(
          // This might be problematic if you're deploying multiple projects with the same manager.
          // We really should include the project name on these events so we can filter by it.
          manager.filters.ChugSplashDeploymentCompleted()
        )
      ).at(-1)
      const deploymentId = deploymentCompletedEvent?.args?.deploymentId

      const deployment: DeploymentState = await manager.deployments(
        deploymentId
      )

      const ipfsHash = deployment.configUri.replace('ipfs://', '')
      const canonicalConfig: CanonicalChugSplashConfig = JSON.parse(
        fs.readFileSync(`.canonical-configs/${ipfsHash}.json`).toString()
      )

      const configArtifacts: ConfigArtifacts = JSON.parse(
        fs.readFileSync(`./cache/${ipfsHash}.json`).toString()
      )

      await postDeploymentActions(
        canonicalConfig,
        configArtifacts,
        deploymentId,
        canonicalConfigFolder,
        deployment.configUri,
        false,
        networkName,
        deploymentFolder,
        'foundry',
        true,
        manager.owner(),
        provider,
        manager
      )
    }
  }
})()
