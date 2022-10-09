import { ethers } from 'ethers'
import {
  OWNER_BOND_AMOUNT,
  EXECUTOR_BOND_AMOUNT,
  EXECUTION_LOCK_TIME,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  PROXY_UPDATER_ADDRESS,
  ProxyUpdaterABI,
  ProxyUpdaterArtifact,
  ChugSplashRegistryABI,
  ChugSplashRegistryArtifact,
  ChugSplashManagerABI,
  ChugSplashManagerArtifact,
  DefaultAdapterABI,
  DefaultAdapterArtifact,
  ChugSplashBootLoaderABI,
  ChugSplashBootLoaderArtifact,
} from '@chugsplash/contracts'
import 'hardhat-deploy'

export const deployChugSplashPredeploys = async (
  hre,
  deployer: ethers.Signer
  // deployerAddress: string
) => {
  const owner = ethers.Wallet.createRandom().connect(hre.provider)

  const managerImplementationAddress =
    await deployChugSplashManagerImplementation(hre, deployer, owner)
  await deployAndInitializeChugSplashBootLoader(
    hre,
    deployer,
    owner,
    managerImplementationAddress
  )
  await deployDefaultAdapter(hre, await deployer.getAddress())
  // await deployProxyUpdater(hre, deployerAddress)
  // await deployChugSplashRegistry(hre, deployerAddress)
  // await deployDefaultAdapter(hre, deployerAddress)
}

export const deployAndInitializeChugSplashBootLoader = async (
  hre,
  deployer: ethers.Signer,
  owner: ethers.Wallet,
  managerImplementationAddress: string
) => {
  const deployerAddress = await deployer.getAddress()
  const { deploy } = await hre.deployments.deterministic(
    'ChugSplashBootLoader',
    {
      salt: hre.ethers.utils.solidityKeccak256(
        ['string'],
        ['ChugSplashBootLoader']
      ),
      from: deployerAddress,
      contract: {
        abi: ChugSplashBootLoaderABI,
        bytecode: ChugSplashBootLoaderArtifact.bytecode,
      },
      args: [],
      log: true,
    }
  )
  const { address: bootLoaderAddress } = await deploy()

  const ChugSplashBootLoader = new ethers.Contract(
    bootLoaderAddress,
    new ethers.utils.Interface(ChugSplashBootLoaderABI),
    deployer
  )

  const tx = await ChugSplashBootLoader.initialize(
    owner.address,
    EXECUTOR_BOND_AMOUNT,
    EXECUTION_LOCK_TIME,
    OWNER_BOND_AMOUNT,
    managerImplementationAddress
  )
  await tx.wait()
}

export const deployChugSplashManagerImplementation = async (
  hre,
  deployer: ethers.Signer,
  owner: ethers.Wallet
): Promise<string> => {
  const deployerAddress = await deployer.getAddress()
  const { deploy } = await hre.deployments.deterministic('ChugSplashManager', {
    salt: hre.ethers.utils.HashZero,
    from: deployerAddress,
    contract: {
      abi: ChugSplashManagerABI,
      bytecode: ChugSplashManagerArtifact.bytecode,
    },
    args: [
      CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
      'Root Manager',
      owner.address,
      PROXY_UPDATER_ADDRESS,
      EXECUTOR_BOND_AMOUNT,
      EXECUTION_LOCK_TIME,
      OWNER_BOND_AMOUNT,
    ],
    log: true,
  })
  const { address } = await deploy()
  return address
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
