import * as path from 'path'
import assert from 'assert'

import { getChainId } from '@openzeppelin/upgrades-core'
import { ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  DefaultAdapterABI,
  DefaultAdapterArtifact,
  OWNER_MULTISIG_ADDRESS,
  getOwnerAddress,
  ChugSplashRegistryABI,
  DefaultUpdaterABI,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterABI,
  ManagedServiceABI,
  ManagedServiceArtifact,
  OZUUPSOwnableAdapterABI,
  OZUUPSAccessControlAdapterABI,
  OZTransparentAdapterABI,
  ForwarderABI,
  ForwarderArtifact,
  OZUUPSUpdaterArtifact,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  DEFAULT_UPDATER_ADDRESS,
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
  ChugSplashManagerABI,
  ChugSplashManagerArtifact,
  DEFAULT_ADAPTER_ADDRESS,
  DefaultGasPriceCalculatorABI,
  DefaultGasPriceCalculatorArtifact,
  DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
  DefaultCreate3Artifact,
  DefaultCreate3ABI,
  DEFAULT_CREATE3_ADDRESS,
  ChugSplashManagerProxyABI,
  ChugSplashManagerProxyArtifact,
  ProxyABI,
  ProxyArtifact,
} from '@chugsplash/contracts'
import { Logger } from '@eth-optimism/common-ts'

import {
  isContractDeployed,
  getGasPriceOverrides,
  isLiveNetwork,
  getImpersonatedSigner,
  assertValidBlockGasLimit,
} from '../../utils'
import {
  CALLER_ROLE,
  MANAGED_PROPOSER_ROLE,
  REMOTE_EXECUTOR_ROLE,
} from '../../constants'
import {
  getChugSplashConstructorArgs,
  getChugSplashRegistryAddress,
  getManagedServiceAddress,
  getManagerConstructorValues,
  getRegistryConstructorValues,
  getChugSplashManagerV1Address,
} from '../../addresses'
import {
  isSupportedNetworkOnEtherscan,
  verifyChugSplash,
} from '../../etherscan'
import { ChugSplashSystemConfig } from './types'

const fetchChugSplashSystemConfig = (configPath: string) => {
  delete require.cache[require.resolve(path.resolve(configPath))]

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const exported: ChugSplashSystemConfig = require(path.resolve(
    configPath
  )).default
  if (
    typeof exported === 'object' &&
    exported.callers.length > 0 &&
    exported.executors.length > 0 &&
    exported.proposers.length > 0
  ) {
    return exported
  } else {
    throw new Error(
      'Config file must export a valid config object with a list of executors, callers, and proposers.'
    )
  }
}

export const initializeAndVerifyChugSplash = async (
  systemConfigPath: string,
  provider: ethers.providers.JsonRpcProvider
) => {
  const config = fetchChugSplashSystemConfig(systemConfigPath)

  const logger = new Logger({
    name: 'deploy',
  })

  // Deploy Contracts
  await initializeChugSplash(
    provider,
    await provider.getSigner(),
    config.executors,
    config.proposers,
    config.callers,
    logger
  )

  // Verify ChugSplash contracts on etherscan
  try {
    // Verify the ChugSplash contracts if the current network is supported.
    if (isSupportedNetworkOnEtherscan(await getChainId(provider))) {
      const apiKey = process.env.ETHERSCAN_API_KEY
      if (apiKey) {
        logger.info(
          '[ChugSplash]: attempting to verify the chugsplash contracts...'
        )
        await verifyChugSplash(provider, provider.network.name, apiKey)
        logger.info(
          '[ChugSplash]: finished attempting to verify the chugsplash contracts'
        )
      } else {
        logger.info(
          `[ChugSplash]: skipped verifying chugsplash contracts. reason: no api key found`
        )
      }
    } else {
      logger.info(
        `[ChugSplash]: skipped verifying chugsplash contracts. reason: etherscan config not detected for: ${provider.network.name}`
      )
    }
  } catch (e) {
    logger.error(
      `[ChugSplash]: error: failed to verify chugsplash contracts on ${provider.network.name}`,
      e
    )
  }
}

export const ensureChugSplashInitialized = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  executors: string[] = [],
  logger?: Logger
) => {
  if (await isLiveNetwork(provider)) {
    // Throw an error if the ChugSplashRegistry is not deployed on this network
    if (!(await isContractDeployed(getChugSplashRegistryAddress(), provider))) {
      throw new Error(
        `ChugSplash is not available on this network. If you are working on a local network, please report this error to the developers. If you are working on a live network, then it may not be officially supported yet. Feel free to drop a messaging in the Discord and we'll see what we can do!`
      )
    }
  } else {
    await initializeChugSplash(provider, signer, executors, [], [], logger)
  }
}

export const initializeChugSplash = async (
  provider: ethers.providers.JsonRpcProvider,
  deployer: ethers.Signer,
  executors: string[],
  proposers: string[],
  callers: string[],
  logger?: Logger
): Promise<void> => {
  await assertValidBlockGasLimit(provider)

  const chugsplashConstructorArgs = getChugSplashConstructorArgs()

  logger?.info('[ChugSplash]: deploying DefaultCreate3...')

  const DefaultCreate3 = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: DefaultCreate3ABI,
      bytecode: DefaultCreate3Artifact.bytecode,
    },
    args: [],
    salt: ethers.constants.HashZero,
  })

  assert(
    DEFAULT_CREATE3_ADDRESS === DefaultCreate3.address,
    'DefaultGasPriceCalculator has incorrect address'
  )

  logger?.info('[ChugSplash]: deployed DefaultCreate3')

  logger?.info('[ChugSplash]: deploying DefaultGasPriceCalculator...')

  const DefaultGasPriceCalculator = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: DefaultGasPriceCalculatorABI,
      bytecode: DefaultGasPriceCalculatorArtifact.bytecode,
    },
    args: [],
    salt: ethers.constants.HashZero,
  })

  assert(
    DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS === DefaultGasPriceCalculator.address,
    'DefaultGasPriceCalculator has incorrect address'
  )

  logger?.info('[ChugSplash]: deployed DefaultGasPriceCalculator')

  logger?.info('[ChugSplash]: deploying ManagedService...')

  const ManagedService = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ManagedServiceABI,
      bytecode: ManagedServiceArtifact.bytecode,
    },
    args: [getOwnerAddress()],
    salt: ethers.constants.HashZero,
  })

  assert(
    getManagedServiceAddress() === ManagedService.address,
    'ManagedService has incorrect address'
  )

  logger?.info('[ChugSplash]: deployed ManagedService')

  logger?.info('[ChugSplash]: deploying ChugSplashRegistry...')

  const ChugSplashRegistry = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ChugSplashRegistryABI,
      bytecode: ChugSplashRegistryArtifact.bytecode,
    },
    args: getRegistryConstructorValues(),
    salt: ethers.constants.HashZero,
  })

  assert(
    getChugSplashRegistryAddress() === ChugSplashRegistry.address,
    'ChugSplashRegistry has incorrect address'
  )

  logger?.info('[ChugSplash]: deployed ChugSplashRegistry')

  logger?.info('[ChugSplash]: deploying Forwarder...')

  await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ForwarderABI,
      bytecode: ForwarderArtifact.bytecode,
    },
    args: [],
    salt: ethers.constants.HashZero,
  })

  logger?.info('[ChugSplash]: deployed Forwarder')

  logger?.info('[ChugSplash]: deploying ChugSplashManager initial version...')

  const ChugSplashManager = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ChugSplashManagerABI,
      bytecode: ChugSplashManagerArtifact.bytecode,
    },
    args: getManagerConstructorValues(),
    salt: ethers.constants.HashZero,
  })

  assert(
    getChugSplashManagerV1Address() === ChugSplashManager.address,
    'ChugSplashManager V1 has incorrect address'
  )

  logger?.info('[ChugSplash]: deployed ChugSplashManager initial version')

  logger?.info('[ChugSplash]: deploying OZTransparentAdapter...')

  // Deploy the OpenZeppelin Transparent Adapter.
  const OZTransparentAdapter = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: OZTransparentAdapterABI,
      bytecode: OZTransparentAdapterArtifact.bytecode,
    },
    args: chugsplashConstructorArgs[OZTransparentAdapterArtifact.sourceName],
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

  // Deploy the OZUUPSAdapter.
  const OZUUPSOwnableAdapter = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: OZUUPSOwnableAdapterABI,
      bytecode: OZUUPSOwnableAdapterArtifact.bytecode,
    },
    args: chugsplashConstructorArgs[OZUUPSOwnableAdapterArtifact.sourceName],
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
    args: chugsplashConstructorArgs[
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

  logger?.info('[ChugSplash]: deploying DefaultAdapter...')

  // Deploy the DefaultAdapter.
  const DefaultAdapter = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: DefaultAdapterABI,
      bytecode: DefaultAdapterArtifact.bytecode,
    },
    args: chugsplashConstructorArgs[DefaultAdapterArtifact.sourceName],
    salt: ethers.constants.HashZero,
  })

  assert(
    DefaultAdapter.address === DEFAULT_ADAPTER_ADDRESS,
    'DefaultAdapter address mismatch'
  )

  logger?.info('[ChugSplash]: DefaultAdapter deployed')

  logger?.info('[ChugSplash]: deploying reference ChugSplashManagerProxy')

  await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ChugSplashManagerProxyABI,
      bytecode: ChugSplashManagerProxyArtifact.bytecode,
    },
    args: chugsplashConstructorArgs[ChugSplashManagerProxyArtifact.sourceName],
    salt: ethers.constants.HashZero,
  })

  logger?.info('[ChugSplash]: deployed reference ChugSplashManagerProxy')

  logger?.info('[ChugSplash]: deploying reference Default Proxy')

  await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ProxyABI,
      bytecode: ProxyArtifact.bytecode,
    },
    args: chugsplashConstructorArgs[ProxyArtifact.sourceName],
    salt: ethers.constants.HashZero,
  })

  logger?.info('[ChugSplash]: deployed reference Default Proxy')

  // Make sure the addresses match, just in case.
  assert(
    OZUUPSUpdater.address === OZ_UUPS_UPDATER_ADDRESS,
    'OZUUPSUpdater address mismatch'
  )

  // We need to do some additional setup: adding the manager version, adding executor roles, etc
  // This requires a signer with the owner role which we have to handle differently depending on the situation.
  // 1. If the owner is the multisig and we're deploying on a test node then we can use an impersonated signer.
  // 2. If the owner is the multisig and we're deploying on a live network then we have to use the gnosis safe ethers adapter (which we have not implemented yet).
  // 3. We also allow the user to specify a different owner via process.env.CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY. This is useful for testing on live networks without using the multisig.
  //    In this case, we need to create a signer using the CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY and use that.
  let signer: ethers.Signer

  // If deploying on a live network and the target owner is the multisig, then throw an error because
  // we have not setup the safe ethers adapter yet.
  if (
    (await isLiveNetwork(provider)) &&
    getOwnerAddress() === OWNER_MULTISIG_ADDRESS
  ) {
    throw new Error(
      'Cannot run multisig transactions on a live network, please setup the safe ethers adapter first https://www.npmjs.com/package/@safe-global/safe-ethers-adapters'
    )
  } else {
    // if target owner is multisig, then use an impersonated multisig signer
    if (getOwnerAddress() === OWNER_MULTISIG_ADDRESS) {
      signer = await getImpersonatedSigner(OWNER_MULTISIG_ADDRESS, provider)
    } else {
      // if target owner is not multisig, then use the owner signer
      // CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY will always be defined if the OWNER_ADDRESS is not the OWNER_MULTISIG_ADDRESS
      signer = new ethers.Wallet(
        process.env.CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY!,
        provider
      )
    }

    if (!(await isLiveNetwork(provider))) {
      // Fund the signer
      await (
        await deployer.sendTransaction({
          to: await signer.getAddress(),
          value: ethers.utils.parseEther('0.1'),
        })
      ).wait()
    }
  }

  logger?.info('[ChugSplash]: adding the initial ChugSplashManager version...')

  if (
    (await ChugSplashRegistry.managerImplementations(
      ChugSplashManager.address
    )) === false
  ) {
    try {
      await (
        await ChugSplashRegistry.connect(signer).addVersion(
          ChugSplashManager.address,
          await getGasPriceOverrides(provider)
        )
      ).wait()
    } catch (e) {
      if (!e.message.includes('version already set')) {
        throw e
      }
    }
  }

  logger?.info('[ChugSplash]: added the initial ChugSplashManager version')

  logger?.info('[ChugSplash]: assigning executor roles...')
  for (const executor of executors) {
    if (
      (await ManagedService.hasRole(REMOTE_EXECUTOR_ROLE, executor)) === false
    ) {
      await ManagedService.connect(signer).grantRole(
        REMOTE_EXECUTOR_ROLE,
        executor
      )
    }
  }
  logger?.info('[ChugSplash]: finished assigning executor roles')

  logger?.info('[ChugSplash]: assigning proposer roles...')
  for (const proposer of proposers) {
    if (
      (await ManagedService.hasRole(MANAGED_PROPOSER_ROLE, proposer)) === false
    ) {
      await ManagedService.connect(signer).grantRole(
        MANAGED_PROPOSER_ROLE,
        proposer
      )
    }
  }
  logger?.info('[ChugSplash]: finished assigning proposer roles')

  logger?.info('[ChugSplash]: assigning caller roles...')
  for (const caller of callers) {
    if ((await ManagedService.hasRole(CALLER_ROLE, caller)) === false) {
      await (
        await ManagedService.connect(signer).grantRole(
          CALLER_ROLE,
          caller,
          await getGasPriceOverrides(provider)
        )
      ).wait()
    }
  }
  logger?.info('[ChugSplash]: finished assigning caller roles')

  logger?.info(
    '[ChugSplash]: adding the default proxy type to the ChugSplashRegistry...'
  )

  // Set the oz transparent proxy type on the registry.
  if (
    (await ChugSplashRegistry.adapters(OZ_TRANSPARENT_PROXY_TYPE_HASH)) !==
    OZTransparentAdapter.address
  ) {
    await (
      await ChugSplashRegistry.connect(signer).addContractKind(
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

  logger?.info(
    '[ChugSplash]: adding the uups proxy type to the ChugSplashRegistry...'
  )

  // Set the oz uups proxy type on the registry.
  if (
    (await ChugSplashRegistry.adapters(OZ_UUPS_OWNABLE_PROXY_TYPE_HASH)) !==
    OZUUPSOwnableAdapter.address
  ) {
    await (
      await ChugSplashRegistry.connect(signer).addContractKind(
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
      await ChugSplashRegistry.connect(signer).addContractKind(
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

  if (
    (await ChugSplashRegistry.adapters(EXTERNAL_DEFAULT_PROXY_TYPE_HASH)) !==
    DefaultAdapter.address
  ) {
    await (
      await ChugSplashRegistry.connect(signer).addContractKind(
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

  if (
    (await ChugSplashRegistry.adapters(ethers.constants.HashZero)) !==
    DefaultAdapter.address
  ) {
    await (
      await ChugSplashRegistry.connect(signer).addContractKind(
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
