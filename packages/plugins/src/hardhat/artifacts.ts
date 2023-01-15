import path from 'path'

import { BuildInfo } from 'hardhat/types'
import {
  ArtifactPaths,
  ContractArtifact,
  UserContractConfigs,
} from '@chugsplash/core'

/**
 * Retrieves an artifact by name.
 *
 * @param Name Name of the contract.
 * @returns Artifact.
 */
export const getContractArtifact = (name: string): ContractArtifact => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const hre = require('hardhat')
  return hre.artifacts.readArtifactSync(name)
}

/**
 * Retrieves contract build info by name.
 *
 * @param sourceName Source file name.
 * @param contractName Contract name.
 * @returns Contract build info.
 */
export const getBuildInfo = async (
  sourceName: string,
  contractName: string
): Promise<BuildInfo> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const hre = require('hardhat')

  let buildInfo: BuildInfo
  try {
    buildInfo = await hre.artifacts.getBuildInfo(
      `${sourceName}:${contractName}`
    )
  } catch (err) {
    try {
      // Try also loading with the short source name, necessary when using the foundry
      // hardhat plugin
      const shortSourceName = path.basename(sourceName)
      buildInfo = await hre.artifacts.getBuildInfo(
        `${shortSourceName}:${contractName}`
      )
    } catch {
      // Throwing the original error is probably more helpful here because using the
      // foundry hardhat plugin is not a common usecase.
      throw err
    }
  }

  return buildInfo
}

export const getArtifactPaths = async (
  contractConfigs: UserContractConfigs,
  artifactFolder: string,
  buildInfoFolder: string
): Promise<ArtifactPaths> => {
  const artifactPaths: ArtifactPaths = {}

  for (const { contract } of Object.values(contractConfigs)) {
    const { sourceName, contractName } = getContractArtifact(contract)
    const buildInfo = await getBuildInfo(sourceName, contractName)
    artifactPaths[contract] = {
      buildInfoPath: path.join(buildInfoFolder, `${buildInfo.id}.json`),
      contractArtifactPath: path.join(
        artifactFolder,
        sourceName,
        `${contractName}.json`
      ),
    }
  }
  return artifactPaths
}
