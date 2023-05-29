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
  isLiveNetwork,
  getNonProxyCreate3Salt,
  getBootloaderTwoConstructorArgs,
  bootloaderTwoConstructorFragment,
  readUnvalidatedParsedConfig,
  ProposalRoute,
} from '@chugsplash/core'
import { ethers } from 'ethers'
import {
  ChugSplashBootloaderOneArtifact,
  ChugSplashBootloaderTwoArtifact,
} from '@chugsplash/contracts'

import {
  cleanPath,
  fetchPaths,
  getPaths,
  makeGetConfigArtifacts,
} from './utils'
import { createChugSplashRuntime } from '../utils'

const args = process.argv.slice(2)
const command = args[0]

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
      const remoteExecution = await isLiveNetwork(provider)
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
      const encodedArtifacts = ethers.utils.AbiCoder.prototype.encode(
        [artifactStructABI],
        [
          {
            bootloaderOne,
            bootloaderTwo: bootloaderTwoCreationCode,
          },
        ]
      )

      process.stdout.write(encodedArtifacts)
    }
    case 'getMinimalParsedConfig': {
      const configPath = args[1]
      const remoteExecution = args[2] === 'true'
      const silent = args[3] === 'true'

      const { artifactFolder, buildInfoFolder, canonicalConfigFolder } =
        await getPaths()

      const cre = await createChugSplashRuntime(
        configPath,
        remoteExecution,
        true,
        canonicalConfigFolder,
        undefined,
        silent
      )

      const getConfigArtifacts = makeGetConfigArtifacts(
        artifactFolder,
        buildInfoFolder
      )

      const { parsedConfig, minimalParsedConfig, configArtifacts } =
        await readUnvalidatedParsedConfig(configPath, cre, getConfigArtifacts)

      // TODO: write parsedConfig and configArtifacts to 'chugsplash-cache' or something

      // const encodedMinimalParsedConfig = ethers.utils.defaultAbiCoder.encode()
    }
  }
})().catch((err: Error) => {
  console.error(err)
  process.stdout.write('')
})
