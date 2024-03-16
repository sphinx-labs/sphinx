import { join, resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'

import { spawnAsync } from '@sphinx-labs/core'

import { FoundryToml } from './types'
import { replaceEnvVariables } from './utils'

export const cleanPath = (dirtyPath: string) => {
  let cleanQuotes = dirtyPath.replace(/'/g, '')
  cleanQuotes = cleanQuotes.replace(/"/g, '')
  return cleanQuotes.trim()
}

export const resolvePaths = (outPath: string, buildInfoPath: string) => {
  const artifactFolder = resolve(outPath)
  const buildInfoFolder = resolve(buildInfoPath)
  const deploymentFolder = resolve('deployments')

  return {
    artifactFolder,
    buildInfoFolder,
    deploymentFolder,
  }
}

export const checkRequiredTomlOptions = (toml: FoundryToml) => {
  // Check if the user included the `storageLayout` option. Since foundry force recompiles after
  // changing the foundry.toml file, we can assume that the contract artifacts will contain the
  // necessary info as long as the config includes the expected options
  if (!toml.extraOutput.includes('storageLayout')) {
    throw new Error(
      "Missing required extra_output option in foundry.toml file:\nextra_output = ['storageLayout']\nPlease update your foundry.toml file and try again."
    )
  }
}

/**
 * @notice Gets fields from the user's foundry.toml file.
 *
 * Note that most of these fields can be overridden via a `FOUNDRY_` or `DAPP_` environment variable
 * (source: https://book.getfoundry.sh/reference/config/overview#environment-variables). These env
 * variables are injected into the output of `forge config` automatically, so there's no additional
 * parsing needed to support them.
 */
export const getFoundryToml = async (): Promise<FoundryToml> => {
  const { stdout, stderr, code } = await spawnAsync('forge', [
    'config',
    '--json',
  ])
  if (code !== 0) {
    console.log(stderr)
    process.exit(1)
  }
  const raw = JSON.parse(stdout)

  const buildInfoPath = raw.build_info_path ?? join(raw.out, 'build-info')

  const parsed = replaceEnvVariables(raw)

  const remappings: Record<string, string> = {}
  for (const remapping of parsed.remappings) {
    const [from, to] = remapping.split('=')
    remappings[from] = to
  }

  const {
    broadcast: broadcastFolder,
    etherscan,
    cache_path: cachePath,
    rpc_endpoints: rpcEndpoints,
    src,
    test,
    script,
    solc,
    always_use_create_2_factory,
    build_info,
    extra_output,
  } = parsed

  const resolved: FoundryToml = {
    ...resolvePaths(parsed.out, buildInfoPath),
    cachePath,
    rpcEndpoints,
    src,
    test,
    script,
    solc,
    remappings,
    etherscan,
    broadcastFolder,
    alwaysUseCreate2Factory: always_use_create_2_factory,
    buildInfo: build_info,
    extraOutput: extra_output,
  }

  // Check if the cache directory exists, and create it if not.
  // Some versions of Foundry do not automatically create the cache folder
  // when compiling, so this ensures it will always exist.
  // We noticed this issue occurring in Foundry starting approximately at
  // commit 42da94276892f63afefd0dc743e862b058a4b4c2
  if (!existsSync(cachePath)) {
    mkdirSync(cachePath, { recursive: true })
  }

  checkRequiredTomlOptions(resolved)

  return resolved
}
