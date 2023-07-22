import * as fs from 'fs'

import {
  getSphinxRegistryReadOnly,
  getPreviousConfigUri,
  postDeploymentActions,
  getSphinxManagerReadOnly,
  DeploymentState,
  initializeSphinx,
  bytecodeContainsEIP1967Interface,
  bytecodeContainsUUPSInterface,
  FailureAction,
  getSphinxManagerAddress,
  proposeAbstractTask,
  readUserConfigWithOptions,
  ConfigArtifacts,
  CompilerConfig,
} from '@sphinx/core'
import { ethers } from 'ethers'
import { defaultAbiCoder, hexConcat } from 'ethers/lib/utils'

import { getFoundryConfigOptions } from './options'
import { makeGetConfigArtifacts, makeGetProviderFromChainId } from './utils'
import { createSphinxRuntime } from '../cre'
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
        const isTestnet = args[3] === 'true'

        const {
          artifactFolder,
          buildInfoFolder,
          compilerConfigFolder,
          cachePath,
          rpcEndpoints,
        } = await getFoundryConfigOptions()

        const cre = createSphinxRuntime(
          true,
          false, // Users must manually confirm proposals.
          compilerConfigFolder,
          undefined,
          false,
          process.stderr
        )

        await proposeAbstractTask(
          await readUserConfigWithOptions(configPath),
          isTestnet,
          cre,
          makeGetConfigArtifacts(artifactFolder, buildInfoFolder, cachePath),
          await makeGetProviderFromChainId(rpcEndpoints),
          undefined,
          FailureAction.THROW
        )

        const encodedWarnings = defaultAbiCoder.encode(
          ['string'],
          [getPrettyWarnings()]
        )

        const encodedSuccess = hexConcat([
          encodedWarnings,
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
      const registry = await getSphinxRegistryReadOnly(provider)

      const configUri = await getPreviousConfigUri(
        provider,
        registry,
        proxyAddress
      )

      const exists = configUri !== undefined

      const encodedConfigUri = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'string'],
        [exists, configUri ?? '']
      )

      process.stdout.write(encodedConfigUri)
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
      const rpcUrl = args[1]
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
      const wallet = new ethers.Wallet(
        '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
        provider
      )

      try {
        await initializeSphinx(
          provider,
          wallet,
          [],
          [],
          (
            await provider.getNetwork()
          ).chainId
        )
      } catch (e) {
        if (!e.reason.includes('could not detect network')) {
          throw e
        }
      }

      break
    }
    case 'generateArtifacts': {
      const { compilerConfigFolder, deploymentFolder, cachePath } =
        await getFoundryConfigOptions()

      const networkName = args[1]
      const rpcUrl = args[2]
      const ownerAddress = args[3]
      const projectName = args[4]

      const provider: ethers.providers.JsonRpcProvider =
        new ethers.providers.JsonRpcProvider(rpcUrl)

      const deployer = getSphinxManagerAddress(ownerAddress, projectName)
      const manager = getSphinxManagerReadOnly(deployer, provider)

      // Get the most recent deployment completed event for this deployment ID.
      const deploymentCompletedEvent = (
        await manager.queryFilter(
          // This might be problematic if you're deploying multiple projects with the same manager.
          // We really should include the project name on these events so we can filter by it.
          manager.filters.SphinxDeploymentCompleted()
        )
      ).at(-1)
      const deploymentId = deploymentCompletedEvent?.args?.deploymentId

      const deployment: DeploymentState = await manager.deployments(
        deploymentId
      )

      const ipfsHash = deployment.configUri.replace('ipfs://', '')
      const compilerConfig: CompilerConfig = JSON.parse(
        fs.readFileSync(`.compiler-configs/${ipfsHash}.json`).toString()
      )

      const configArtifacts: ConfigArtifacts = JSON.parse(
        fs
          .readFileSync(`${cachePath}/configArtifacts/${ipfsHash}.json`)
          .toString()
      )

      await postDeploymentActions(
        compilerConfig,
        configArtifacts,
        deploymentId,
        compilerConfigFolder,
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
