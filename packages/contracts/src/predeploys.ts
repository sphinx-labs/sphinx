import 'hardhat-deploy'

import {
  OWNER_BOND_AMOUNT,
  EXECUTOR_BOND_AMOUNT,
  EXECUTION_LOCK_TIME,
} from './constants'
import {
  ProxyUpdaterABI,
  ProxyUpdaterArtifact,
  ChugSplashRegistryABI,
  ChugSplashRegistryArtifact,
  DefaultAdapterABI,
  DefaultAdapterArtifact,
} from './ifaces'

export const deployChugSplashPredeploys = async (
  hre,
  deployerAddress: string
) => {
  await deployProxyUpdater(hre, deployerAddress)
  await deployChugSplashRegistry(hre, deployerAddress)
  await deployDefaultAdapter(hre, deployerAddress)
}

export const deployProxyUpdater = async (hre, deployerAddress: string) => {
  const { deploy } = await hre.deployments.deterministic('ProxyUpdater', {
    salt: hre.ethers.utils.solidityKeccak256(['string'], ['ProxyUpdater']),
    from: deployerAddress,
    contract: {
      abi: ProxyUpdaterABI,
      bytecode: ProxyUpdaterArtifact.bytecode,
    },
    args: [],
    log: true,
  })
  await deploy()
}

export const deployChugSplashRegistry = async (
  hre,
  deployerAddress: string
) => {
  const ProxyUpdater = await hre.deployments.get('ProxyUpdater')

  const { deploy } = await hre.deployments.deterministic('ChugSplashRegistry', {
    salt: hre.ethers.utils.solidityKeccak256(
      ['string'],
      ['ChugSplashRegistry']
    ),
    from: deployerAddress,
    contract: {
      abi: ChugSplashRegistryABI,
      bytecode: ChugSplashRegistryArtifact.bytecode,
    },
    args: [
      ProxyUpdater.address,
      OWNER_BOND_AMOUNT,
      EXECUTOR_BOND_AMOUNT,
      EXECUTION_LOCK_TIME,
    ],
    log: true,
  })

  await deploy()
}

export const deployDefaultAdapter = async (hre, deployerAddress: string) => {
  const { deploy } = await hre.deployments.deterministic('DefaultAdapter', {
    salt: hre.ethers.utils.solidityKeccak256(['string'], ['DefaultAdapter']),
    contract: {
      abi: DefaultAdapterABI,
      bytecode: DefaultAdapterArtifact.bytecode,
    },
    from: deployerAddress,
    args: [],
    log: true,
  })
  await deploy()
}
