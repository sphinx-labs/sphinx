import { Contract, ethers, Signer } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import {
  OWNER_BOND_AMOUNT,
  EXECUTOR_BOND_AMOUNT,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  PROXY_UPDATER_ADDRESS,
  ChugSplashManagerABI,
  ChugSplashManagerArtifact,
  DefaultAdapterABI,
  DefaultAdapterArtifact,
  ChugSplashBootLoaderABI,
  ChugSplashBootLoaderArtifact,
  DEFAULT_ADAPTER_ADDRESS,
} from '@chugsplash/contracts'
import { getChugSplashRegistry } from '@chugsplash/core'

export const deployChugSplashPredeploys = async (
  hre: HardhatRuntimeEnvironment,
  deployer: ethers.Signer
) => {
  const chugsplashOwnerAddress = '0x1A3DAA6F487A480c1aD312b90FD0244871940b66'

  if ((await isBootloaderInitialized(deployer)) === false) {
    const managerImplementationAddress =
      await deployChugSplashManagerImplementation(
        hre,
        deployer,
        chugsplashOwnerAddress
      )
    await deployAndInitializeChugSplashBootLoader(
      hre,
      deployer,
      chugsplashOwnerAddress,
      managerImplementationAddress
    )
  }

  if ((await isDefaultAdapterDeployed(deployer)) === false) {
    await deployDefaultAdapter(hre, await deployer.getAddress())
  }

  const ChugSplashRegistry = getChugSplashRegistry(deployer)
  if ((await isRegistryInitialized(ChugSplashRegistry)) === false) {
    const tx = await ChugSplashRegistry.addProxyType(
      ethers.constants.HashZero,
      DEFAULT_ADAPTER_ADDRESS
    )
    await tx.wait()
  }

  // await deployProxyUpdater(hre, deployerAddress)
  // await deployChugSplashRegistry(hre, deployerAddress)
  // await deployDefaultAdapter(hre, deployerAddress)
}

export const deployAndInitializeChugSplashBootLoader = async (
  hre,
  deployer: ethers.Signer,
  ownerAddress: string,
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
  const { address: bootloaderAddress } = await deploy()

  const ChugSplashBootLoader = new ethers.Contract(
    bootloaderAddress,
    new ethers.utils.Interface(ChugSplashBootLoaderABI),
    deployer
  )

  const tx = await ChugSplashBootLoader.initialize(
    ownerAddress,
    EXECUTOR_BOND_AMOUNT,
    EXECUTION_LOCK_TIME,
    OWNER_BOND_AMOUNT,
    EXECUTOR_PAYMENT_PERCENTAGE,
    managerImplementationAddress
  )
  await tx.wait()
}

export const deployChugSplashManagerImplementation = async (
  hre,
  deployer: ethers.Signer,
  ownerAddress: string
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
      ownerAddress,
      PROXY_UPDATER_ADDRESS,
      EXECUTOR_BOND_AMOUNT,
      EXECUTION_LOCK_TIME,
      OWNER_BOND_AMOUNT,
      EXECUTOR_PAYMENT_PERCENTAGE,
    ],
    log: true,
  })
  const { address } = await deploy()
  return address
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

export const chugsplashContractsAreDeployedAndInitialized = async (
  signer: Signer
): Promise<boolean> => {
  const bootloaderInitialized = await isBootloaderInitialized(signer)
  const defaultAdapterDeployed = await isDefaultAdapterDeployed(signer)
  if (!bootloaderInitialized || !defaultAdapterDeployed) {
    return false
  }

  const ChugSplashRegistry = getChugSplashRegistry(signer)
  const registryInitialized = await isRegistryInitialized(ChugSplashRegistry)
  return registryInitialized
}

export const isBootloaderInitialized = async (
  signer: Signer
): Promise<boolean> => {
  const deployedBytecode = await signer.provider.getCode(PROXY_UPDATER_ADDRESS)
  return deployedBytecode !== '0x'
}

export const isDefaultAdapterDeployed = async (
  signer: Signer
): Promise<boolean> => {
  const deployedBytecode = await signer.provider.getCode(
    DEFAULT_ADAPTER_ADDRESS
  )
  return deployedBytecode !== '0x'
}

export const isRegistryInitialized = async (
  registry: Contract
): Promise<boolean> => {
  const adapter = await registry.adapters(ethers.constants.HashZero)
  return adapter !== ethers.constants.AddressZero
}
