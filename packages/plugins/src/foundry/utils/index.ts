import * as path from 'path'
import * as fs from 'fs'
import util from 'util'
import { exec } from 'child_process'

import {
  BuildInfo,
  ConfigArtifacts,
  ContractArtifact,
  parseFoundryArtifact,
  UserContractConfigs,
  validateBuildInfo,
} from '@chugsplash/core'

import { fetchFilesRecursively } from '../../hardhat'

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
      validateBuildInfo(buildInfo, contractName)
      return buildInfo
    }
  }

  throw new Error(`TODO`)
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
  const configContractNames = Object.values(contractConfigs).map(
    (contractConfig) =>
      contractConfig.contract.includes(':')
        ? contractConfig.contract.split(':')[1]
        : contractConfig.contract
  )

  // After foundry fixes bug #4891 (https://github.com/foundry-rs/foundry/issues/4981), this can be
  // removed.
  if (!fs.existsSync(buildInfoFolder)) {
    fs.mkdirSync(buildInfoFolder)
  }

  // TODO: left off: I think we should do filename.extension name instead of just filename. i think
  // this'll give more accurate filtering. e.g. instead of "configContractName = A", it's "A.sol".

  const contractsToSkip = fetchFilesRecursively(buildInfoFolder)
    .map((contractPath) => path.basename(contractPath))
    .filter((contractName) =>
      // TODO(docs): e.g. config contract's name is "MyReverter", and there's another contract in the
      // repo called "Reverter". If we `--skip Reverter`, then we'll skip the config contract as well.
      configContractNames.some((configContractName) =>
        contractName.includes(configContractName)
      )
    )

  const execAsync = util.promisify(exec)
  // This ensures that we're using the latest versions of the user's contracts. After Foundry fixes
  // bug #4981, this can just be `await execAsync('forge build')`.
  await execAsync('forge build')

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
