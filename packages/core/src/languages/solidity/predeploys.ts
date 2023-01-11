import assert from 'assert'

import { Contract, ethers } from 'ethers'
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
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  ProxyABI,
  ProxyInitializerABI,
  ProxyInitializerArtifact,
  CHUGSPLASH_REGISTRY_ADDRESS,
  OWNER_MULTISIG_ADDRESS,
  PROXY_INITIALIZER_ADDRESS,
  CHUGSPLASH_SALT,
} from '@chugsplash/contracts'
import { Logger } from '@eth-optimism/common-ts'
import { sleep } from '@eth-optimism/core-utils'

import {
  getChugSplashRegistry,
  getProxyAt,
  getProxyAdmin,
  isContractDeployed,
  getProxyImplementationAddress,
  getGasPriceOverrides,
} from '../../utils'

export const initializeChugSplash = async (
  provider: ethers.providers.JsonRpcProvider,
  deployer: ethers.Signer,
  logger?: Logger
): Promise<void> => {
  logger?.info('[ChugSplash]: deploying ChugSplashManager...')

  // Deploy the root ChugSplashManager.
  const ChugSplashManager = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ChugSplashManagerABI,
      bytecode: ChugSplashManagerArtifact.bytecode,
    },
    salt: CHUGSPLASH_SALT,
    args: CHUGSPLASH_CONSTRUCTOR_ARGS[ChugSplashManagerArtifact.sourceName],
  })

  logger?.info('[ChugSplash]: ChugSplashManager deployed')
  logger?.info('[ChugSplash]: deploying ChugSplashBootLoader...')

  // Deploy the ChugSplashBootLoader.
  const ChugSplashBootLoader = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ChugSplashBootLoaderABI,
      bytecode: ChugSplashBootLoaderArtifact.bytecode,
    },
    salt: CHUGSPLASH_SALT,
  })

  logger?.info('[ChugSplash]: ChugSplashBootLoader deployed')

  // Make sure the addresses match, just in case.
  assert(
    ChugSplashBootLoader.address === CHUGSPLASH_BOOTLOADER_ADDRESS,
    'ChugSplashBootLoader address mismatch'
  )

  logger?.info('[ChugSplash]: initializing ChugSplashBootLoader...')

  // Initialize the ChugSplashBootLoader.
  try {
    await (
      await ChugSplashBootLoader.initialize(
        OWNER_MULTISIG_ADDRESS,
        EXECUTOR_BOND_AMOUNT,
        EXECUTION_LOCK_TIME,
        OWNER_BOND_AMOUNT,
        EXECUTOR_PAYMENT_PERCENTAGE,
        ChugSplashManager.address,
        CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
        CHUGSPLASH_SALT,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info('[ChugSplash]: ChugSplashBootLoader initialized')
  } catch (err) {
    if (
      err.message.includes('Initializable: contract is already initialized')
    ) {
      logger?.info('[ChugSplash]: ChugSplashBootLoader was already initialized')
    } else {
      throw err
    }
  }

  logger?.info('[ChugSplash]: deploying ProxyInitializer...')

  // Deploy the ProxyInitializer, which we use to deploy and initialize the ChugSplashRegistry's
  // proxy.
  const ProxyInitializer = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ProxyInitializerABI,
      bytecode: ProxyInitializerArtifact.bytecode,
    },
    salt: CHUGSPLASH_SALT,
    args: CHUGSPLASH_CONSTRUCTOR_ARGS[ProxyInitializerArtifact.sourceName],
  })

  logger?.info('[ChugSplash]: ProxyInitializer deployed')

  // Make sure the ChugSplashRegistry proxy deployed by the ProxyInitializer has the correct
  // address.
  assert(
    (await ProxyInitializer.proxy()) === CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    'ChugSplashRegistry proxy address mismatch'
  )

  // Make sure the multisig owner address is correct.
  assert(
    (await ProxyInitializer.newOwner()) === OWNER_MULTISIG_ADDRESS,
    'ProxyInitializer has incorrect multisig owner address'
  )

  // Make sure the ProxyInitializer addresses match, just in case.
  assert(
    ProxyInitializer.address === PROXY_INITIALIZER_ADDRESS,
    'ProxyInitializer address mismatch'
  )

  logger?.info('[ChugSplash]: initializing ChugSplashRegistry proxy...')

  const ChugSplashRegistryProxy = new Contract(
    CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    ProxyABI,
    provider
  )

  // Check if the ChugSplashRegistry proxy's owner is the ProxyInitializer. This will only be true
  // when the ChugSplashRegistry's proxy hasn't been initialized yet.
  if (
    (await getProxyAdmin(ChugSplashRegistryProxy)) === PROXY_INITIALIZER_ADDRESS
  ) {
    // Initialize the ChugSplashRegistry's proxy. This sets the ChugSplashRegistry proxy's
    // implementation and transfers ownership of the proxy to the multisig owner.
    await (
      await ProxyInitializer.initialize(
        CHUGSPLASH_REGISTRY_ADDRESS,
        await getGasPriceOverrides(provider)
      )
    ).wait()

    // Make sure ownership of the ChugSplashRegistry's proxy has been transferred.
    assert(
      (await getProxyAdmin(ChugSplashRegistryProxy)) === OWNER_MULTISIG_ADDRESS,
      'ChugSplashRegistry proxy has incorrect owner'
    )

    // Make sure the ChugSplashRegistry's proxy has the correct implementation address.
    assert(
      (await getProxyImplementationAddress(
        provider,
        CHUGSPLASH_REGISTRY_PROXY_ADDRESS
      )) === CHUGSPLASH_REGISTRY_ADDRESS,
      'ChugSplashRegistry proxy has incorrect implememtation'
    )

    logger?.info('[ChugSplash]: ChugSplashRegistry proxy initialized')
  } else {
    logger?.info(
      '[ChugSplash]: ChugSplashRegistry proxy was already initialized'
    )
  }

  logger?.info('[ChugSplash]: deploying DefaultAdapter...')

  // Deploy the DefaultAdapter.
  const DefaultAdapter = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: DefaultAdapterABI,
      bytecode: DefaultAdapterArtifact.bytecode,
    },
    salt: CHUGSPLASH_SALT,
  })

  logger?.info('[ChugSplash]: DefaultAdapter deployed')

  // Make sure the addresses match, just in case.
  assert(
    DefaultAdapter.address === DEFAULT_ADAPTER_ADDRESS,
    'DefaultAdapter address mismatch'
  )

  logger?.info(
    '[ChugSplash]: adding the default proxy type to the ChugSplashRegistry...'
  )

  // Set the default proxy type on the registry. Note that `monitorChugSplashSetup` relies on the
  // fact that this is the last transaction to setup ChugSplash. If this changes, we also change
  // `monitorChugSplashSetup` to reflect this.
  const ChugSplashRegistry = getChugSplashRegistry(deployer)
  const adapter = await ChugSplashRegistry.adapters(ethers.constants.HashZero)
  if (adapter === ethers.constants.AddressZero) {
    await (
      await ChugSplashRegistry.addProxyType(
        ethers.constants.HashZero,
        DefaultAdapter.address,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[ChugSplash]: added the default proxy type to the ChugSplashRegistry'
    )
  } else {
    logger?.info(
      '[ChugSplash]: the default proxy type was already added to the ChugSplashRegistry'
    )
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

  // Create a transaction request with gas price overrides.
  const txnRequest = await getGasPriceOverrides(provider, {
    to: deployer,
    data: options.salt + ethers.utils.hexlify(deploymentTx.data).slice(2),
  })

  // Deploy the contract.
  await (await options.signer.sendTransaction(txnRequest)).wait()

  if ((await isContractDeployed(address, provider)) === false) {
    throw new Error(`failed to deploy contract at ${address}`)
  }

  return new ethers.Contract(address, options.contract.abi, options.signer)
}

export const monitorChugSplashSetup = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer
) => {
  const ChugSplashRegistry = getChugSplashRegistry(signer)

  while (!(await isContractDeployed(ChugSplashRegistry.address, provider))) {
    await sleep(1000)
  }

  while (
    OWNER_MULTISIG_ADDRESS !==
    (await getProxyAdmin(getProxyAt(signer, CHUGSPLASH_REGISTRY_PROXY_ADDRESS)))
  ) {
    await sleep(1000)
  }

  while (
    (await ChugSplashRegistry.adapters(ethers.constants.HashZero)) !==
    DEFAULT_ADAPTER_ADDRESS
  ) {
    await sleep(1000)
  }
}
