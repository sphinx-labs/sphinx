import { ethers } from 'ethers'
import { bytecode as ProxyBytecode } from '@chugsplash/contracts/artifacts/@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol/Proxy.json'

import {
  DefaultAdapterArtifact,
  ProxyUpdaterArtifact,
  // ChugSplashRegistryArtifact,
  ChugSplashBootLoaderArtifact,
} from './ifaces'

export const DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS =
  '0x4e59b44847b379578588920ca78fbf26c0b4956c'
export const OWNER_BOND_AMOUNT = ethers.utils.parseUnits('0.1')
export const EXECUTOR_BOND_AMOUNT = ethers.utils.parseUnits('0.1')
export const EXECUTION_LOCK_TIME = 15 * 60
export const EXECUTOR_PAYMENT_PERCENTAGE = 20

export const CHUGSPLASH_BOOTLOADER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.utils.solidityKeccak256(['string'], ['ChugSplashBootLoader']),
  ethers.utils.solidityKeccak256(
    ['bytes'],
    [ChugSplashBootLoaderArtifact.bytecode]
  )
)

export const PROXY_UPDATER_ADDRESS = ethers.utils.getCreate2Address(
  CHUGSPLASH_BOOTLOADER_ADDRESS,
  // ethers.utils.solidityKeccak256(['string'], ['ProxyUpdater']),
  ethers.constants.HashZero,
  ethers.utils.solidityKeccak256(['bytes'], [ProxyUpdaterArtifact.bytecode])
)

export const CHUGSPLASH_REGISTRY_PROXY_ADDRESS = ethers.utils.getCreate2Address(
  CHUGSPLASH_BOOTLOADER_ADDRESS,
  ethers.constants.HashZero,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      ProxyBytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address'],
        [CHUGSPLASH_BOOTLOADER_ADDRESS]
      ),
    ]
  )
)

// export const ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS =
//   ethers.utils.getCreate2Address(
//     CHUGSPLASH_BOOTLOADER_ADDRESS,
//     ethers.constants.HashZero,
//     ethers.utils.solidityKeccak256(
//       ['bytes', 'bytes'],
//       [
//         ChugSplashManagerProxyArtifact.bytecode,
//         ethers.utils.defaultAbiCoder.encode(
//           ['address', 'address', 'address', 'bytes'],
//           [
//             CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
//             CHUGSPLASH_BOOTLOADER_ADDRESS, wrong
//           ]
//         ),
//       ]
//     )
//   )

// export const CHUGSPLASH_REGISTRY_ADDRESS = ethers.utils.getCreate2Address(
//   DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
//   ethers.utils.solidityKeccak256(['string'], ['ChugSplashRegistry']),
//   ethers.utils.solidityKeccak256(
//     ['bytes', 'bytes'],
//     [
//       ChugSplashRegistryArtifact.bytecode,
//       ethers.utils.defaultAbiCoder.encode(
//         ['address', 'uint256', 'uint256', 'uint256'],
//         [
//           PROXY_UPDATER_ADDRESS,
//           OWNER_BOND_AMOUNT,
//           EXECUTOR_BOND_AMOUNT,
//           EXECUTION_LOCK_TIME,
//         ]
//       ),
//     ]
//   )
// )

export const DEFAULT_ADAPTER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.utils.solidityKeccak256(['string'], ['DefaultAdapter']),
  ethers.utils.solidityKeccak256(['bytes'], [DefaultAdapterArtifact.bytecode])
)
