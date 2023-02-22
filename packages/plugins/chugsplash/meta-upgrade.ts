import {
  UserChugSplashConfig,
  UserContractConfig,
  chugsplashManagerConstructorArgs,
} from '@chugsplash/core'
import {
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
  OWNER_BOND_AMOUNT,
  ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
  buildInfo,
} from '@chugsplash/contracts'

const buildInfoPath = `../contracts/artifacts/build-info/${buildInfo.id}.json`

const projectName = 'ChugSplash'

const rootManagerConfig: UserContractConfig = {
  contract: 'ChugSplashManager',
  externalProxy: ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
  // We use the OpenZeppelin Transparent proxy type because it's the only adapter
  // that's compatible with the ChugSplashManagerProxy.
  externalProxyType: 'oz-transparent',
  previousBuildInfo: buildInfoPath,
  previousFullyQualifiedName:
    'contracts/ChugSplashManager.sol:ChugSplashManager',
  variables: {
    name: 'New Name', // Only changing this variable
    _owner: '{preserve}',
    _status: '{preserve}',
    _initialized: '{preserve}',
    _initializing: '{preserve}',
    __gap: '{preserve}',
    proxies: '{preserve}',
    proxyTypes: '{preserve}',
    implementations: '{preserve}',
    proposers: '{preserve}',
    _bundles: '{preserve}',
    totalDebt: '{preserve}',
    activeBundleId: '{preserve}',
    debt: '{preserve}',
  },
  constructorArgs: chugsplashManagerConstructorArgs,
}

// TODO: merge

const config: UserChugSplashConfig = {
  options: {
    projectName,
  },
  contracts: {
    RootChugSplashManager: rootManagerConfig,
    ChugSplashRegistry: {
      contract: 'ChugSplashRegistry',
      externalProxy: CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
      externalProxyType: 'external-default',
      previousBuildInfo: buildInfoPath,
      previousFullyQualifiedName:
        'contracts/ChugSplashRegistry.sol:ChugSplashRegistry',
      variables: {
        _owner: '{preserve}',
        _initialized: '{preserve}',
        _initializing: '{preserve}',
        __gap: '{preserve}',
        projects: '{preserve}',
        managers: '{preserve}',
        adapters: '{preserve}',
        executors: '{preserve}',
      },
      constructorArgs: {
        _executionLockTime: EXECUTION_LOCK_TIME,
        _ownerBondAmount: OWNER_BOND_AMOUNT.toString(),
        _executorPaymentPercentage: EXECUTOR_PAYMENT_PERCENTAGE,
      },
    },
  },
}

export default config
