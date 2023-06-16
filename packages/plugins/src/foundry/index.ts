import * as fs from 'fs'

import {
  chugsplashDeployAbstractTask,
  chugsplashProposeAbstractTask,
  chugsplashClaimAbstractTask,
  chugsplashListProjectsAbstractTask,
  chugsplashCancelAbstractTask,
  chugsplashExportProxyAbstractTask,
  chugsplashImportProxyAbstractTask,
  getEIP1967ProxyAdminAddress,
  readValidatedChugSplashConfig,
  getDefaultProxyAddress,
  readUnvalidatedChugSplashConfig,
  getCreate3Address,
  getChugSplashRegistryAddress,
  getChugSplashManagerAddress,
  isLiveNetwork,
  ensureChugSplashInitialized,
  getNonProxyCreate3Salt,
} from '@chugsplash/core'
import { ethers } from 'ethers'

import { cleanPath, fetchPaths, getConfigArtifacts } from './utils'
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

      const { artifactFolder, buildInfoFolder, canonicalConfigPath } =
        fetchPaths(outPath, buildInfoPath)

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const cre = await createChugSplashRuntime(
        configPath,
        false,
        true,
        canonicalConfigPath,
        undefined,
        silent,
        process.stdout
      )

      const wallet = new ethers.Wallet(privateKey, provider)

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const configArtifacts = await getConfigArtifacts(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const config = await readValidatedChugSplashConfig(
        provider,
        configPath,
        configArtifacts,
        'foundry',
        cre
      )

      const address = await wallet.getAddress()
      owner = owner !== 'self' ? owner : address

      if (!silent) {
        console.log('-- ChugSplash Claim --')
      }
      await chugsplashClaimAbstractTask(
        provider,
        wallet,
        config,
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

      const { artifactFolder, buildInfoFolder, canonicalConfigPath } =
        fetchPaths(outPath, buildInfoPath)

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const remoteExecution = await isLiveNetwork(provider)
      const cre = await createChugSplashRuntime(
        configPath,
        remoteExecution,
        true,
        canonicalConfigPath,
        undefined,
        silent,
        process.stdout
      )

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const configArtifacts = await getConfigArtifacts(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const wallet = new ethers.Wallet(privateKey, provider)
      const config = await readValidatedChugSplashConfig(
        provider,
        configPath,
        configArtifacts,
        'foundry',
        cre
      )

      if (!silent) {
        console.log('-- ChugSplash Propose --')
      }
      await chugsplashProposeAbstractTask(
        provider,
        wallet,
        config,
        configPath,
        ipfsUrl,
        'foundry',
        configArtifacts,
        canonicalConfigPath,
        cre
      )
      break
    }
    case 'deploy': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const silent = args[5] === 'true'
      const outPath = cleanPath(args[6])
      const buildInfoPath = cleanPath(args[7])
      let newOwner = args[8]

      const confirm = true

      const logPath = `logs/${network ?? 'anvil'}`
      if (!fs.existsSync(logPath)) {
        fs.mkdirSync(logPath, { recursive: true })
      }

      const now = new Date()
      const logWriter = fs.createWriteStream(
        `${logPath}/deploy-${now.getTime()}`
      )

      const {
        artifactFolder,
        buildInfoFolder,
        deploymentFolder,
        canonicalConfigPath,
      } = fetchPaths(outPath, buildInfoPath)

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const cre = await createChugSplashRuntime(
        configPath,
        false,
        confirm,
        canonicalConfigPath,
        undefined,
        silent,
        logWriter
      )

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const configArtifacts = await getConfigArtifacts(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const wallet = new ethers.Wallet(privateKey, provider)

      const address = await wallet.getAddress()
      newOwner = newOwner !== 'self' ? newOwner : address

      const parsedConfig = await readValidatedChugSplashConfig(
        provider,
        configPath,
        configArtifacts,
        'foundry',
        cre
      )

      if (!silent) {
        logWriter.write('-- ChugSplash Deploy --\n')
      }

      const contractArtifacts = await chugsplashDeployAbstractTask(
        provider,
        wallet,
        configPath,
        newOwner ?? (await wallet.getAddress()),
        configArtifacts,
        canonicalConfigPath,
        deploymentFolder,
        'foundry',
        cre,
        parsedConfig
      )

      const artifactStructABI =
        'tuple(string referenceName, string contractName, address contractAddress)[]'
      const encodedArtifacts = ethers.utils.AbiCoder.prototype.encode(
        [artifactStructABI],
        [contractArtifacts]
      )

      process.stdout.write(encodedArtifacts)
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

      const { artifactFolder, buildInfoFolder, canonicalConfigPath } =
        fetchPaths(outPath, buildInfoPath)

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const cre = await createChugSplashRuntime(
        configPath,
        false,
        true,
        canonicalConfigPath,
        undefined,
        silent,
        process.stdout
      )

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const configArtifacts = await getConfigArtifacts(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const wallet = new ethers.Wallet(privateKey, provider)

      const parsedConfig = await readValidatedChugSplashConfig(
        provider,
        configPath,
        configArtifacts,
        'foundry',
        cre
      )

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

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)

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
    case 'initializeChugSplash': {
      const rpcUrl = args[1]
      const network = args[2] !== 'localhost' ? args[2] : undefined
      const privateKey = args[3]

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)
      await ensureChugSplashInitialized(provider, wallet)
      break
    }
  }
})().catch((err: Error) => {
  console.error(err)
  process.stdout.write('')
})
