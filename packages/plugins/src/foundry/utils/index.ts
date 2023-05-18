import * as path from 'path'
import * as fs from 'fs'

import {
  ArtifactPaths,
  BuildInfo,
  ContractArtifact,
  parseFoundryArtifact,
  UserContractConfigs,
} from '@chugsplash/core'

export const getBuildInfo = (
  buildInfoFolder: string,
  sourceName: string,
  contractName: string
): BuildInfo => {
  const completeFilePath = path.join(buildInfoFolder)

  // Get an array of all build info objects, sorted from newest to oldest.
  const sortedBuildInfoArray: Array<BuildInfo> = fs
    .readdirSync(completeFilePath)
    .filter((file) => {
      return file.endsWith('.json')
    })
    .sort((a, b) => {
      // Sort by the timestamp indicating when the file was last modified. Note that this timestamp
      // is updated in the following scenario:
      // 1. `forge build` is called, resulting in build info file #1
      // 2. Contract modifications occur, then `forge build` is called, resulting in build info file
      //    #2
      // 3. Contracts modifications are undone, then `forge build` is called, resulting in build
      //    info file #1 again.
      // In the previous scenario, this function will return build info file #1, which is correct
      // behavior.
      return (
        Number(fs.statSync(path.join(buildInfoFolder, b)).mtime) -
        Number(fs.statSync(path.join(buildInfoFolder, a)).mtime)
      )
    })
    .map((file) => {
      return JSON.parse(
        fs.readFileSync(path.join(buildInfoFolder, file), 'utf8')
      )
    })

  // Find the most recent build info file that contains this contract.
  for (const buildInfo of sortedBuildInfoArray) {
    if (buildInfo.output.contracts[sourceName]?.[contractName] !== undefined) {
      return buildInfo
    }
  }

  throw new Error(
    `Failed to find build info for ${contractName}. Should not happen.`
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

export const getArtifactPaths = async (
  contractConfigs: UserContractConfigs,
  artifactFolder: string,
  buildInfoFolder: string
): Promise<ArtifactPaths> => {
  const artifactPaths: ArtifactPaths = {}

  for (const [referenceName, contractConfig] of Object.entries(
    contractConfigs
  )) {
    const { sourceName, contractName } = getContractArtifact(
      contractConfig.contract,
      artifactFolder
    )
    const buildInfo = getBuildInfo(buildInfoFolder, sourceName, contractName)

    const folderName = `${contractName}.sol`
    const fileName = `${contractName}.json`
    const contractArtifactPath = path.join(artifactFolder, folderName, fileName)

    artifactPaths[referenceName] = {
      buildInfoPath: path.join(buildInfoFolder, `${buildInfo.id}.json`),
      contractArtifactPath,
    }
  }
  return artifactPaths
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
