import * as path from 'path'
import * as fs from 'fs'

import { utils, constants, Signer, Contract, providers, ethers } from 'ethers'
import {
  ProxyArtifact,
  ChugSplashRegistryABI,
  ChugSplashManagerABI,
  ChugSplashManagerProxyArtifact,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
} from '@chugsplash/contracts'

export const computeBundleId = (
  bundleRoot: string,
  bundleSize: number,
  configUri: string
): string => {
  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['bytes32', 'uint256', 'string'],
      [bundleRoot, bundleSize, configUri]
    )
  )
}

export const writeSnapshotId = async (
  networkName: string,
  deploymentFolderPath: string,
  snapshotId: string
) => {
  const networkPath = path.join(
    path.basename(deploymentFolderPath),
    networkName
  )
  if (!fs.existsSync(networkPath)) {
    fs.mkdirSync(networkPath, { recursive: true })
  }
  const snapshotIdPath = path.join(networkPath, '.snapshotId')
  fs.writeFileSync(snapshotIdPath, snapshotId)
}

export const createDeploymentFolderForNetwork = (
  networkName: string,
  deploymentFolderPath: string
) => {
  const networkPath = path.join(
    path.basename(deploymentFolderPath),
    networkName
  )
  if (!fs.existsSync(networkPath)) {
    fs.mkdirSync(networkPath, { recursive: true })
  }
}

export const writeDeploymentArtifact = (
  networkName: string,
  deploymentFolderPath: string,
  artifact: any,
  referenceName: string
) => {
  const artifactPath = path.join(
    path.basename(deploymentFolderPath),
    networkName,
    `${referenceName}.json`
  )
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, '\t'))
}

export const getProxyAddress = (
  projectName: string,
  referenceName: string
): string => {
  // const chugSplashManagerAddress = getChugSplashManagerAddress(projectName)
  const chugSplashManagerAddress = getChugSplashManagerProxyAddress(projectName)

  return utils.getCreate2Address(
    chugSplashManagerAddress,
    utils.keccak256(utils.toUtf8Bytes(referenceName)),
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ProxyArtifact.bytecode,
        utils.defaultAbiCoder.encode(['address'], [chugSplashManagerAddress]),
      ]
    )
  )
}

export const isProxyDeployed = async (
  provider: ethers.providers.JsonRpcProvider,
  projectName: string,
  referenceName: string
): Promise<boolean> => {
  const proxyAddress = getProxyAddress(projectName, referenceName)
  return (await provider.getCode(proxyAddress)) !== '0x'
}

export const getChugSplashManagerProxyAddress = (projectName: string) => {
  return utils.getCreate2Address(
    CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    utils.solidityKeccak256(['string'], [projectName]),
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ChugSplashManagerProxyArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [CHUGSPLASH_REGISTRY_PROXY_ADDRESS, CHUGSPLASH_REGISTRY_PROXY_ADDRESS]
        ),
      ]
    )
  )
}

// export const getChugSplashManagerAddress = (projectName: string) => {
//   return utils.getCreate2Address(
//     CHUGSPLASH_REGISTRY_ADDRESS,
//     constants.HashZero,
//     utils.solidityKeccak256(
//       ['bytes', 'bytes'],
//       [
//         ChugSplashManagerArtifact.bytecode,
//         utils.defaultAbiCoder.encode(
//           ['address', 'string', 'address', 'uint256', 'uint256', 'uint256'],
//           [
//             CHUGSPLASH_REGISTRY_ADDRESS,
//             projectName,
//             PROXY_UPDATER_ADDRESS,
//             EXECUTOR_BOND_AMOUNT,
//             EXECUTION_LOCK_TIME,
//             OWNER_BOND_AMOUNT,
//           ]
//         ),
//       ]
//     )
//   )
// }

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
  signer: Signer
) => {
  const ChugSplashRegistry = getChugSplashRegistry(signer)

  if (
    (await ChugSplashRegistry.projects(projectName)) === constants.AddressZero
  ) {
    try {
      const tx = await ChugSplashRegistry.register(projectName, projectOwner)
      await tx.wait()
    } catch (err) {
      throw new Error(
        'Failed to register project. Try again with another project name.'
      )
    }
  } else {
    const existingProjectOwner = await getProjectOwner(projectName, signer)
    if (existingProjectOwner !== (await signer.getAddress())) {
      throw new Error(`Project already registered by: ${existingProjectOwner}.`)
    }
  }
}

export const getProjectOwner = async (
  projectName: string,
  signer: Signer
): Promise<string> => {
  const ChugSplashRegistry = getChugSplashRegistry(signer)
  const ChugSplashManager = new Contract(
    await ChugSplashRegistry.projects(projectName),
    ChugSplashManagerABI,
    signer
  )
  const projectOwner = await ChugSplashManager.owner()
  return projectOwner
}

export const getChugSplashRegistry = (
  signerOrProvider?: Signer | providers.Provider
): Contract => {
  return new Contract(
    // CHUGSPLASH_REGISTRY_ADDRESS,
    CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    ChugSplashRegistryABI,
    signerOrProvider
  )
}

export const getChugSplashManagerImplementationAddress =
  async (): Promise<string> => {
    const ChugSplashRegistryProxy = getChugSplashRegistry()
    const managerImplementationAddress =
      await ChugSplashRegistryProxy.managerImplementation()
    return managerImplementationAddress
  }

export const log = async (message: string, hide?: boolean) => {
  if (!hide) {
    console.log(message)
  }
}
