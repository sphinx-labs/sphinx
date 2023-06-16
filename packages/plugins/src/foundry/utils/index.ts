import * as path from 'path'
import * as fs from 'fs'

import {
  BuildInfo,
  ConfigArtifacts,
  ContractArtifact,
  parseFoundryArtifact,
  UserContractConfigs,
} from '@chugsplash/core'

export const getBuildInfo = (
  buildInfoFolder: string,
  sourceName: string
): BuildInfo => {
  const completeFilePath = path.join(buildInfoFolder)

  // Get the inputs from the build info folder.
  const inputs = fs
    .readdirSync(completeFilePath)
    .filter((file) => {
      return file.endsWith('.json')
    })
    .map((file) => {
      return JSON.parse(
        fs.readFileSync(path.join(buildInfoFolder, file), 'utf8')
      )
    })

  // Find the correct build info file
  for (const input of inputs) {
    if (input?.output?.sources[sourceName] !== undefined) {
      return input
    }
  }

  throw new Error(
    `Failed to find build info for ${sourceName}. Please check that you:
1. Imported this file in your script
2. Set 'force=true' in your foundry.toml
3. Check that ${buildInfoFolder} is the correct build info directory.`
  )
}

export const getContractArtifact = (
  name: string,
  artifactFilder: string
): ContractArtifact => {
  const folderName = `${name}.sol`
  const fileName = `${name}.json`
  const completeFilePath = path.join(artifactFilder, folderName, fileName)

  if (!fs.existsSync(completeFilePath)) {
    throw new Error(
      `Could not find artifact for: ${name}. Did you forget to import it in your script file?`
    )
  }

  const artifact = JSON.parse(fs.readFileSync(completeFilePath, 'utf8'))

  return parseFoundryArtifact(artifact)
}

export const getConfigArtifacts = async (
  contractConfigs: UserContractConfigs,
  artifactFolder: string,
  buildInfoFolder: string
): Promise<ConfigArtifacts> => {
  const configArtifacts: ConfigArtifacts = {}

  for (const [referenceName, contractConfig] of Object.entries(
    contractConfigs
  )) {
    const artifact = getContractArtifact(
      contractConfig.contract,
      artifactFolder
    )
    const buildInfo = getBuildInfo(buildInfoFolder, artifact.sourceName)

    configArtifacts[referenceName] = {
      artifact,
      buildInfo,
    }
  }
  return configArtifacts
}

export const cleanPath = (dirtyPath: string) => {
  let cleanQuotes = dirtyPath.replace(/'/g, '')
  cleanQuotes = cleanQuotes.replace(/"/g, '')
  return cleanQuotes.trim()
}

export const fetchPaths = (outPath: string, buildInfoPath: string) => {
  const artifactFolder = path.resolve(outPath)
  const buildInfoFolder = path.resolve(buildInfoPath)
  const deploymentFolder = path.resolve('deployments')
  const canonicalConfigPath = path.resolve('.canonical-configs')

  return {
    artifactFolder,
    buildInfoFolder,
    deploymentFolder,
    canonicalConfigPath,
  }
}
