import {
  getSphinxRegistryReadOnly,
  getPreviousConfigUri,
  bytecodeContainsEIP1967Interface,
  bytecodeContainsUUPSInterface,
  FailureAction,
  proposeAbstractTask,
  readUserConfigWithOptions,
  ensureSphinxInitialized,
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
import 'core-js/features/array/at'

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
          'foundry',
          true,
          false,
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
        await ensureSphinxInitialized(provider, wallet, [], [], [])
      } catch (e) {
        // The 'could not detect network' error will occur on the in-process Anvil node,
        // since we can't access it in TypeScript.
        if (!e.reason.includes('could not detect network')) {
          throw e
        }
      }

      break
    }
  }
})()
