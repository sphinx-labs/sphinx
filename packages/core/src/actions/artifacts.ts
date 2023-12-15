import { SolidityStorageLayout } from '@sphinx-labs/contracts'

import { CompilerOutput } from '../languages/solidity/types'
import { SphinxJsonRpcProvider } from '../provider'

/**
 * Gets the storage layout for a contract. Still requires the build info compiler input
 * which is acceptable b/c this function is only used during out local development and testing.
 * This function should not be used in production.
 *
 * @param contractFullyQualifiedName Fully qualified name of the contract.
 * @param artifactFolder Relative path to the folder where artifacts are stored.
 * @return Storage layout object from the compiler output.
 */
export const getStorageLayout = (
  compilerOutput: CompilerOutput,
  sourceName: string,
  contractName: string
): SolidityStorageLayout => {
  const contractOutput = compilerOutput.contracts[sourceName][contractName]

  // Foundry artifacts do not contain the storage layout field for contracts which have no storage.
  // So we default to an empty storage layout in this case for consistency.
  return contractOutput.storageLayout ?? { storage: [], types: {} }
}

export const getDeployedBytecode = async (
  provider: SphinxJsonRpcProvider,
  address: string
): Promise<string> => {
  const deployedBytecode = await provider.getCode(address)
  return deployedBytecode
}

export const findStorageSlotKey = (
  storageLayout: SolidityStorageLayout,
  varName: string
): string => {
  const storageObj = storageLayout.storage.find((s) => s.label === varName)

  if (!storageObj) {
    throw new Error(`Could not find storage slot key.`)
  }

  return storageObj.slot
}
