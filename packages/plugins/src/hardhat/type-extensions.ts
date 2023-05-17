import * as path from 'path'

import { extendConfig, extendEnvironment } from 'hardhat/config'
import { ethers } from 'ethers'
import { lazyObject } from 'hardhat/plugins'
import { HardhatConfig, HardhatRuntimeEnvironment } from 'hardhat/types'

import { getContract, resetChugSplashDeployments } from './deployments'
// To extend one of Hardhat's types, you need to import the module where it has been defined, and
// redeclare it.
import 'hardhat/types/config'
import 'hardhat/types/runtime'

declare module 'hardhat/types/config' {
  // Extend the HardhatConfig type, which represents the configuration after it has been resolved.
  // This is the type used during the execution of tasks, tests and scripts.
  export interface ProjectPathsConfig {
    chugsplash: string
    deployments: string
    canonicalConfigs: string
  }
}

declare module 'hardhat/types/runtime' {
  // Extend the HardhatRuntimeEnvironment type. These new fields will be available in tasks,
  // scripts, and tests.
  export interface HardhatRuntimeEnvironment {
    chugsplash: {
      reset: () => Promise<void>
      getContract: (
        projectName: string,
        referenceName: string,
        salt?: string
      ) => Promise<ethers.Contract>
    }
  }
}

extendConfig((config: HardhatConfig) => {
  config.paths.chugsplash = path.join(config.paths.root, 'chugsplash')
  config.paths.deployments = path.join(config.paths.root, 'deployments')
  config.paths.canonicalConfigs = path.join(
    config.paths.root,
    '.canonical-configs'
  )
})

extendEnvironment(async (hre: HardhatRuntimeEnvironment) => {
  hre.chugsplash = lazyObject(() => {
    return {
      reset: async (): Promise<void> => {
        await resetChugSplashDeployments(hre)
      },
      getContract: async (
        projectName: string,
        referenceName: string,
        salt?: string
      ): Promise<ethers.Contract> => {
        const contract = await getContract(
          hre,
          projectName,
          referenceName,
          salt
        )
        return contract
      },
    }
  })
})
