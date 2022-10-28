import * as semver from 'semver'
import { SolidityStorageLayout } from '@chugsplash/core'

// TODO
export type ContractArtifact = any
export type BuildInfo = any

/**
 * Retrieves an artifact by name.
 *
 * @param name Name of the artifact.
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
 * @param name Name of the contract.
 * @returns Contract build info.
 */
export const getBuildInfo = async (name: string): Promise<BuildInfo> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const hre = require('hardhat')
  return hre.artifacts.getBuildInfo(name)
}

/**
 * Retrieves the storageLayout portion of the compiler artifact for a given contract by name. This
 * function is hardhat specific.
 *
 * @param hre HardhatRuntimeEnvironment, required for the readArtifactSync function.
 * @param name Name of the contract to retrieve the storage layout for.
 * @return Storage layout object from the compiler output.
 */
export const getStorageLayout = async (
  name: string
): Promise<SolidityStorageLayout> => {
  const { sourceName, contractName } = await getContractArtifact(name)
  const buildInfo = await getBuildInfo(`${sourceName}:${contractName}`)
  const output = buildInfo.output.contracts[sourceName][contractName]

  if (!semver.satisfies(buildInfo.solcVersion, '>=0.4.x <0.9.x')) {
    throw new Error(
      `Storage layout for Solidity version ${buildInfo.solcVersion} not yet supported. Sorry!`
    )
  }

  if (!('storageLayout' in output)) {
    throw new Error(
      `Storage layout for ${name} not found. Did you forget to set the storage layout compiler option in your hardhat config? Read more: https://github.com/ethereum-optimism/smock#note-on-using-smoddit`
    )
  }

  return (output as any).storageLayout
}

// export const getDeployedBytecode = async (name: string): Promise<string> => {
// const { sourceName, contractName } = await getContractArtifact(name)
// const buildInfo = await getBuildInfo(`${sourceName}:${contractName}`)

// const output = buildInfo.output.contracts[sourceName][contractName]
// const deployedBytecode = output.evm.deployedBytecode.object
// const immutableReferences = output.evm.deployedBytecode.immutableReferences
// const nodes = buildInfo.output.sources[sourceName].ast.nodes

// return '' // TODO
// }
