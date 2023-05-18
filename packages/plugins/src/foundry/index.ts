import * as fs from 'fs'
import util from 'util'
import { exec, spawn } from 'child_process'

const execAsync = util.promisify(exec)

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
} from '@chugsplash/core'
import { ethers } from 'ethers'
import { remove0x } from '@eth-optimism/core-utils'

import { cleanPath, fetchPaths, getArtifactPaths } from './utils'
import { createChugSplashRuntime } from '../utils'

const args = process.argv.slice(2)
const command = args[0]

;(async () => {
  await execAsync('forge build')

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
      const artifactPaths = await getArtifactPaths(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

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
        'foundry',
        artifactPaths,
        canonicalConfigPath,
        cre
      )
      break
    }
    // case 'validate': {
    //   break
    // }
    case 'deploy': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const network = args[3] !== 'localhost' ? args[3] : undefined
      const privateKey = args[4]
      const silent = args[5] === 'true'
      const outPath = cleanPath(args[6])
      const buildInfoPath = cleanPath(args[7])
      const newOwner = args[8]

      const confirm = true

      const {
        artifactFolder,
        buildInfoFolder,
        deploymentFolder,
        canonicalConfigPath,
      } = fetchPaths(outPath, buildInfoPath)
      const ary = []

      const stream = {
        ...process.stdout
      }

      process.stdout.write(
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes('this is encoded!'))
      )
      const str = 'ff'.repeat(100)
      const thing = ethers.utils.defaultAbiCoder.encode(['string'], [str])
      process.stdout.write(str.concat(remove0x(thing)))

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network)
      const cre = await createChugSplashRuntime(
        configPath,
        false,
        confirm,
        canonicalConfigPath,
        undefined,
        silent,
        stream
      )

      // const userConfig = await readUnvalidatedChugSplashConfig(configPath)
      // const artifactPaths = await getArtifactPaths(
      //   userConfig.contracts,
      //   artifactFolder,
      //   buildInfoFolder
      // )

      // const wallet = new ethers.Wallet(privateKey, provider)
      // await provider.getNetwork()
      // const address = await wallet.getAddress()
      // newOwner = newOwner !== 'self' ? newOwner : address

      // const parsedConfig = await readValidatedChugSplashConfig(
      //   provider,
      //   configPath,
      //   artifactPaths,
      //   'foundry',
      //   cre
      // )

      // const contractArtifacts = await chugsplashDeployAbstractTask(
      //   provider,
      //   wallet,
      //   configPath,
      //   newOwner ?? (await wallet.getAddress()),
      //   artifactPaths,
      //   canonicalConfigPath,
      //   deploymentFolder,
      //   'foundry',
      //   cre,
      //   parsedConfig
      // )

      // const artifactStructABI =
      //   'tuple(string referenceName, string contractName, address contractAddress)[]'
      // const encodedArtifacts = ethers.utils.defaultAbiCoder.encode(
      //   [artifactStructABI],
      //   [contractArtifacts]
      // )

      // process.stdout.write(new Uint8Array([0, 0, 0, 0, 0, 255, 255]))
      // process.stdout.write(encodedArtifacts)
      // process.stdout.write(
      // ethers.utils.arrayify(
      // ethers.utils.defaultAbiCoder.encode(
      // ['uint256', 'bool'],
      // [encodedArtifacts.length, true]
      // )
      // )
      // )
      // process.stdout.write(
      //   ethers.utils.arrayify(
      //     ethers.utils.defaultAbiCoder.encode(['uint256'], [0])
      //   )
      // )
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
      await provider.getNetwork()
      await wallet.getAddress()

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
      const artifactPaths = await getArtifactPaths(
        userConfig.contracts,
        artifactFolder,
        buildInfoFolder
      )

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
          projectName,
          referenceName,
          userConfig.contracts[referenceName].salt ?? ethers.constants.HashZero
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
