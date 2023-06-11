import * as fs from 'fs'

import {
  chugsplashProposeAbstractTask,
  readValidatedChugSplashConfig,
  readUserChugSplashConfig,
  ProposalRoute,
  getChugSplashRegistryReadOnly,
  getPreviousConfigUri,
  isLocalNetwork,
  postDeploymentActions,
  CanonicalChugSplashConfig,
  getChugSplashManagerReadOnly,
  DeploymentState,
  ConfigArtifacts,
  initializeChugSplash,
  bytecodeContainsEIP1967Interface,
  bytecodeContainsUUPSInterface,
} from '@chugsplash/core'
import { Contract, ethers } from 'ethers'

import { getPaths } from './paths'
import { makeGetConfigArtifacts } from './utils'
import { createChugSplashRuntime } from '../cre'

const args = process.argv.slice(2)
const command = args[0]

;(async () => {
  switch (command) {
    case 'propose': {
      const configPath = args[1]
      const rpcUrl = args[2]
      const privateKey = args[3]
      const silent = args[4] === 'true'

      const { artifactFolder, buildInfoFolder, canonicalConfigFolder } =
        await getPaths()

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
      const remoteExecution = !(await isLocalNetwork(provider))
      const cre = await createChugSplashRuntime(
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
        '',
        'foundry',
        configArtifacts,
        ProposalRoute.REMOTE_EXECUTION,
        cre,
        configCache
      )
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
    case 'checkProxyBytecodeCompatible': {
      const bytecode = args[1]

      if (
        bytecodeContainsEIP1967Interface(bytecode) &&
        bytecodeContainsUUPSInterface(bytecode)
      ) {
        process.stdout.write('true')
      } else {
        process.stdout.write('false')
      }
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
