import { ethers } from 'ethers'

import {
  DefaultAdapterArtifact,
  ProxyUpdaterArtifact,
  ChugSplashRegistryArtifact,
} from './ifaces'

const DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS =
  '0x4e59b44847b379578588920ca78fbf26c0b4956c'
export const OWNER_BOND_AMOUNT = ethers.utils.parseUnits('0.1')
export const EXECUTOR_BOND_AMOUNT = ethers.utils.parseUnits('0.1')
export const EXECUTION_LOCK_TIME = 15 * 60

export const PROXY_UPDATER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.utils.solidityKeccak256(['string'], ['ProxyUpdater']),
  ethers.utils.solidityKeccak256(['bytes'], [ProxyUpdaterArtifact.bytecode])
)

export const CHUGSPLASH_REGISTRY_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.utils.solidityKeccak256(['string'], ['ChugSplashRegistry']),
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      ChugSplashRegistryArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'uint256'],
        [
          PROXY_UPDATER_ADDRESS,
          OWNER_BOND_AMOUNT,
          EXECUTOR_BOND_AMOUNT,
          EXECUTION_LOCK_TIME,
        ]
      ),
    ]
  )
)

export const DEFAULT_ADAPTER_ADDRESS =
  ethers.utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ethers.utils.solidityKeccak256(['string'], ['DefaultAdapter']),
    ethers.utils.solidityKeccak256(['bytes'], [DefaultAdapterArtifact.bytecode])
  )
