import * as path from 'path'
import * as fs from 'fs'

import {
  BuildInfo,
  ConfigArtifacts,
  ContractArtifact,
  parseFoundryArtifact,
  UserContractConfigs,
  validateBuildInfo,
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
  for (let i = 0; i < sortedBuildInfoArray.length; i++) {
    const currBuildInfo = sortedBuildInfoArray[i]
    if (
      currBuildInfo.output.contracts[sourceName]?.[contractName] !== undefined
    ) {
      const olderBuildInfoArray = sortedBuildInfoArray.slice(i + 1)
      const buildInfo = getFullBuildInfo(currBuildInfo, olderBuildInfoArray)
      validateBuildInfo(buildInfo, contractName)
      return buildInfo
    }
  }

  throw new Error(`TODO`)
}

// TODO: explain why we need this, and that it's temporary
const getFullBuildInfo = (
  buildInfo: BuildInfo,
  olderBuildInfoArray: Array<BuildInfo>
): BuildInfo => {
  if (
    buildInfo.input.settings.outputSelection['*']?.['*'].includes(
      'storageLayout'
    )
  ) {
    return buildInfo
  }

  // TODO(docs): mention that we must iterate over buildInfo.output.sources, not
  // buildInfo.input.sources.
  for (const sourceName of Object.keys(buildInfo.output.sources)) {
    if (
      buildInfo.input.settings.outputSelection[sourceName]?.['*'].includes(
        'storageLayout'
      )
    ) {
      continue
    }

    // TODO(docs): gets the newest build info that...
    const targetBuildInfo = olderBuildInfoArray.find((olderBuildInfo) => {
      const containsSource =
        olderBuildInfo.output.sources[sourceName] !== undefined
      const outputSelection = olderBuildInfo.input.settings.outputSelection
      const containsStorageLayoutForSource =
        outputSelection['*']?.['*'].includes('storageLayout') ||
        outputSelection[sourceName]?.['*'].includes('storageLayout')
      return containsSource && containsStorageLayoutForSource
    })

    if (!targetBuildInfo) {
      // TODO(docs): if can't find, say to forge clean then try again.
      throw new Error(`Could not find TODO`)
    }

    const targetSourceOutput = targetBuildInfo.output.sources[sourceName]
    const targetContractOutput = targetBuildInfo.output.contracts[sourceName]
    buildInfo.output.sources[sourceName] = targetSourceOutput
    buildInfo.output.contracts[sourceName] = targetContractOutput
  }

  // TODO(docs)explain why we can do this.
  buildInfo.input.settings.outputSelection['*']['*'] = ['storageLayout']

  return buildInfo
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
    const buildInfo = getBuildInfo(
      buildInfoFolder,
      artifact.sourceName,
      artifact.contractName
    )

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
