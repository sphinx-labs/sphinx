import {
  ChugSplashRuntimeEnvironment,
  ContractArtifact,
  readUnvalidatedChugSplashConfig,
} from '@chugsplash/core'
import { BuildInfo, HardhatRuntimeEnvironment } from 'hardhat/types'

import { importOpenZeppelinStorageLayout } from './hardhat/artifacts'

// TODO: mv
// TODO: replace canonicalconfigartifact
export type ConfigArtifacts = {
  [referenceName: string]: {
    buildInfo: BuildInfo
    artifact: ContractArtifact
  }
}

export const createChugSplashRuntime = async (
  provider: providers.Provider,
  configPath: string,
  remoteExecution: boolean,
  autoConfirm: boolean,
  canonicalConfigPath: string,
  readContractArtifact: (
    contractNameOrFullyQualifiedName: string,
    artifactFolder?: string
  ) => ContractArtifact,
  readBuildInfo: (
    sourceName: string,
    contractName: string,
    buildInfoFolder?: string
  ) => Promise<BuildInfo>,
  hre: HardhatRuntimeEnvironment | undefined = undefined,
  silent: boolean,
  artifactFolder?: string,
  buildInfoFolder?: string,
  stream: NodeJS.WritableStream = process.stderr
): Promise<ChugSplashRuntimeEnvironment> => {
  const userConfig = await readUnvalidatedChugSplashConfig(configPath)

  const artifacts: ConfigArtifacts = {}

  for (const [referenceName, contractConfig] of Object.entries(
    userConfig.contracts
  )) {
    const artifact = readContractArtifact(
      contractConfig.contract,
      artifactFolder
    )

    artifacts[referenceName] = {
      artifact,
      buildInfo: await readBuildInfo(
        artifact.sourceName,
        artifact.contractName,
        buildInfoFolder
      ),
    }
  }

  const config = await readValidatedChugSplashConfig(
    provider,
    configPath,
    artifacts,
    'foundry',
    cre
  )

  return {
    configPath,
    canonicalConfigPath,
    remoteExecution,
    autoConfirm,
    stream,
    silent,
    importOpenZeppelinStorageLayout,
    hre,
  }
}
