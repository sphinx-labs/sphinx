import { UserChugSplashConfig } from '@chugsplash/core'
import {
  CHUGSPLASH_MANAGER_ADDRESS,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
  OWNER_BOND_AMOUNT,
  OWNER_MULTISIG_ADDRESS,
  PROXY_UPDATER_ADDRESS,
  REVERTER_ADDRESS,
  ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
} from '@chugsplash/contracts'
import { ethers } from 'ethers'

const config: UserChugSplashConfig = {
  options: {
    projectName: 'ChugSplash',
  },
  contracts: {
    RootChugSplashManager: {
      contract: 'ChugSplashManager',
      externalProxy: ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
      externalProxyType: 'oz-transparent',
      variables: {
        _owner: OWNER_MULTISIG_ADDRESS,
        _status: 1,
        _initialized: 255,
        _initializing: false,
        __gap: [],
        registry: CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
        proxyUpdater: PROXY_UPDATER_ADDRESS,
        ownerBondAmount: OWNER_BOND_AMOUNT.toString(),
        executionLockTime: EXECUTION_LOCK_TIME,
        executorPaymentPercentage: EXECUTOR_PAYMENT_PERCENTAGE,
        proxies: {},
        proxyTypes: {},
        implementations: {},
        proposers: {},
        _bundles: {},
        name: 'Root Manager',
        activeBundleId:
          '0x76469a681d8488b0b4e33868976209e6eed797611b9321e26858b66e99738627',
        debt: 0,
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
