import * as path from 'path'
import * as fs from 'fs'

import { utils, constants, Signer, Contract, providers } from 'ethers'
// TODO: import the Proxy bytecode from @eth-optimism/contracts-bedrock when they update the npm
// package. Also remove @chugsplash/contracts from core/
import { bytecode as ProxyBytecode } from '@chugsplash/contracts/artifacts/@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol/Proxy.json'
import {
  ChugSplashRegistryABI,
  ChugSplashManagerABI,
  ChugSplashManagerProxyArtifact,
  // CHUGSPLASH_REGISTRY_ADDRESS,
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

export const writeSnapshotId = async (hre: any) => {
  const hardhatNetworkPath = path.join(
    path.basename(hre.config.paths.deployed),
    '31337'
  )
  if (!fs.existsSync(hardhatNetworkPath)) {
    fs.mkdirSync(hardhatNetworkPath, { recursive: true })
  }

  const snapshotId = await hre.network.provider.send('evm_snapshot', [])
  const snapshotIdPath = path.join(hardhatNetworkPath, '.snapshotId')
  fs.writeFileSync(snapshotIdPath, snapshotId)
}

export const getProxyAddress = (
  projectName: string,
  target: string
): string => {
  // const chugSplashManagerAddress = getChugSplashManagerAddress(projectName)
  const chugSplashManagerAddress = getChugSplashManagerProxyAddress(projectName)

  return utils.getCreate2Address(
    chugSplashManagerAddress,
    utils.keccak256(utils.toUtf8Bytes(target)),
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ProxyBytecode,
        utils.defaultAbiCoder.encode(['address'], [chugSplashManagerAddress]),
      ]
    )
  )
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
): Promise<boolean> => {
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
    return true
  } else {
    return false
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
