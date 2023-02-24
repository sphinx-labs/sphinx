import { ethers } from 'ethers'

import {
  ProxyArtifact,
  DefaultAdapterArtifact,
  ChugSplashBootLoaderArtifact,
  ChugSplashRegistryArtifact,
  ChugSplashManagerArtifact,
  ChugSplashManagerProxyArtifact,
  ChugSplashManagerABI,
  ChugSplashRecorderArtifact,
  ProxyABI,
  ProxyInitializerArtifact,
  ProxyInitializerABI,
  OZUUPSAdapterArtifact,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterArtifact,
  OZTransparentAdapterArtifact,
  ChugSplashRegistryProxyArtifact,
} from './ifaces'

export const OWNER_MULTISIG_ADDRESS =
  '0xF2a21e4E9F22AAfD7e8Bf47578a550b4102732a9'
export const EXECUTOR = '0x42761facf5e6091fca0e38f450adfb1e22bd8c3c'

export const CHUGSPLASH_PROXY_ADMIN_ADDRESS_SLOT_KEY = ethers.BigNumber.from(
  ethers.utils.keccak256(ethers.utils.toUtf8Bytes('chugsplash.proxy.admin'))
)
  .sub(1)
  .toHexString()

export const CHUGSPLASH_MANAGER_IMPL_SLOT_KEY = ethers.BigNumber.from(
  ethers.utils.keccak256(ethers.utils.toUtf8Bytes('chugsplash.manager.impl'))
)
  .sub(1)
  .toHexString()

export const EXTERNAL_DEFAULT_PROXY_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('external-default')
)
export const OZ_TRANSPARENT_PROXY_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('oz-transparent')
)
export const OZ_UUPS_PROXY_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('oz-uups')
)
export const REGISTRY_PROXY_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('internal-registry')
)

export const CHUGSPLASH_SALT = '0x' + '12'.repeat(32)

const [proxyInitializerConstructorFragment] = ProxyInitializerABI.filter(
  (fragment) => fragment.type === 'constructor'
)
const proxyInitializerConstructorArgTypes =
  proxyInitializerConstructorFragment.inputs.map((input) => input.type)
export const proxyInitializerConstructorArgValues = [
  OWNER_MULTISIG_ADDRESS,
  CHUGSPLASH_SALT,
]

export const DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS =
  '0x4e59b44847b379578588920ca78fbf26c0b4956c'
export const OWNER_BOND_AMOUNT = ethers.utils.parseEther('0.001')
export const EXECUTION_LOCK_TIME = 15 * 60
export const EXECUTOR_PAYMENT_PERCENTAGE = 20

export const CHUGSPLASH_BOOTLOADER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  CHUGSPLASH_SALT,
  ethers.utils.solidityKeccak256(
    ['bytes'],
    [ChugSplashBootLoaderArtifact.bytecode]
  )
)

export const DEFAULT_UPDATER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  CHUGSPLASH_SALT,
  ethers.utils.solidityKeccak256(['bytes'], [DefaultUpdaterArtifact.bytecode])
)

export const DEFAULT_ADAPTER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  CHUGSPLASH_SALT,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      DefaultAdapterArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address'],
        [DEFAULT_UPDATER_ADDRESS]
      ),
    ]
  )
)

export const OZ_UUPS_UPDATER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  CHUGSPLASH_SALT,
  ethers.utils.solidityKeccak256(['bytes'], [OZUUPSUpdaterArtifact.bytecode])
)

export const OZ_UUPS_ADAPTER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  CHUGSPLASH_SALT,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      OZUUPSAdapterArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address'],
        [OZ_UUPS_UPDATER_ADDRESS]
      ),
    ]
  )
)

export const OZ_TRANSPARENT_ADAPTER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  CHUGSPLASH_SALT,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      OZTransparentAdapterArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address'],
        [DEFAULT_UPDATER_ADDRESS]
      ),
    ]
  )
)

export const PROXY_INITIALIZER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  CHUGSPLASH_SALT,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      ProxyInitializerArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        proxyInitializerConstructorArgTypes,
        proxyInitializerConstructorArgValues
      ),
    ]
  )
)

const [registryProxyConstructorFragment] = ProxyABI.filter(
  (fragment) => fragment.type === 'constructor'
)
const registryProxyConstructorArgTypes =
  registryProxyConstructorFragment.inputs.map((input) => input.type)
export const registryProxyConstructorArgValues = [PROXY_INITIALIZER_ADDRESS]

export const CHUGSPLASH_REGISTRY_PROXY_ADDRESS = ethers.utils.getCreate2Address(
  PROXY_INITIALIZER_ADDRESS,
  CHUGSPLASH_SALT,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      ChugSplashRegistryProxyArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        registryProxyConstructorArgTypes,
        registryProxyConstructorArgValues
      ),
    ]
  )
)

export const ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS =
  ethers.utils.getCreate2Address(
    CHUGSPLASH_BOOTLOADER_ADDRESS,
    CHUGSPLASH_SALT,
    ethers.utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ChugSplashManagerProxyArtifact.bytecode,
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [CHUGSPLASH_REGISTRY_PROXY_ADDRESS, CHUGSPLASH_BOOTLOADER_ADDRESS]
        ),
      ]
    )
  )

export const CHUGSPLASH_REGISTRY_ADDRESS = ethers.utils.getCreate2Address(
  CHUGSPLASH_BOOTLOADER_ADDRESS,
  CHUGSPLASH_SALT,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      ChugSplashRegistryArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'uint256', 'uint256'],
        [OWNER_BOND_AMOUNT, EXECUTION_LOCK_TIME, EXECUTOR_PAYMENT_PERCENTAGE]
      ),
    ]
  )
)

export const CHUGSPLASH_RECORDER_ADDRESS = ethers.utils.getCreate2Address(
  CHUGSPLASH_BOOTLOADER_ADDRESS,
  CHUGSPLASH_SALT,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      ChugSplashRecorderArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'address'],
        [CHUGSPLASH_REGISTRY_PROXY_ADDRESS, CHUGSPLASH_REGISTRY_ADDRESS]
      ),
    ]
  )
)
