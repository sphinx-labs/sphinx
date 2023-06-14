import * as fs from 'fs'

import {
  chugsplashProposeAbstractTask,
  readValidatedChugSplashConfig,
  ProposalRoute,
  getChugSplashRegistryReadOnly,
  getPreviousConfigUri,
  postDeploymentActions,
  CanonicalChugSplashConfig,
  getChugSplashManagerReadOnly,
  DeploymentState,
  ConfigArtifacts,
  initializeChugSplash,
  bytecodeContainsEIP1967Interface,
  bytecodeContainsUUPSInterface,
  FailureAction,
} from '@chugsplash/core'
import { ethers } from 'ethers'
import { defaultAbiCoder, hexConcat } from 'ethers/lib/utils'

import { getPaths } from './paths'
import { makeGetConfigArtifacts } from './utils'
import { createChugSplashRuntime } from '../cre'
import {
  getEncodedFailure,
  getPrettyWarnings,
  validationStderrWrite,
} from './logs'

const args = process.argv.slice(2)
const command = args[0]

;(async () => {
  switch (command) {
    case 'propose': {
      process.stderr.write = validationStderrWrite

      try {
        const configPath = args[1]
        const rpcUrl = args[2]
        const privateKey = args[3]

        const { artifactFolder, buildInfoFolder, canonicalConfigFolder } =
          await getPaths()

        const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
        const cre = await createChugSplashRuntime(
          true,
          true,
          canonicalConfigFolder,
          undefined,
          true,
          process.stderr
        )

        const { parsedConfig, configArtifacts, configCache } =
          await readValidatedChugSplashConfig(
            configPath,
            provider,
            cre,
            makeGetConfigArtifacts(artifactFolder, buildInfoFolder),
            FailureAction.THROW
          )
        const wallet = new ethers.Wallet(privateKey, provider)

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

        const encodedProjectNameAndWarnings = defaultAbiCoder.encode(
          ['string', 'string'],
          [parsedConfig.options.projectName, getPrettyWarnings()]
        )

        const encodedSuccess = hexConcat([
          encodedProjectNameAndWarnings,
          defaultAbiCoder.encode(['bool'], [true]), // true = success
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

      const userConfig = JSON.parse(args[1])
      const networkName = args[2]
      const rpcUrl = args[3]
      const deploymentId = args[4]
      const deployerAddress = args[5]

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl)

      const manager = getChugSplashManagerReadOnly(
        provider,
        userConfig.options.organizationID
      )

      const deployment: DeploymentState = await manager.deployments(
        deploymentId
      )

      const ipfsHash = deployment.configUri.replace('ipfs://', '')
      const canonicalConfig: CanonicalChugSplashConfig = JSON.parse(
        fs.readFileSync(`.canonical-configs/${ipfsHash}.json`, 'utf8')
      )

      const configArtifacts: ConfigArtifacts = JSON.parse(
        fs.readFileSync(`./cache/${ipfsHash}.json`, 'utf8')
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
        deployerAddress,
        provider,
        manager
      )
    }
  }
})()
