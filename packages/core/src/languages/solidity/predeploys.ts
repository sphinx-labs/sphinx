import * as path from 'path'
import assert from 'assert'

import { ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  getOwnerAddress,
  ChugSplashBootloaderTwoABI,
  ChugSplashBootloaderTwoArtifact,
  ChugSplashBootloaderOneABI,
  ChugSplashBootloaderOneArtifact,
  OWNER_MULTISIG_ADDRESS,
  ManagedServiceArtifact,
  ChugSplashManagerProxyABI,
  ChugSplashManagerProxyArtifact,
  ProxyABI,
  ProxyArtifact,
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  EXTERNAL_DEFAULT_PROXY_TYPE_HASH,
} from '@chugsplash/contracts'
import { Logger } from '@eth-optimism/common-ts'

import {
  isContractDeployed,
  getGasPriceOverrides,
  getImpersonatedSigner,
  getChugSplashRegistryReadOnly,
  isLocalNetwork,
} from '../../utils'
import {
  ADAPTER_DEPLOYER_ADDRESS,
  DEFAULT_CREATE3_ADDRESS,
  DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
  DEFAULT_UPDATER_ADDRESS,
  OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
  FORWARDER_ADDRESS,
  getBootloaderAddress,
  getBootloaderTwoConstructorArgs,
  getChugSplashConstructorArgs,
  getChugSplashManagerV1Address,
  getChugSplashRegistryAddress,
  getManagedServiceAddress,
  OZ_TRANSPARENT_ADAPTER_ADDRESS,
  DEFAULT_ADAPTER_ADDRESS,
  OZ_UUPS_UPDATER_ADDRESS,
  OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
} from '../../addresses'
import {
  isSupportedNetworkOnEtherscan,
  verifyChugSplash,
} from '../../etherscan'
import { ChugSplashSystemConfig } from './types'
import {
  CALLER_ROLE,
  MANAGED_PROPOSER_ROLE,
  REMOTE_EXECUTOR_ROLE,
} from '../../constants'
import { resolveNetworkName } from '../../messages'
import { assertValidBlockGasLimit } from '../../config/parse'

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
    if (
      isSupportedNetworkOnEtherscan(
        await resolveNetworkName(provider, 'hardhat')
      )
    ) {
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
  if (await isContractDeployed(getChugSplashRegistryAddress(), provider)) {
    return
  } else if (await isLocalNetwork(provider)) {
    await initializeChugSplash(provider, signer, executors, [], [], logger)
  } else {
    throw new Error(
      `ChugSplash is not available on this network. If you are working on a local network, please report this error to the developers. If you are working on a live network, then it may not be officially supported yet. Feel free to drop a messaging in the Discord and we'll see what we can do!`
    )
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
  const { gasLimit: blockGasLimit } = await provider.getBlock('latest')
  assertValidBlockGasLimit(blockGasLimit)

  const chugsplashConstructorArgs = getChugSplashConstructorArgs()

  logger?.info('[ChugSplash]: deploying adapters...')

  const ChugSplashBootloaderOne = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ChugSplashBootloaderOneABI,
      bytecode: ChugSplashBootloaderOneArtifact.bytecode,
    },
    salt: ethers.constants.HashZero,
  })

  assert(
    ADAPTER_DEPLOYER_ADDRESS === ChugSplashBootloaderOne.address,
    'Adapter deployer has incorrect address'
  )

  logger?.info('[ChugSplash]: finished deploying adapters')

  logger?.info('[ChugSplash]: deploying with bootloader')

  const deployerAddress = await deployer.getAddress()

  console.log('deploying bootloader two')
  const ChugSplashBootloaderTwo = await doDeterministicDeploy(provider, {
    signer: deployer,
    contract: {
      abi: ChugSplashBootloaderTwoABI,
      bytecode: ChugSplashBootloaderTwoArtifact.bytecode,
    },
    args: getBootloaderTwoConstructorArgs(deployerAddress),
    salt: ethers.constants.HashZero,
  })

  assert(
    getBootloaderAddress(deployerAddress) === ChugSplashBootloaderTwo.address,
    'ChugSplash Bootloader has incorrect address'
  )

  logger?.info('[ChugSplash]: finished deploying with bootloader')

  console.log(await ChugSplashBootloaderTwo.owner())
  console.log(await deployer.getAddress())

  console.log('completing setup')
  // Complete setup
  await (
    await ChugSplashBootloaderTwo.connect(deployer).completeSetup(
      OZ_TRANSPARENT_ADAPTER_ADDRESS,
      OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
      OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
      DEFAULT_ADAPTER_ADDRESS,
      await getGasPriceOverrides(provider)
    )
  ).wait()
  logger?.info('[ChugSplash]: completed registry setup')

  assert(
    (await ChugSplashBootloaderTwo.registry()) ===
      getChugSplashRegistryAddress(),
    'Registry was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderTwo.managerImplementationAddress()) ===
      getChugSplashManagerV1Address(),
    'Manager implementation was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderTwo.defaultCreate3Addr()) ===
      DEFAULT_CREATE3_ADDRESS,
    'DefaultCreate3 was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderTwo.defaultGasPriceCalculatorAddr()) ===
      DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
    'DefaultGasPriceCalculator try was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderTwo.managedServiceAddr()) ===
      getManagedServiceAddress(),
    'ManagedService was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderTwo.forwarderAddr()) === FORWARDER_ADDRESS,
    'Forwarder was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderOne.defaultUpdaterAddr()) ===
      DEFAULT_UPDATER_ADDRESS,
    'DefaultUpdater was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderOne.ozUUPSUpdaterAddr()) ===
      OZ_UUPS_UPDATER_ADDRESS,
    'OZUUPSUpdater was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderOne.ozTransparentAdapterAddr()) ===
      OZ_TRANSPARENT_ADAPTER_ADDRESS,
    'OZTransparentAdapter was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderOne.ozUUPSOwnableAdapterAddr()) ===
      OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
    'OZUUPSOwnableAdapter was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderOne.ozUUPSAccessControlAdapterAddr()) ===
      OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
    'DefaultUpdater was deployed to incorrect address'
  )

  assert(
    (await ChugSplashBootloaderOne.defaultAdapterAddr()) ===
      DEFAULT_ADAPTER_ADDRESS,
    'DefaultAdapter was deployed to incorrect address'
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
  const localNetwork = await isLocalNetwork(provider)
  if (!localNetwork && getOwnerAddress() === OWNER_MULTISIG_ADDRESS) {
    if (!process.env.CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY) {
      throw new Error('Must define CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY')
    }

    signer = new ethers.Wallet(
      process.env.CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY!,
      provider
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

    if (localNetwork) {
      // Fund the signer
      await (
        await deployer.sendTransaction({
          to: await signer.getAddress(),
          value: ethers.utils.parseEther('0.1'),
        })
      ).wait()
    }
  }

  const ManagedService = new ethers.Contract(
    getManagedServiceAddress(),
    ManagedServiceArtifact.abi,
    signer
  )

  logger?.info('[ChugSplash]: assigning executor roles...')
  for (const executor of executors) {
    if (
      (await ManagedService.hasRole(REMOTE_EXECUTOR_ROLE, executor)) === false
    ) {
      await (
        await ManagedService.connect(signer).grantRole(
          REMOTE_EXECUTOR_ROLE,
          executor,
          await getGasPriceOverrides(provider)
        )
      ).wait()
    }
  }
  logger?.info('[ChugSplash]: finished assigning executor roles')

  logger?.info('[ChugSplash]: assigning proposer roles...')
  for (const proposer of proposers) {
    if (
      (await ManagedService.hasRole(MANAGED_PROPOSER_ROLE, proposer)) === false
    ) {
      await (
        await ManagedService.connect(signer).grantRole(
          MANAGED_PROPOSER_ROLE,
          proposer,
          await getGasPriceOverrides(provider)
        )
      ).wait()
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
