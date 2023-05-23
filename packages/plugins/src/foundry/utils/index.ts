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
  fetchFilesRecursively,
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
  const cachedArtifacts: { [referenceName: string]: ContractArtifact } = {}
  for (const [referenceName, contractConfig] of Object.entries(
    contractConfigs
  )) {
    cachedArtifacts[referenceName] = getContractArtifact(
      contractConfig.contract,
      artifactFolder
    )
  }

  // After foundry fixes bug #4891 (https://github.com/foundry-rs/foundry/issues/4981), this can be
  // removed.
  // TODO: rm?
  if (!fs.existsSync(buildInfoFolder)) {
    fs.mkdirSync(buildInfoFolder)
  }

  const execAsync = util.promisify(exec)

  const forgeConfigOutput = await execAsync('forge config --json')
  const forgeConfig = JSON.parse(forgeConfigOutput.stdout)

  const configBasenames = Object.values(cachedArtifacts).map((artifact) =>
    path.basename(artifact.sourceName)
  )

  // Get a list of files to skip when calling `forge build --force --skip <filesToSkip>`.
  const filesToSkip = fetchFilesRecursively(forgeConfig.src)
    .map((contractPath) => path.basename(contractPath))
    .filter(
      // Keep the basename in this array if there are zero config basenames that contain it. For
      // example, if `configBasenames` = ['A.sol'] and `basename = 'AA.sol'`, then `basename` will
      // be included in the array of files to skip. If `configBasenames` = ['AA.sol'] and `basename
      // = 'A.sol'`, then the `basename` will not be included in the array of files to skip, because
      // including it would prevent `AA.sol` from being included in the compilation.
      (basename) =>
        !configBasenames.some((configBasename) =>
          configBasename.includes(basename)
        )
    )

  // This ensures that we're using the latest versions of the user's contracts. After Foundry fixes
  // bug #4981, this can just be `await execAsync('forge build')`.
  await execAsync(
    `forge build --force --silent --skip ${filesToSkip.join(
      ' '
    )} --build-info --extra-output storageLayout`
  )

  const configArtifacts: ConfigArtifacts = {}

  for (const referenceName of Object.keys(contractConfigs)) {
    const artifact = cachedArtifacts[referenceName]

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
