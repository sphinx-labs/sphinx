import path from 'path'

import { BuildInfo, HardhatRuntimeEnvironment } from 'hardhat/types'
import { ArtifactPaths, UserContractConfigs } from '@chugsplash/core'
import {
  ChugSplashManagerArtifact,
  buildInfo as chugsplashBuildInfo,
  ChugSplashRegistryArtifact,
} from '@chugsplash/contracts'

/**
 * Retrieves contract build info by name.
 *
 * @param sourceName Source file name.
 * @param contractName Contract name within the source file.
 * @returns Contract build info.
 */
export const getBuildInfo = async (
  hre: HardhatRuntimeEnvironment,
  sourceName: string,
  contractName: string
): Promise<BuildInfo> => {
  let buildInfo: BuildInfo | undefined
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

  // Shouldn't happen, but might as well be safe.
  if (buildInfo === undefined) {
    throw new Error(
      `unable to find build info for contract ${contractName} in ${sourceName}`
    )
  }

  return buildInfo
}

/**
 * Finds the path to the build info file and the contract artifact file for each contract
 * referenced in the given contract configurations.
 *
 * @param hre Hardhat runtime environment.
 * @param contractConfigs Contract configurations.
 * @param artifactFolder Path to the artifact folder.
 * @param buildInfoFolder Path to the build info folder.
 * @returns Paths to the build info and contract artifact files.
 */
export const getArtifactPaths = async (
  hre: HardhatRuntimeEnvironment,
  contractConfigs: UserContractConfigs,
  artifactFolder: string,
  buildInfoFolder: string
): Promise<ArtifactPaths> => {
  const artifactPaths: ArtifactPaths = {}
  for (const [referenceName, contractConfig] of Object.entries(
    contractConfigs
  )) {
    const { sourceName, contractName } = hre.artifacts.readArtifactSync(
      contractConfig.contract
    )
    const buildInfo = await getBuildInfo(hre, sourceName, contractName)
    artifactPaths[referenceName] = {
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
