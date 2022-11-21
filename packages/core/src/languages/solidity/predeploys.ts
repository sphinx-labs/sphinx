import assert from 'assert'

import { ethers } from 'ethers'
import { Provider } from '@ethersproject/abstract-provider'
import {
  OWNER_BOND_AMOUNT,
  EXECUTOR_BOND_AMOUNT,
  EXECUTION_LOCK_TIME,
  EXECUTOR_PAYMENT_PERCENTAGE,
  CHUGSPLASH_BOOTLOADER_ADDRESS,
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ChugSplashManagerABI,
  ChugSplashManagerArtifact,
  DefaultAdapterABI,
  DefaultAdapterArtifact,
  ChugSplashBootLoaderABI,
  ChugSplashBootLoaderArtifact,
  DEFAULT_ADAPTER_ADDRESS,
  CHUGSPLASH_CONSTRUCTOR_ARGS,
} from '@chugsplash/contracts'

import { getChugSplashRegistry } from '../../utils'

export const deployChugSplashPredeploys = async (
  provider: ethers.providers.JsonRpcProvider
): Promise<void> => {
  const owner = '0x1A3DAA6F487A480c1aD312b90FD0244871940b66'
  const deployer = provider.getSigner()

  // Deploy the root ChugSplashManager.
  const ChugSplashManager = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ChugSplashManagerABI,
      bytecode: ChugSplashManagerArtifact.bytecode,
    },
    salt: ethers.constants.HashZero,
    args: CHUGSPLASH_CONSTRUCTOR_ARGS[ChugSplashManagerArtifact.sourceName],
  })

  // Deploy the ChugSplashBootLoader.
  const ChugSplashBootLoader = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ChugSplashBootLoaderABI,
      bytecode: ChugSplashBootLoaderArtifact.bytecode,
    },
    salt: ethers.utils.solidityKeccak256(['string'], ['ChugSplashBootLoader']),
  })

  // Make sure the addresses match, just in case.
  assert(
    ChugSplashBootLoader.address === CHUGSPLASH_BOOTLOADER_ADDRESS,
    'ChugSplashBootLoader address mismatch'
  )

  // Initialize the ChugSplashBootloader.
  try {
    await (
      await ChugSplashBootLoader.initialize(
        owner,
        EXECUTOR_BOND_AMOUNT,
        EXECUTION_LOCK_TIME,
        OWNER_BOND_AMOUNT,
        EXECUTOR_PAYMENT_PERCENTAGE,
        ChugSplashManager.address
      )
    ).wait()
  } catch (err) {
    if (
      err.message.includes('Initializable: contract is already initialized')
    ) {
      // Ignore.
    } else {
      throw err
    }
  }

  // Deploy the DefaultAdapter.
  const DefaultAdapter = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: DefaultAdapterABI,
      bytecode: DefaultAdapterArtifact.bytecode,
    },
    salt: ethers.utils.solidityKeccak256(['string'], ['DefaultAdapter']),
  })

  // Make sure the addresses match, just in case.
  assert(
    DefaultAdapter.address === DEFAULT_ADAPTER_ADDRESS,
    'DefaultAdapter address mismatch'
  )

  // Optionally initialize registry.
  const ChugSplashRegistry = getChugSplashRegistry(provider.getSigner())
  const adapter = await ChugSplashRegistry.adapters(ethers.constants.HashZero)
  if (adapter === ethers.constants.AddressZero) {
    await (
      await ChugSplashRegistry.addProxyType(
        ethers.constants.HashZero,
        DefaultAdapter.address
      )
    ).wait()
  }
}

export const getDeterministicFactoryAddress = async (
  provider: ethers.providers.JsonRpcProvider
) => {
  // Deploy the deterministic deployer.
  if (
    (await isContractDeployed(
      DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
      provider
    )) === false
  ) {
    const sender = '0x3fab184622dc19b6109349b94811493bf2a45362'

    // Try to fund the sender account. Will work if we're running against a local hardhat node. If
    // we're not running against hardhat then this will fail silently. We'll just need to try the
    // deployment and see if the sender has enough funds to pay for the deployment.
    try {
      await provider.send('hardhat_setBalance', [
        sender,
        '0xFFFFFFFFFFFFFFFFFFFFFF',
      ])
    } catch {
      // Ignore.
    }

    // Send the raw deployment transaction for the deterministic deployer.
    try {
      await provider.waitForTransaction(
        await provider.send('eth_sendRawTransaction', [
          '0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222',
        ])
      )
    } catch (err) {
      if (err.message.includes('insufficient balance')) {
        throw new Error(
          `insufficient balance to deploy deterministic deployer, please fund the sender: ${sender}`
        )
      } else {
        throw err
      }
    }
  }

  return DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS
}

export const doDeterministicDeploy = async (
  provider: ethers.providers.JsonRpcProvider,
  options: {
    contract: {
      abi: any
      bytecode: string
    }
    salt: string
    signer: ethers.Signer
    args?: any[]
  }
): Promise<ethers.Contract> => {
  const factory = new ethers.ContractFactory(
    options.contract.abi,
    options.contract.bytecode
  )
  const deploymentTx = factory.getDeployTransaction(...(options.args || []))
  const deployer = await getDeterministicFactoryAddress(provider)
  const address = ethers.utils.getCreate2Address(
    deployer,
    options.salt,
    ethers.utils.keccak256(deploymentTx.data)
  )

  // Short circuit if already deployed.
  if (await isContractDeployed(address, provider)) {
    return new ethers.Contract(address, options.contract.abi, options.signer)
  }

  // Deploy the contract.
  await (
    await options.signer.sendTransaction({
      to: deployer,
      data: options.salt + ethers.utils.hexlify(deploymentTx.data).slice(2),
    })
  ).wait()

  if ((await isContractDeployed(address, provider)) === false) {
    throw new Error(`failed to deploy contract at ${address}`)
  }

  return new ethers.Contract(address, options.contract.abi, options.signer)
}

export const isContractDeployed = async (
  address: string,
  provider: Provider
): Promise<boolean> => {
  return (await provider.getCode(address)) !== '0x'
}
