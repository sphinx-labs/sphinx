import { exec } from 'child_process'
import { join, resolve } from 'path'
import { promisify } from 'util'

export const cleanPath = (dirtyPath: string) => {
  let cleanQuotes = dirtyPath.replace(/'/g, '')
  cleanQuotes = cleanQuotes.replace(/"/g, '')
  return cleanQuotes.trim()
}

export const resolvePaths = (outPath: string, buildInfoPath: string) => {
  const artifactFolder = resolve(outPath)
  const buildInfoFolder = resolve(buildInfoPath)
  const deploymentFolder = resolve('deployments')
  const compilerConfigFolder = resolve('.compiler-configs')

  return {
    artifactFolder,
    buildInfoFolder,
    deploymentFolder,
    compilerConfigFolder,
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
export const getFoundryConfigOptions = async (): Promise<{
  artifactFolder: string
  buildInfoFolder: string
  deploymentFolder: string
  compilerConfigFolder: string
  cachePath: string
  storageLayout: boolean
  gasEstimates: boolean
  rpcEndpoints: { [chainAlias: string]: string }
}> => {
  const execAsync = promisify(exec)

  const forgeConfigOutput = await execAsync('forge config --json')
  const forgeConfig = JSON.parse(forgeConfigOutput.stdout)

  const buildInfoPath =
    forgeConfig.build_info_path ?? join(forgeConfig.out, 'build-info')

  const cachePath = forgeConfig.cache_path
  const rpcEndpoints = parseRpcEndpoints(forgeConfig.rpc_endpoints)

  // Since foundry force recompiles after changing the foundry.toml file, we can assume that the contract
  // artifacts will contain the necessary info as long as the config includes the expected options
  const storageLayout = forgeConfig.extra_output.includes('storageLayout')
  const gasEstimates = forgeConfig.extra_output.includes('evm.gasEstimates')

  return {
    ...resolvePaths(forgeConfig.out, buildInfoPath),
    storageLayout,
    gasEstimates,
    cachePath,
    rpcEndpoints,
  }
}

/**
 * @notice Parses the RPC endpoings in a foundry.toml file.
 *
 * @param rpcEndpoints The unparsed RPC endpoints object. The value of an endpoint can be either an
 * RPC URL or an environment variable that contains an RPC URL. An example of an environment
 * variable is "${RPC_ENDPOINT}}". Whitespace is allowed, so "   ${  RPC_ENDPOINT   }  " is also
 * valid.
 *
 * @returns An object where the keys are the chain aliases and the values are the RPC URLs.
 */
const parseRpcEndpoints = (rpcEndpoints: {
  [chainAlias: string]: string
}): { [chainAlias: string]: string } => {
  const parsedEndpoints: { [chainAlias: string]: string } = {}
  for (const [chainAlias, endpoint] of Object.entries(rpcEndpoints)) {
    const trimmed = endpoint.trim()
    // Check if the endpoint is an environment variable.
    if (trimmed.startsWith('${') && trimmed.endsWith('}')) {
      const envVar = trimmed.slice(2, -1).trim()
      const envVarValue = process.env[envVar]
      if (envVarValue) {
        parsedEndpoints[chainAlias] = envVarValue
      } else {
        throw new Error(
          `Environment variable '${envVar}' not found for the chain '${chainAlias}' in the 'rpc_endpoints' section of your foundry.toml.`
        )
      }
    } else {
      // If the endpoint is not an environment variable, then it must be a URL.
      parsedEndpoints[chainAlias] = trimmed
    }
  }
  return parsedEndpoints
}
