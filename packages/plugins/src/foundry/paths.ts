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
  const canonicalConfigFolder = resolve('.canonical-configs')

  return {
    artifactFolder,
    buildInfoFolder,
    deploymentFolder,
    canonicalConfigFolder,
  }
}

export const getPaths = async (): Promise<{
  artifactFolder: string
  buildInfoFolder: string
  deploymentFolder: string
  canonicalConfigFolder: string
}> => {
  const execAsync = promisify(exec)

  const forgeConfigOutput = await execAsync('forge config --json')
  const forgeConfig = JSON.parse(forgeConfigOutput.stdout)

  const buildInfoPath =
    forgeConfig.build_info_path ?? join(forgeConfig.out, 'build-info')
  return resolvePaths(forgeConfig.out, buildInfoPath)
}
