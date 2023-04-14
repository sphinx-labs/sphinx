import * as fs from 'fs'

import {
  chugsplashApproveAbstractTask,
  chugsplashDeployAbstractTask,
  chugsplashFundAbstractTask,
  chugsplashProposeAbstractTask,
  chugsplashClaimAbstractTask,
  chugsplashMonitorAbstractTask,
  chugsplashAddProposersAbstractTask,
  chugsplashWithdrawAbstractTask,
  chugsplashListProjectsAbstractTask,
  chugsplashListProposersAbstractTask,
  chugsplashCancelAbstractTask,
  chugsplashExportProxyAbstractTask,
  chugsplashImportProxyAbstractTask,
  getEIP1967ProxyAdminAddress,
  initializeChugSplash,
  readValidatedChugSplashConfig,
  getDefaultProxyAddress,
  readUnvalidatedChugSplashConfig,
  getContractAddress,
  CHUGSPLASH_REGISTRY_ADDRESS,
  getChugSplashManagerAddress,
  assertValidConstructorArgs,
} from '@chugsplash/core'
import { BigNumber, ethers } from 'ethers'

import { cleanPath, fetchPaths, getArtifactPaths } from './utils'
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

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
        true,
        canonicalConfigPath,
        undefined,
        silent,
        process.stdout
      )

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const artifactPaths = await getArtifactPaths(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const config = await readValidatedChugSplashConfig(
        provider,
        configPath,
        artifactPaths,
        'foundry',
        cre
      )

      await provider.getNetwork()
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
      const remoteExecution = args[9] === 'true'

      const { artifactFolder, buildInfoFolder, canonicalConfigPath } =
        fetchPaths(outPath, buildInfoPath)

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
        true,
        canonicalConfigPath,
        undefined,
        silent,
        process.stdout
      )

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const artifactPaths = await getArtifactPaths(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)
      const config = await readValidatedChugSplashConfig(
        provider,
        configPath,
        artifactPaths,
        'foundry',
        cre
      )

      await provider.getNetwork()
      await wallet.getAddress()

      if (!silent) {
        console.log('-- ChugSplash Propose --')
      }
      await chugsplashProposeAbstractTask(
        provider,
        wallet,
        config,
        configPath,
        ipfsUrl,
        remoteExecution,
        'foundry',
        artifactPaths,
        canonicalConfigPath,
        cre
      )
      break
    }
    case 'fund': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const silent = args[5] === 'true'
      const outPath = cleanPath(args[6])
      const buildInfoPath = cleanPath(args[7])
      const amount = BigNumber.from(args[8])
      const autoEstimate = args[9] === 'true'

      const { artifactFolder, buildInfoFolder, canonicalConfigPath } =
        fetchPaths(outPath, buildInfoPath)

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
        true,
        canonicalConfigPath,
        undefined,
        silent,
        process.stdout
      )

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const artifactPaths = await getArtifactPaths(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)
      await provider.getNetwork()

      const parsedConfig = await readValidatedChugSplashConfig(
        provider,
        configPath,
        artifactPaths,
        'foundry',
        cre
      )

      if (!silent) {
        console.log('-- ChugSplash Fund --')
      }
      await chugsplashFundAbstractTask(
        provider,
        wallet,
        configPath,
        amount,
        autoEstimate,
        artifactPaths,
        'foundry',
        parsedConfig,
        cre
      )
      break
    }
    case 'approve': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const silent = args[5] === 'true'
      const outPath = cleanPath(args[6])
      const buildInfoPath = cleanPath(args[7])
      const withdrawFunds = args[8] === 'true'
      const skipMonitorStatus = args[9] === 'true'

      const {
        artifactFolder,
        buildInfoFolder,
        deploymentFolder,
        canonicalConfigPath,
      } = fetchPaths(outPath, buildInfoPath)

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
        true,
        canonicalConfigPath,
        undefined,
        silent,
        process.stdout
      )

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const artifactPaths = await getArtifactPaths(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)
      await provider.getNetwork()
      await wallet.getAddress()

      const parsedConfig = await readValidatedChugSplashConfig(
        provider,
        configPath,
        artifactPaths,
        'foundry',
        cre
      )

      if (!silent) {
        console.log('-- ChugSplash Approve --')
      }
      await chugsplashApproveAbstractTask(
        provider,
        wallet,
        configPath,
        !withdrawFunds,
        skipMonitorStatus,
        artifactPaths,
        'foundry',
        canonicalConfigPath,
        deploymentFolder,
        parsedConfig,
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

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
        confirm,
        canonicalConfigPath,
        undefined,
        silent,
        logWriter
      )

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const artifactPaths = await getArtifactPaths(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)
      await provider.getNetwork()
      const address = await wallet.getAddress()
      newOwner = newOwner !== 'self' ? newOwner : address

      const parsedConfig = await readValidatedChugSplashConfig(
        provider,
        configPath,
        artifactPaths,
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
        artifactPaths,
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
    case 'monitor': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const silent = args[5] === 'true'
      const outPath = cleanPath(args[6])
      const buildInfoPath = cleanPath(args[7])
      const withdrawFunds = args[8] === 'true'
      let newOwner = args[9]

      const {
        artifactFolder,
        buildInfoFolder,
        deploymentFolder,
        canonicalConfigPath,
      } = fetchPaths(outPath, buildInfoPath)

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
        true,
        canonicalConfigPath,
        undefined,
        silent,
        process.stdout
      )

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const artifactPaths = await getArtifactPaths(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)
      await provider.getNetwork()
      const address = await wallet.getAddress()
      newOwner = newOwner !== 'self' ? newOwner : address

      const remoteExecution = args[3] !== 'localhost'

      const parsedConfig = await readValidatedChugSplashConfig(
        provider,
        configPath,
        artifactPaths,
        'foundry',
        cre
      )

      if (!silent) {
        console.log('-- ChugSplash Monitor --')
      }
      await chugsplashMonitorAbstractTask(
        provider,
        wallet,
        configPath,
        !withdrawFunds,
        newOwner,
        artifactPaths,
        canonicalConfigPath,
        deploymentFolder,
        'foundry',
        remoteExecution,
        parsedConfig,
        cre
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
      await provider.getNetwork()
      await wallet.getAddress()

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
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
    case 'withdraw': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const silent = args[5] === 'true'

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)
      await provider.getNetwork()
      await wallet.getAddress()

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
        true,
        '',
        undefined,
        silent,
        process.stdout
      )

      if (!silent) {
        console.log('-- ChugSplash Withdraw --')
      }
      await chugsplashWithdrawAbstractTask(
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
      await provider.getNetwork()
      await wallet.getAddress()

      const cre = await createChugSplashRuntime(
        '',
        args[3] !== 'localhost',
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
    case 'listProposers': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)
      await provider.getNetwork()
      await wallet.getAddress()

      console.log('-- ChugSplash List Proposers --')
      await chugsplashListProposersAbstractTask(
        provider,
        wallet,
        configPath,
        'foundry'
      )
      break
    }
    case 'addProposer': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const newProposer = args[5]

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)
      await provider.getNetwork()
      await wallet.getAddress()

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
        true,
        '',
        undefined,
        false,
        process.stdout
      )

      console.log('-- ChugSplash Add Proposer --')
      await chugsplashAddProposersAbstractTask(
        provider,
        wallet,
        configPath,
        [newProposer],
        'foundry',
        cre
      )
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

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
        true,
        canonicalConfigPath,
        undefined,
        silent,
        process.stdout
      )

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      const artifactPaths = await getArtifactPaths(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const wallet = new ethers.Wallet(privateKey, provider)
      await provider.getNetwork()
      await wallet.getAddress()

      const parsedConfig = await readValidatedChugSplashConfig(
        provider,
        configPath,
        artifactPaths,
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
      await provider.getNetwork()
      await wallet.getAddress()

      const cre = await createChugSplashRuntime(
        configPath,
        args[3] !== 'localhost',
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
      const outPath = cleanPath(args[3])
      const buildInfoPath = cleanPath(args[4])

      const userConfig = await readUnvalidatedChugSplashConfig(configPath)

      const { projectName, organizationID, claimer } = userConfig.options
      const managerAddress = getChugSplashManagerAddress(
        claimer,
        organizationID
      )

      if (userConfig.contracts[referenceName].kind === 'no-proxy') {
        const { artifactFolder, buildInfoFolder, canonicalConfigPath } =
          fetchPaths(outPath, buildInfoPath)

        // Always skip the storage check b/c it can cause unnecessary failures in this case.
        for (const contract of Object.values(userConfig.contracts)) {
          contract.unsafeSkipStorageCheck = true
        }

        const artifactPaths = await getArtifactPaths(
          userConfig.contracts,
          artifactFolder,
          buildInfoFolder
        )

        const cre = await createChugSplashRuntime(
          configPath,
          false,
          true,
          canonicalConfigPath,
          undefined,
          true,
          process.stdout
        )

        const { cachedConstructorArgs } = assertValidConstructorArgs(
          userConfig,
          artifactPaths,
          cre,
          true,
          'foundry'
        )

        const address = getContractAddress(
          managerAddress,
          referenceName,
          cachedConstructorArgs[referenceName],
          { integration: 'foundry', artifactPaths }
        )
        process.stdout.write(address)
      } else {
        const proxy =
          userConfig.contracts[referenceName].externalProxy ||
          getDefaultProxyAddress(
            claimer,
            organizationID,
            projectName,
            referenceName
          )
        process.stdout.write(proxy)
      }
      break
    }
    case 'getRegistryAddress': {
      process.stdout.write(CHUGSPLASH_REGISTRY_ADDRESS)
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
      const walletAddress = await wallet.getAddress()
      await initializeChugSplash(provider, wallet, [walletAddress])
      break
    }
  }
})().catch((err: Error) => {
  console.error(err)
  process.stdout.write('')
})
