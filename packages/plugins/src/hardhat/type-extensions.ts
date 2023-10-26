// import * as path from 'path'

// // To extend one of Hardhat's types, you need to import the module where it has been defined, and
// // redeclare it.
// import { extendConfig, extendEnvironment } from 'hardhat/config'
// import { lazyObject } from 'hardhat/plugins'
// import { HardhatConfig, HardhatRuntimeEnvironment } from 'hardhat/types'
// import 'hardhat/types/config'
// import 'hardhat/types/runtime'
// import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
// import { ethers } from 'ethers'
// import { UserSalt } from '@sphinx-labs/core'

// import { getContract, resetSphinxDeployments } from './deployments'

// declare module 'hardhat/types/config' {
//   // Extend the HardhatConfig type, which represents the configuration after it has been resolved.
//   // This is the type used during the execution of tasks, tests and scripts.
//   export interface ProjectPathsConfig {
//     sphinx: string
//     deployments: string
//     compilerConfigs: string
//   }
// }

// declare module 'hardhat/types/runtime' {
//   // Extend the HardhatRuntimeEnvironment type. These new fields will be available in tasks,
//   // scripts, and tests.
//   export interface HardhatRuntimeEnvironment {
//     sphinx: {
//       reset: (provider: ethers.Provider) => Promise<void>
//       getContract: (
//         projectName: string,
//         referenceName: string,
//         owner: ethers.Signer,
//         salt?: UserSalt
//       ) => Promise<ethers.Contract>
//     }
//   }
// }

// extendConfig((config: HardhatConfig) => {
//   config.paths.sphinx = path.join(config.paths.root, 'sphinx')
//   config.paths.deployments = path.join(config.paths.root, 'deployments')
//   config.paths.compilerConfigs = path.join(
//     config.paths.root,
//     '.compiler-configs'
//   )
// })

// extendEnvironment(async (hre: HardhatRuntimeEnvironment) => {
//   hre.sphinx = lazyObject(() => {
//     return {
//       reset: async (provider: HardhatEthersProvider): Promise<void> => {
//         await resetSphinxDeployments(hre, provider)
//       },
//       getContract: async (
//         projectName: string,
//         referenceName: string,
//         owner: ethers.Signer,
//         salt?: UserSalt
//       ): Promise<ethers.Contract> => {
//         const contract = await getContract(
//           hre,
//           projectName,
//           referenceName,
//           owner,
//           salt
//         )
//         return contract
//       },
//     }
//   })
// })
