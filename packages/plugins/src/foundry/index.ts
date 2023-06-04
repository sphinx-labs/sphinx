import * as fs from 'fs'
import { spawn } from 'child_process'

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
  getChugSplashRegistryAddress,
  getChugSplashManagerAddress,
  getNonProxyCreate3Salt,
  getBootloaderTwoConstructorArgs,
  bootloaderTwoConstructorFragment,
  readUnvalidatedParsedConfig,
  ProposalRoute,
  CURRENT_CHUGSPLASH_MANAGER_VERSION,
  postParsingValidation,
  ParsedChugSplashConfig,
  ConfigArtifacts,
  getChugSplashRegistryReadOnly,
  getCanonicalConfigData,
  getPreviousConfigUri,
  isLocalNetwork,
  MinimalParsedConfig,
  FailureAction,
} from '@chugsplash/core'
import { ethers } from 'ethers'
import {
  ChugSplashBootloaderOneArtifact,
  ChugSplashBootloaderTwoArtifact,
  ChugSplashManagerProxyArtifact,
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
    case 'getRegistryAddress': {
      process.stdout.write(getChugSplashRegistryAddress())
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
    case 'getBootloaderBytecode': {
      const bootloaderOne = ChugSplashBootloaderOneArtifact.bytecode
      const bootloaderTwo = ChugSplashBootloaderTwoArtifact.bytecode

      const bootloaderTwoCreationCode = bootloaderTwo.concat(
        ethers.utils.defaultAbiCoder
          .encode(
            bootloaderTwoConstructorFragment.inputs,
            getBootloaderTwoConstructorArgs()
          )
          .slice(2)
      )

      const artifactStructABI =
        'tuple(bytes bootloaderOne, bytes bootloaderTwo)'
      const encodedArtifacts = ethers.utils.defaultAbiCoder.encode(
        [artifactStructABI],
        [
          {
            bootloaderOne,
            bootloaderTwo: bootloaderTwoCreationCode,
          },
        ]
      )

      process.stdout.write(encodedArtifacts)
      break
    }
    case 'getChugSplashManagerProxyBytecode': {
      const bytecode = ChugSplashManagerProxyArtifact.bytecode
      process.stdout.write(bytecode)
      break
    }
    case 'getMinimalParsedConfig': {
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

      let parsedConfig: ParsedChugSplashConfig
      let minimalParsedConfig: MinimalParsedConfig
      let configArtifacts: ConfigArtifacts

      // TODO: create `overwriteStreams` function and put it here, and in `postParsingValidation`,
      // and perhaps others
      // TODO(docs): explain why we're doing this
      let warnings: string = ''
      let errors: string = ''
      process.stderr.write = (message: string) => {
        if (message.startsWith('\nWarning: ')) {
          warnings += message
        } else if (message.startsWith('\nError: ')) {
          // TODO(docs): we remove the first instance of '\nError: ' in 'message' because..
          errors += message.replace('\nError: ', '')
        } else {
          throw new Error(
            'TODO: something else was written. Should never happen'
          )
        }
        return true
      }

      try {
        ;({ parsedConfig, minimalParsedConfig, configArtifacts } =
          await readUnvalidatedParsedConfig(
            configPath,
            cre,
            getConfigArtifacts,
            FailureAction.THROW
          ))
      } catch (err) {
        // There was a parsing error. We return the error messages and warnings.

        // Removes unnecessary '\n' characters from the end of 'errors' and 'warnings'
        const prettyErrors = errors.endsWith('\n\n')
          ? errors.substring(0, errors.length - 2)
          : errors
        const prettyWarnings = warnings.endsWith('\n\n')
          ? warnings.substring(0, warnings.length - 1)
          : warnings

        const encodedErrorsAndWarnings = ethers.utils.defaultAbiCoder.encode(
          ['string', 'string'],
          [prettyErrors, prettyWarnings]
        )

        const encodedFailure = ethers.utils.hexConcat([
          encodedErrorsAndWarnings,
          ethers.utils.defaultAbiCoder.encode(['bool'], [false]), // false = failure
        ])

        process.stdout.write(encodedFailure)
        break
      }

      // If we make it to this point, parsing was successful. We return the minimal parsed config.
      // and parsing warnings, which won't halt the process.

      // TODO: we shouldn't have two things called ConfigCache
      const configCache = {
        parsedConfig,
        configArtifacts,
      }

      if (!fs.existsSync('./cache')) {
        fs.mkdirSync('./cache')
      }
      fs.writeFileSync(
        './cache/chugsplash-config-cache.json',
        JSON.stringify(configCache, null, 2),
        'utf-8'
      )

      const ChugSplashUtilsABI =
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(`${artifactFolder}/ChugSplashUtils.sol/ChugSplashUtils.json`).abi
      const minimalParsedConfigType = ChugSplashUtilsABI.find(
        (fragment) => fragment.name === 'minimalParsedConfig'
      ).outputs[0]

      // Remove a '\n' character from the end of 'warnings' if it exists.
      const prettyWarningMessages = warnings.endsWith('\n\n')
        ? warnings.substring(0, warnings.length - 1)
        : warnings

      const encodedConfigAndWarnings = ethers.utils.defaultAbiCoder.encode(
        [minimalParsedConfigType, 'string'],
        [minimalParsedConfig, prettyWarningMessages]
      )

      const encodedSuccess = ethers.utils.hexConcat([
        encodedConfigAndWarnings,
        ethers.utils.defaultAbiCoder.encode(['bool'], [true]), // true = success
      ])

      process.stdout.write(encodedSuccess)
      break
    }
    case 'postParsingValidation': {
      const encodedConfigCache = args[1]
      const configCache = await decodeCachedConfig(encodedConfigCache)

      const {
        parsedConfig,
        configArtifacts,
      }: {
        parsedConfig: ParsedChugSplashConfig
        configArtifacts: ConfigArtifacts
      } = JSON.parse(
        fs.readFileSync('./cache/chugsplash-config-cache.json').toString()
      )

      const { canonicalConfigFolder } = await getPaths()
      const cre = await createChugSplashRuntime(
        '',
        false,
        true,
        canonicalConfigFolder,
        undefined,
        false,
        process.stdout
      )

      await postParsingValidation(
        parsedConfig,
        configArtifacts,
        cre,
        configCache,
        FailureAction.THROW
      )
      break
    }
    case 'getCurrentChugSplashManagerVersion': {
      const artifactStructABI =
        'tuple(uint256 major, uint256 minor, uint256 patch)'
      const encodedVersion = ethers.utils.defaultAbiCoder.encode(
        [artifactStructABI],
        [CURRENT_CHUGSPLASH_MANAGER_VERSION]
      )

      process.stdout.write(encodedVersion)
      break
    }
    case 'getCanonicalConfigData': {
      const encodedConfigCache = args[1]
      const configCache = await decodeCachedConfig(encodedConfigCache)

      const {
        parsedConfig,
        configArtifacts,
      }: {
        parsedConfig: ParsedChugSplashConfig
        configArtifacts: ConfigArtifacts
      } = JSON.parse(
        fs.readFileSync('./cache/chugsplash-config-cache.json').toString()
      )
      const { configUri, bundles } = await getCanonicalConfigData(
        parsedConfig,
        configArtifacts,
        configCache
      )

      const { artifactFolder } = await getPaths()
      const ChugSplashUtilsABI =
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(`${artifactFolder}/ChugSplashUtils.sol/ChugSplashUtils.json`).abi

      const encodedConfigUri = ethers.utils.defaultAbiCoder.encode(
        ['string'],
        [configUri]
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

      // This is where the encoded config URI ends and the encoded action bundle begins (in bytes).
      const splitIdx1 = remove0x(encodedConfigUri).length / 2
      // This is where the encoded action bundle begins and the encoded target bundle begins (in bytes).
      const splitIdx2 = splitIdx1 + remove0x(encodedActionBundle).length / 2
      const encodedSplitIdxs = ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'uint256'],
        [splitIdx1, splitIdx2]
      )

      const encodedData = ethers.utils.hexConcat([
        encodedConfigUri,
        encodedActionBundle,
        encodedTargetBundle,
        encodedSplitIdxs,
      ])

      process.stdout.write(encodedData)
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
  }
})().catch((err: Error) => {
  console.error(err)
  process.stdout.write('')
})
