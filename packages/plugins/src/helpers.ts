import {
  ChugSplashRegistryABI,
  ChugSplashManagerABI,
  CHUGSPLASH_REGISTRY_ADDRESS,
} from '@chugsplash/contracts'
import { ethers } from 'ethers'

/**
 * Registers a new ChugSplash project.
 *
 * @param projectName Name of the created project.
 * @param projectOwner Owner of the ChugSplashManager contract deployed by this call.
 * @param signer Signer to execute the transaction.
 * @returns True if the project was successfully created and false if the project was already registered.
 */
export const registerChugSplashProject = async (
  projectName: string,
  projectOwner: string,
  signer: ethers.Signer
): Promise<boolean> => {
  const ChugSplashRegistry = getChugSplashRegistry(signer)

  if (
    (await ChugSplashRegistry.projects(projectName)) ===
    ethers.constants.AddressZero
  ) {
    try {
      const tx = await ChugSplashRegistry.register(projectName, projectOwner)
      await tx.wait()
    } catch (err) {
      throw new Error(
        'Failed to register project. Try again with another project name.'
      )
    }
    return true
  } else {
    return false
  }
}

export const getProjectOwner = async (
  projectName: string,
  signer: ethers.Signer
): Promise<string> => {
  const ChugSplashRegistry = getChugSplashRegistry(signer)
  const ChugSplashManager = new ethers.Contract(
    await ChugSplashRegistry.projects(projectName),
    ChugSplashManagerABI,
    signer
  )
  const projectOwner = await ChugSplashManager.owner()
  return projectOwner
}

export const getChugSplashRegistry = (
  signerOrProvider: ethers.Signer | ethers.providers.Provider
): ethers.Contract => {
  return new ethers.Contract(
    CHUGSPLASH_REGISTRY_ADDRESS,
    ChugSplashRegistryABI,
    signerOrProvider
  )
}
