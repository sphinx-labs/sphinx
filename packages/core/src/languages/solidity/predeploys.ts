import assert from 'assert'

import { Contract, ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  DefaultAdapterABI,
  DefaultAdapterArtifact,
  OWNER_MULTISIG_ADDRESS,
  ChugSplashRegistryABI,
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
  ChugSplashRegistryArtifact,
} from '@chugsplash/contracts'
import { Logger } from '@eth-optimism/common-ts'
import { sleep } from '@eth-optimism/core-utils'

import {
  getEIP1967ProxyAdminAddress,
  isContractDeployed,
  getGasPriceOverrides,
} from '../../utils'
import {
  CHUGSPLASH_CONSTRUCTOR_ARGS,
  CHUGSPLASH_REGISTRY_ADDRESS,
  registryConstructorValues,
} from '../../constants'

export const initializeChugSplash = async (
  provider: ethers.providers.JsonRpcProvider,
  deployer: ethers.Signer,
  executors: string[],
  logger?: Logger
): Promise<void> => {
  logger?.info('[ChugSplash]: deploying ChugSplashRegistry...')

  const ChugSplashRegistry = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ChugSplashRegistryABI,
      bytecode: ChugSplashRegistryArtifact.bytecode,
    },
    args: registryConstructorValues,
    salt: ethers.constants.HashZero,
  })

  assert(
    CHUGSPLASH_REGISTRY_ADDRESS === ChugSplashRegistry.address,
    'ChugSplashRegistry has incorrect address'
  )

  logger?.info('[ChugSplash]: deployed ChugSplashRegistry')
  logger?.info('[ChugSplash]: initializing ChugSplashRegistry...')

  try {
    await (
      await ChugSplashRegistry.initialize(
        executors,
        await getGasPriceOverrides(provider)
      )
    ).wait()
  } catch (err) {
    if (
      err.message.includes('Initializable: contract is already initialized')
    ) {
      logger?.info('[ChugSplash]: registry was already initialized')
    } else {
      throw err
    }
  }

  for (const executorAddress of executors) {
    assert(
      (await ChugSplashRegistry.executors(executorAddress)) === true,
      'Failed to add executor to ChugSplashRegistry'
    )
  }

  logger?.info('[ChugSplash]: ChugSplashRegistry initialized')

  logger?.info('[ChugSplash]: deploying OZTransparentAdapter...')

  // Deploy the OpenZeppelin Transparent Adapter.
  const OZTransparentAdapter = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: OZTransparentAdapterABI,
      bytecode: OZTransparentAdapterArtifact.bytecode,
    },
    args: CHUGSPLASH_CONSTRUCTOR_ARGS[OZTransparentAdapterArtifact.sourceName],
    salt: ethers.constants.HashZero,
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
    salt: ethers.constants.HashZero,
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
    (await ChugSplashRegistry.adapters(OZ_TRANSPARENT_PROXY_TYPE_HASH)) !==
    OZTransparentAdapter.address
  ) {
    await (
      await ChugSplashRegistry.addContractKind(
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
    salt: ethers.constants.HashZero,
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
    salt: ethers.constants.HashZero,
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
    salt: ethers.constants.HashZero,
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
    (await ChugSplashRegistry.adapters(OZ_UUPS_OWNABLE_PROXY_TYPE_HASH)) !==
    OZUUPSOwnableAdapter.address
  ) {
    await (
      await ChugSplashRegistry.addContractKind(
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
    (await ChugSplashRegistry.adapters(
      OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH
    )) !== OZUUPSAccessControlAdapter.address
  ) {
    await (
      await ChugSplashRegistry.addContractKind(
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
    salt: ethers.constants.HashZero,
  })

  logger?.info('[ChugSplash]: DefaultAdapter deployed')

  if (
    (await ChugSplashRegistry.adapters(EXTERNAL_DEFAULT_PROXY_TYPE_HASH)) !==
    DefaultAdapter.address
  ) {
    await (
      await ChugSplashRegistry.addContractKind(
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
    (await ChugSplashRegistry.adapters(ethers.constants.HashZero)) !==
    DefaultAdapter.address
  ) {
    await (
      await ChugSplashRegistry.addContractKind(
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
  provider: ethers.providers.JsonRpcProvider
) => {
  const ChugSplashRegistry = new Contract(
    CHUGSPLASH_REGISTRY_ADDRESS,
    ChugSplashRegistryABI,
    provider
  )

  while (!(await isContractDeployed(ChugSplashRegistry.address, provider))) {
    await sleep(1000)
  }

  while (
    OWNER_MULTISIG_ADDRESS !==
    (await getEIP1967ProxyAdminAddress(provider, CHUGSPLASH_REGISTRY_ADDRESS))
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
