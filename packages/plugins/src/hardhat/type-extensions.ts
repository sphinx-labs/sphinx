import * as path from 'path'

import { extendConfig, extendEnvironment } from 'hardhat/config'
import { ethers } from 'ethers'

import { getContract, resetChugSplashDeployments } from './deployments'

// TODO: Extend HardhatConfig type. See https://github.com/NomicFoundation/hardhat-ts-plugin-boilerplate/blob/master/src/index.ts
extendConfig((config: any) => {
  config.paths.chugsplash = path.join(config.paths.root, 'chugsplash')
  config.paths.deployed = path.join(config.paths.root, 'deployed')
})

// TODO: Extend HRE type
extendEnvironment((hre: any) => {
  hre.chugsplash = {}
  hre.chugsplash.reset = async () => {
    await resetChugSplashDeployments(hre)
  }
  hre.chugsplash.getContract = async (
    name: string
  ): Promise<ethers.Contract> => {
    const contract = await getContract(hre, hre.ethers.provider, name)
    return contract
  }
})
