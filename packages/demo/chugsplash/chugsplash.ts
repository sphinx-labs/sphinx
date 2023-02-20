import { UserChugSplashConfig } from '@chugsplash/core'
import {
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
  OWNER_BOND_AMOUNT,
  ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
} from '@chugsplash/contracts'
import { ethers } from 'ethers'

const config: UserChugSplashConfig = {
  options: {
    projectName: 'ChugSplash',
    skipStorageCheck: true,
  },
  contracts: {
    RootChugSplashManager: {
      contract: 'ChugSplashManager',
      externalProxy: ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
      externalProxyType: 'oz-transparent',
      previousBuildInfo:
        '../contracts/artifacts/build-info/a457b2a6053dd0a5e1e0c24d6d422873.json',
      previousFullyQualifiedName:
        'contracts/ChugSplashManager.sol:ChugSplashManager',
      variables: {
        _owner: '{preserve}',
        _status: '{preserve}',
        _initialized: '{preserve}',
        _initializing: '{preserve}',
        __gap: [],
        proxies: {},
        proxyTypes: {},
        implementations: {},
        proposers: {},
        _bundles: {},
        name: 'New Name',
        totalDebt: '{preserve}',
        activeBundleId: '{preserve}',
        debt: {},
      },
      constructorArgs: {
        _registry: CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
        _executionLockTime: EXECUTION_LOCK_TIME,
        _ownerBondAmount: OWNER_BOND_AMOUNT.toString(),
        _executorPaymentPercentage: EXECUTOR_PAYMENT_PERCENTAGE,
      },
    },
    // ChugSplashRegistry: {
    //   contract: 'ChugSplashRegistry',
    //   externalProxy: CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    //   externalProxyType: 'oz-transparent',
    //   variables: {
    //     _initialized: 255,
    //     _initializing: false,
    //     _owner: OWNER_MULTISIG_ADDRESS,
    //     __gap: [],
    //     projects: {},
    //     managers: {},
    //     adapters: {},
    //     executors: {},
    //     proxyUpdater: PROXY_UPDATER_ADDRESS,
    //     reverter: REVERTER_ADDRESS,
    //     ownerBondAmount: OWNER_BOND_AMOUNT.toString(),
    //     executionLockTime: EXECUTION_LOCK_TIME,
    //     executorPaymentPercentage: EXECUTOR_PAYMENT_PERCENTAGE,
    //     managerImplementation: CHUGSPLASH_MANAGER_ADDRESS,
    //   },
    // },
  },
}

export default config
