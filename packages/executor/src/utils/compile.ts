import hre from 'hardhat'
import { SolcBuild } from 'hardhat/types'
import {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
  TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
} from 'hardhat/builtin-tasks/task-names'
import { add0x } from '@eth-optimism/core-utils'
import {
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
  makeActionBundleFromConfig,
} from '@chugsplash/core'

/**
 * Compiles a remote ChugSplashBundle from a uri.
 *
 * @param uri URI of the ChugSplashBundle to compile.
 * @returns Compiled ChugSplashBundle.
 */
export const compileRemoteBundle = async (
  uri: string
): Promise<ChugSplashActionBundle> => {
  let config: CanonicalChugSplashConfig
  if (uri.startsWith('ipfs://')) {
    config = await (
      await fetch(
        `https://cloudflare-ipfs.com/ipfs/${uri.replace('ipfs://', '')}`
      )
    ).json()
  } else {
    throw new Error('unsupported URI type')
  }

  const artifacts = {}
  for (const source of config.inputs) {
    const solcBuild: SolcBuild = await hre.run(
      TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
      {
        quiet: true,
        solcVersion: source.solcVersion,
      }
    )

    let output: any // TODO: Compiler output
    if (solcBuild.isSolcJs) {
      output = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLCJS, {
        input: source.input,
        solcJsPath: solcBuild.compilerPath,
      })
    } else {
      output = await hre.run(TASK_COMPILE_SOLIDITY_RUN_SOLC, {
        input: source.input,
        solcPath: solcBuild.compilerPath,
      })
    }

    for (const fileOutput of Object.values(output.contracts)) {
      for (const [contractName, contractOutput] of Object.entries(fileOutput)) {
        artifacts[contractName] = {
          bytecode: add0x(contractOutput.evm.bytecode.object),
          storageLayout: contractOutput.storageLayout,
        }
      }
    }
  }

  return makeActionBundleFromConfig(config, artifacts, {})
}
