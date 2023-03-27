import assert from 'assert'

import { Contract, ethers } from 'ethers'
import {
  OWNER_BOND_AMOUNT,
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
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  ProxyInitializerABI,
  ProxyInitializerArtifact,
  CHUGSPLASH_REGISTRY_ADDRESS,
  OWNER_MULTISIG_ADDRESS,
  PROXY_INITIALIZER_ADDRESS,
  CHUGSPLASH_SALT,
  ChugSplashRegistryABI,
  ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
  DefaultUpdaterABI,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterABI,
  OZUUPSOwnableAdapterABI,
  OZUUPSAccessControlAdapterABI,
  OZTransparentAdapterABI,
  OZUUPSUpdaterArtifact,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  DEFAULT_UPDATER_ADDRESS,
  DEFAULT_ADAPTER_ADDRESS,
  OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
  OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
  OZ_UUPS_UPDATER_ADDRESS,
  OZ_TRANSPARENT_ADAPTER_ADDRESS,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  EXTERNAL_DEFAULT_PROXY_TYPE_HASH,
  OZTransparentAdapterArtifact,
  ChugSplashRegistryProxyABI,
  CHUGSPLASH_RECORDER_ADDRESS,
  ChugSplashRecorderABI,
} from '@chugsplash/contracts'
import { Logger } from '@eth-optimism/common-ts'
import { sleep } from '@eth-optimism/core-utils'

import {
  getChugSplashRegistry,
  getEIP1967ProxyAdminAddress,
  isContractDeployed,
  getEIP1967ProxyImplementationAddress,
  getGasPriceOverrides,
} from '../../utils'
import {
  CHUGSPLASH_CONSTRUCTOR_ARGS,
  INITIAL_CHUGSPLASH_MANAGER_ADDRESS,
} from '../../constants'

export const initializeChugSplash = async (
  provider: ethers.providers.JsonRpcProvider,
  deployer: ethers.Signer,
  executors: string[],
  logger?: Logger
): Promise<void> => {
  logger?.info('[ChugSplash]: deploying ChugSplashManager...')

  const Proxy__ChugSplashRegistry = new Contract(
    CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    ChugSplashRegistryProxyABI,
    deployer
  )

  // Deploy the ChugSplashManager implementation if it hasn't already been deployed.
  let ChugSplashManager: ethers.Contract
  if ((await provider.getCode(INITIAL_CHUGSPLASH_MANAGER_ADDRESS)) === '0x') {
    ChugSplashManager = await doDeterministicDeploy(provider, {
      signer: deployer,
      contract: {
        abi: ChugSplashManagerABI,
        bytecode: ChugSplashManagerArtifact.bytecode,
      },
      salt: CHUGSPLASH_SALT,
      args: CHUGSPLASH_CONSTRUCTOR_ARGS[ChugSplashManagerArtifact.sourceName],
    })
  } else {
    // Attach to the current ChugSplashManager implementation.
    ChugSplashManager = new ethers.Contract(
      await Proxy__ChugSplashRegistry.managerImplementation(),
      ChugSplashManagerABI,
      provider
    )
  }

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

  const ChugSplashRecorder = new Contract(
    CHUGSPLASH_RECORDER_ADDRESS,
    ChugSplashRecorderABI,
    deployer
  )

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
    ChugSplashRegistryABI,
    deployer
  )

  try {
    await (
      await Proxy__ChugSplashRegistry.initialize(
        ChugSplashManager.address,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[ChugSplash]: Set ChugSplashManager implementation in registry proxy'
    )
  } catch (err) {
    if (
      err.message.includes(
        'ChugSplashRegistryProxy: manager impl already initialized'
      )
    ) {
      logger?.info(
        '[ChugSplash]: manager implementation was already initialized in registry'
      )
    } else {
      throw err
    }
  }

  assert(
    (await Proxy__ChugSplashRegistry.managerImplementation()) ===
      ChugSplashManager.address,
    'ChugSplashManager implementation address mismatch'
  )

  // Check if the ChugSplashRegistry proxy's owner is the ProxyInitializer. This will only be true
  // when the ChugSplashRegistry's proxy hasn't been initialized yet.
  if (
    (await getEIP1967ProxyAdminAddress(
      provider,
      CHUGSPLASH_REGISTRY_PROXY_ADDRESS
    )) === PROXY_INITIALIZER_ADDRESS
  ) {
    logger?.info('[ChugSplash]: initializing ChugSplashRegistry...')

    // Initialize the ChugSplashRegistry's proxy. This sets the ChugSplashRegistry proxy's
    // implementation, calls the ChugSplashRegistry's initializer, and transfers ownership of the proxy to the
    // root ChugSplashManagerProxy.
    await (
      await ProxyInitializer.initialize(
        CHUGSPLASH_REGISTRY_ADDRESS,
        ChugSplashRegistryProxy.interface.encodeFunctionData('initialize', [
          ChugSplashRecorder.address,
          await deployer.getAddress(),
          ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
          executors,
        ]),
        await getGasPriceOverrides(provider)
      )
    ).wait()

    for (const executorAddress of executors) {
      assert(
        (await ChugSplashRegistryProxy.executors(executorAddress)) === true,
        'Failed to add executor to ChugSplashRegistry'
      )
    }

    // Make sure ownership of the ChugSplashRegistry's proxy has been transferred.
    assert(
      (await getEIP1967ProxyAdminAddress(
        provider,
        Proxy__ChugSplashRegistry.address
      )) === OWNER_MULTISIG_ADDRESS,
      'ChugSplashRegistry proxy has incorrect owner'
    )

    // Make sure the ChugSplashRegistry's proxy has the correct implementation address.
    assert(
      (await getEIP1967ProxyImplementationAddress(
        provider,
        CHUGSPLASH_REGISTRY_PROXY_ADDRESS
      )) === CHUGSPLASH_REGISTRY_ADDRESS,
      'ChugSplashRegistry proxy has incorrect implememtation'
    )

    // Transfer ownership of the ChugSplashRegistry's proxy from the deployer to the multisig.
    await (
      await ChugSplashRegistryProxy.transferOwnership(
        OWNER_MULTISIG_ADDRESS,
        await getGasPriceOverrides(provider)
      )
    ).wait()

    assert(
      (await ChugSplashRegistryProxy.owner()) === OWNER_MULTISIG_ADDRESS,
      'Failed to set owner of ChugSplashRegistry via its proxy'
    )

    logger?.info('[ChugSplash]: ChugSplashRegistry initialized')
  } else {
    logger?.info(
      '[ChugSplash]: ChugSplashRegistry proxy was already initialized'
    )
  }

  logger?.info('[ChugSplash]: deploying OZTransparentAdapter...')

  // Deploy the OpenZeppelin Transparent Adapter.
  const OZTransparentAdapter = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: OZTransparentAdapterABI,
      bytecode: OZTransparentAdapterArtifact.bytecode,
    },
    args: CHUGSPLASH_CONSTRUCTOR_ARGS[OZTransparentAdapterArtifact.sourceName],
    salt: CHUGSPLASH_SALT,
  })

  logger?.info('[ChugSplash]: OZTransparentAdapter deployed')

  // Make sure the addresses match, just in case.
  assert(
    OZTransparentAdapter.address === OZ_TRANSPARENT_ADAPTER_ADDRESS,
    'OZTransparentAdapter address mismatch'
  )

  // Deploy the DefaultUpdater.
  const DefaultUpdater = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: DefaultUpdaterABI,
      bytecode: DefaultUpdaterArtifact.bytecode,
    },
    salt: CHUGSPLASH_SALT,
  })

  logger?.info('[ChugSplash]: DefaultUpdater deployed')

  // Make sure the addresses match, just in case.
  assert(
    DefaultUpdater.address === DEFAULT_UPDATER_ADDRESS,
    'DefaultUpdater address mismatch'
  )

  logger?.info(
    '[ChugSplash]: adding the default proxy type to the ChugSplashRegistry...'
  )

  // Set the oz transparent proxy type on the registry.
  if (
    (await ChugSplashRecorder.adapters(OZ_TRANSPARENT_PROXY_TYPE_HASH)) !==
    OZTransparentAdapter.address
  ) {
    await (
      await ChugSplashRecorder.addContractKind(
        OZ_TRANSPARENT_PROXY_TYPE_HASH,
        OZTransparentAdapter.address,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[ChugSplash]: added the transparent proxy type to the ChugSplashRegistry'
    )
  } else {
    logger?.info(
      '[ChugSplash]: the transparent proxy type was already added to the ChugSplashRegistry'
    )
  }

  // Deploy the OZUUPSAdapter.
  const OZUUPSOwnableAdapter = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: OZUUPSOwnableAdapterABI,
      bytecode: OZUUPSOwnableAdapterArtifact.bytecode,
    },
    args: CHUGSPLASH_CONSTRUCTOR_ARGS[OZUUPSOwnableAdapterArtifact.sourceName],
    salt: CHUGSPLASH_SALT,
  })

  logger?.info('[ChugSplash]: OZUUPSAdapter deployed')

  // Make sure the addresses match, just in case.
  assert(
    OZUUPSOwnableAdapter.address === OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
    'OZUUPSOwnableAdapter address mismatch'
  )

  // Deploy the OZUUPSAdapter.
  const OZUUPSAccessControlAdapter = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: OZUUPSAccessControlAdapterABI,
      bytecode: OZUUPSAccessControlAdapterArtifact.bytecode,
    },
    args: CHUGSPLASH_CONSTRUCTOR_ARGS[
      OZUUPSAccessControlAdapterArtifact.sourceName
    ],
    salt: CHUGSPLASH_SALT,
  })

  logger?.info('[ChugSplash]: OZUUPSAdapter deployed')

  // Make sure the addresses match, just in case.
  assert(
    OZUUPSAccessControlAdapter.address ===
      OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
    'OZUUPSAccessControlAdapter address mismatch'
  )

  // Deploy the OZUUPSUpdater.
  const OZUUPSUpdater = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: OZUUPSUpdaterABI,
      bytecode: OZUUPSUpdaterArtifact.bytecode,
    },
    salt: CHUGSPLASH_SALT,
  })

  logger?.info('[ChugSplash]: OZUUPSUpdater deployed')

  // Make sure the addresses match, just in case.
  assert(
    OZUUPSUpdater.address === OZ_UUPS_UPDATER_ADDRESS,
    'OZUUPSUpdater address mismatch'
  )

  logger?.info(
    '[ChugSplash]: adding the uups proxy type to the ChugSplashRegistry...'
  )

  // Set the oz uups proxy type on the registry.
  if (
    (await ChugSplashRecorder.adapters(OZ_UUPS_OWNABLE_PROXY_TYPE_HASH)) !==
    OZUUPSOwnableAdapter.address
  ) {
    await (
      await ChugSplashRecorder.addContractKind(
        OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
        OZUUPSOwnableAdapter.address,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[ChugSplash]: added the uups ownable proxy type to the ChugSplashRegistry'
    )
  } else {
    logger?.info(
      '[ChugSplash]: the uups ownable proxy type was already added to the ChugSplashRegistry'
    )
  }

  // Set the oz uups proxy type on the registry.
  if (
    (await ChugSplashRecorder.adapters(
      OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH
    )) !== OZUUPSAccessControlAdapter.address
  ) {
    await (
      await ChugSplashRecorder.addContractKind(
        OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
        OZUUPSAccessControlAdapter.address,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[ChugSplash]: added the uups access control proxy type to the ChugSplashRegistry'
    )
  } else {
    logger?.info(
      '[ChugSplash]: the uups access control proxy type was already added to the ChugSplashRegistry'
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
    args: CHUGSPLASH_CONSTRUCTOR_ARGS[DefaultAdapterArtifact.sourceName],
    salt: CHUGSPLASH_SALT,
  })

  logger?.info('[ChugSplash]: DefaultAdapter deployed')

  if (
    (await ChugSplashRecorder.adapters(EXTERNAL_DEFAULT_PROXY_TYPE_HASH)) !==
    DefaultAdapter.address
  ) {
    await (
      await ChugSplashRecorder.addContractKind(
        EXTERNAL_DEFAULT_PROXY_TYPE_HASH,
        DefaultAdapter.address,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[ChugSplash]: added the external default proxy type to the ChugSplashRegistry'
    )
  } else {
    logger?.info(
      '[ChugSplash]: the external default proxy type was already added to the ChugSplashRegistry'
    )
  }

  // Set the internal default proxy type on the registry. Note that `monitorChugSplashSetup` relies
  // on the fact that this is the last transaction to setup ChugSplash. If this changes, we also
  // change `monitorChugSplashSetup` to reflect this.
  if (
    (await ChugSplashRecorder.adapters(ethers.constants.HashZero)) !==
    DefaultAdapter.address
  ) {
    await (
      await ChugSplashRecorder.addContractKind(
        ethers.constants.HashZero,
        DefaultAdapter.address,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[ChugSplash]: added the internal default proxy type to the ChugSplashRegistry'
    )
  } else {
    logger?.info(
      '[ChugSplash]: the internal default proxy type was already added to the ChugSplashRegistry'
    )
  }

  // Don't put any transactions here! See note above.
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
  const deployer = await getDeterministicFactoryAddress(provider)

  const deploymentTx = factory.getDeployTransaction(...(options.args || []))
  if (deploymentTx.data === undefined) {
    throw new Error(`Deployment transaction data is undefined`)
  }

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
  const ChugSplashRecorder = new Contract(
    CHUGSPLASH_RECORDER_ADDRESS,
    ChugSplashRecorderABI,
    provider
  )

  while (!(await isContractDeployed(ChugSplashRegistry.address, provider))) {
    await sleep(1000)
  }

  while (
    OWNER_MULTISIG_ADDRESS !==
    (await getEIP1967ProxyAdminAddress(
      provider,
      CHUGSPLASH_REGISTRY_PROXY_ADDRESS
    ))
  ) {
    await sleep(1000)
  }

  while (
    (await ChugSplashRecorder.adapters(ethers.constants.HashZero)) !==
    DEFAULT_ADAPTER_ADDRESS
  ) {
    await sleep(1000)
  }
}
