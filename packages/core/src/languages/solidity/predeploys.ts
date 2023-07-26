import * as path from 'path'
import assert from 'assert'

import { ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  getOwnerAddress,
  OWNER_MULTISIG_ADDRESS,
  ManagedServiceArtifact,
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  DEFAULT_PROXY_TYPE_HASH,
  EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
  AuthFactoryABI,
} from '@sphinx/contracts'
import { Logger } from '@eth-optimism/common-ts'

import {
  isContractDeployed,
  getGasPriceOverrides,
  getImpersonatedSigner,
  isLocalNetwork,
  getSphinxRegistryReadOnly,
} from '../../utils'
import {
  OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
  getSphinxManagerV1Address,
  getSphinxRegistryAddress,
  getManagedServiceAddress,
  OZ_TRANSPARENT_ADAPTER_ADDRESS,
  DEFAULT_ADAPTER_ADDRESS,
  OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
  AUTH_FACTORY_ADDRESS,
  AUTH_IMPL_V1_ADDRESS,
} from '../../addresses'
import { isSupportedNetworkOnEtherscan, verifySphinx } from '../../etherscan'
import { SphinxSystemConfig } from './types'
import {
  FUNDER_ROLE,
  RELAYER_ROLE,
  REMOTE_EXECUTOR_ROLE,
} from '../../constants'
import { resolveNetworkName } from '../../messages'
import { assertValidBlockGasLimit } from '../../config/parse'
import { getSphinxConstants } from '../../contract-info'

const fetchSphinxSystemConfig = (configPath: string) => {
  delete require.cache[require.resolve(path.resolve(configPath))]

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const exported: SphinxSystemConfig = require(path.resolve(configPath)).default
  if (
    typeof exported === 'object' &&
    exported.executors.length > 0 &&
    exported.relayers.length > 0 &&
    exported.funders.length > 0
  ) {
    return exported
  } else {
    throw new Error(
      'Config file must export a valid config object with a list of executors and relayers.'
    )
  }
}

export const initializeAndVerifySphinx = async (
  systemConfigPath: string,
  provider: ethers.providers.JsonRpcProvider
) => {
  const config = fetchSphinxSystemConfig(systemConfigPath)

  const logger = new Logger({
    name: 'deploy',
  })

  // Deploy Contracts
  await initializeSphinx(
    provider,
    await provider.getSigner(),
    config.executors,
    config.relayers,
    config.funders,
    logger
  )

  // Verify Sphinx contracts on etherscan
  try {
    // Verify the Sphinx contracts if the current network is supported.
    if (
      isSupportedNetworkOnEtherscan(
        await resolveNetworkName(
          provider,
          await isLocalNetwork(provider),
          'hardhat'
        )
      )
    ) {
      const apiKey = process.env.ETHERSCAN_API_KEY
      if (apiKey) {
        logger.info('[Sphinx]: attempting to verify the sphinx contracts...')
        await verifySphinx(provider, provider.network.name, apiKey)
        logger.info(
          '[Sphinx]: finished attempting to verify the sphinx contracts'
        )
      } else {
        logger.info(
          `[Sphinx]: skipped verifying sphinx contracts. reason: no api key found`
        )
      }
    } else {
      logger.info(
        `[Sphinx]: skipped verifying sphinx contracts. reason: etherscan config not detected for: ${provider.network.name}`
      )
    }
  } catch (e) {
    logger.error(
      `[Sphinx]: error: failed to verify sphinx contracts on ${provider.network.name}`,
      e
    )
  }
}

/**
 * @notice Ensures that the Sphinx contracts are deployed and initialized. This will only send
 * transactions from the signer if the provider is a local, non-forked network. The signer will
 * never be used to send transactions on a live network.
 */
export const ensureSphinxInitialized = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  executors: string[] = [],
  relayers: string[] = [],
  funders: string[] = [],
  logger?: Logger
) => {
  if (await isContractDeployed(getSphinxRegistryAddress(), provider)) {
    return
  } else if (await isLocalNetwork(provider)) {
    await initializeSphinx(
      provider,
      signer,
      executors,
      relayers,
      funders,
      logger
    )
  } else {
    const { name } = await provider.getNetwork()
    throw new Error(
      `Sphinx is not supported on ${name} yet. Reach out on Discord if you'd like us to support it!`
    )
  }
}

export const initializeSphinx = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  executors: string[],
  relayers: string[],
  funders: string[],
  logger?: Logger
): Promise<void> => {
  const { gasLimit: blockGasLimit } = await provider.getBlock('latest')
  assertValidBlockGasLimit(blockGasLimit)

  for (const {
    artifact,
    constructorArgs,
    expectedAddress,
  } of await getSphinxConstants(provider)) {
    const { abi, bytecode, contractName } = artifact

    logger?.info(`[Sphinx]: deploying ${contractName}...`)

    const contract = await doDeterministicDeploy(provider, {
      signer,
      contract: {
        abi,
        bytecode,
      },
      args: constructorArgs,
      salt: ethers.constants.HashZero,
    })

    assert(
      contract.address === expectedAddress,
      `address mismatch for ${contractName}`
    )

    logger?.info(`[Sphinx]: deployed ${contractName}, ${contract.address}`)
  }

  logger?.info(`[Sphinx]: finished deploying Sphinx contracts`)

  // We need to do some additional setup: adding the manager version, adding executor roles, etc
  // This requires a signer with the owner role which we have to handle differently depending on the situation.
  // 1. If the owner is the multisig and we're deploying on a test node then we can use an impersonated signer.
  // 2. If the owner is the multisig and we're deploying on a live network then we have to use the gnosis safe ethers adapter (which we have not implemented yet).
  // 3. We also allow the user to specify a different owner via process.env.SPHINX_INTERNAL__OWNER_PRIVATE_KEY. This is useful for testing on live networks without using the multisig.
  //    In this case, we need to create a signer using the SPHINX_INTERNAL__OWNER_PRIVATE_KEY and use that.
  let owner: ethers.Signer

  // If deploying on a live network and the target owner is the multisig, then throw an error because
  // we have not setup the safe ethers adapter yet.
  const localNetwork = await isLocalNetwork(provider)
  if (!localNetwork && getOwnerAddress() === OWNER_MULTISIG_ADDRESS) {
    if (!process.env.SPHINX_INTERNAL__OWNER_PRIVATE_KEY) {
      throw new Error('Must define SPHINX_INTERNAL__OWNER_PRIVATE_KEY')
    }

    owner = new ethers.Wallet(
      process.env.SPHINX_INTERNAL__OWNER_PRIVATE_KEY!,
      provider
    )
  } else {
    // if target owner is multisig, then use an impersonated multisig signer
    if (getOwnerAddress() === OWNER_MULTISIG_ADDRESS) {
      owner = await getImpersonatedSigner(OWNER_MULTISIG_ADDRESS, provider)
    } else {
      // if target owner is not multisig, then use the owner signer
      // SPHINX_INTERNAL__OWNER_PRIVATE_KEY will always be defined if the OWNER_ADDRESS is not the OWNER_MULTISIG_ADDRESS
      owner = new ethers.Wallet(
        process.env.SPHINX_INTERNAL__OWNER_PRIVATE_KEY!,
        provider
      )
    }

    if (localNetwork) {
      // Fund the signer
      await (
        await signer.sendTransaction({
          to: await owner.getAddress(),
          value: ethers.utils.parseEther('0.1'),
        })
      ).wait()
    }
  }

  const { chainId } = await provider.getNetwork()
  const ManagedService = new ethers.Contract(
    getManagedServiceAddress(chainId),
    ManagedServiceArtifact.abi,
    owner
  )

  logger?.info('[Sphinx]: assigning executor roles...')
  for (const executor of executors) {
    if (
      (await ManagedService.hasRole(REMOTE_EXECUTOR_ROLE, executor)) === false
    ) {
      await (
        await ManagedService.connect(owner).grantRole(
          REMOTE_EXECUTOR_ROLE,
          executor,
          await getGasPriceOverrides(provider)
        )
      ).wait()
    }
  }
  logger?.info('[Sphinx]: finished assigning executor roles')

  logger?.info('[Sphinx]: assigning caller roles...')
  for (const relayer of relayers) {
    if ((await ManagedService.hasRole(RELAYER_ROLE, relayer)) === false) {
      await (
        await ManagedService.connect(owner).grantRole(
          RELAYER_ROLE,
          relayer,
          await getGasPriceOverrides(provider)
        )
      ).wait()
    }
  }
  logger?.info('[Sphinx]: finished assigning caller roles')

  logger?.info('[Sphinx]: assigning funder role...')
  for (const funder of funders) {
    if ((await ManagedService.hasRole(FUNDER_ROLE, funder)) === false) {
      await (
        await ManagedService.connect(owner).grantRole(
          FUNDER_ROLE,
          funder,
          await getGasPriceOverrides(provider)
        )
      ).wait()
    }
  }
  logger?.info('[Sphinx]: finished assigning role')

  logger?.info('[Sphinx]: adding the initial SphinxManager version...')

  const SphinxRegistry = getSphinxRegistryReadOnly(provider)
  const sphinxManagerV1Address = getSphinxManagerV1Address(chainId)
  if (
    (await SphinxRegistry.managerImplementations(sphinxManagerV1Address)) ===
    false
  ) {
    try {
      await (
        await SphinxRegistry.connect(owner).addVersion(
          sphinxManagerV1Address,
          await getGasPriceOverrides(provider)
        )
      ).wait()
    } catch (e) {
      if (!e.message.includes('version already set')) {
        throw e
      }
    }
  }

  logger?.info('[Sphinx]: added the initial SphinxManager version')

  logger?.info('[Sphinx]: setting the default SphinxManager version')

  if (
    (await SphinxRegistry.currentManagerImplementation()) !==
    sphinxManagerV1Address
  ) {
    await (
      await SphinxRegistry.connect(owner).setCurrentManagerImplementation(
        sphinxManagerV1Address,
        await getGasPriceOverrides(provider)
      )
    ).wait()
  }

  logger?.info('[Sphinx]: set the default SphinxManager version')

  logger?.info('[Sphinx]: setting the default SphinxAuth version')

  const AuthFactory = new ethers.Contract(
    AUTH_FACTORY_ADDRESS,
    AuthFactoryABI,
    owner
  )

  if (!(await AuthFactory.authImplementations(AUTH_IMPL_V1_ADDRESS))) {
    await (
      await AuthFactory.addVersion(
        AUTH_IMPL_V1_ADDRESS,
        await getGasPriceOverrides(provider)
      )
    ).wait()
  }

  if (
    (await AuthFactory.currentAuthImplementation()) !== AUTH_IMPL_V1_ADDRESS
  ) {
    await (
      await AuthFactory.setCurrentAuthImplementation(
        AUTH_IMPL_V1_ADDRESS,
        await getGasPriceOverrides(provider)
      )
    ).wait()
  }

  logger?.info('[Sphinx]: set the default SphinxAuth version')

  logger?.info(
    '[Sphinx]: adding the default proxy type to the SphinxRegistry...'
  )

  // Set the oz transparent proxy type on the registry.
  const transparentAdapterAddress = OZ_TRANSPARENT_ADAPTER_ADDRESS
  if (
    (await SphinxRegistry.adapters(OZ_TRANSPARENT_PROXY_TYPE_HASH)) !==
    transparentAdapterAddress
  ) {
    await (
      await SphinxRegistry.connect(owner).addContractKind(
        OZ_TRANSPARENT_PROXY_TYPE_HASH,
        transparentAdapterAddress,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[Sphinx]: added the transparent proxy type to the SphinxRegistry'
    )
  } else {
    logger?.info(
      '[Sphinx]: the transparent proxy type was already added to the SphinxRegistry'
    )
  }

  logger?.info('[Sphinx]: adding the uups proxy type to the SphinxRegistry...')

  // Set the oz uups proxy type on the registry.
  const uupsOwnableAdapterAddress = OZ_UUPS_OWNABLE_ADAPTER_ADDRESS
  if (
    (await SphinxRegistry.adapters(OZ_UUPS_OWNABLE_PROXY_TYPE_HASH)) !==
    uupsOwnableAdapterAddress
  ) {
    await (
      await SphinxRegistry.connect(owner).addContractKind(
        OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
        uupsOwnableAdapterAddress,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[Sphinx]: added the uups ownable proxy type to the SphinxRegistry'
    )
  } else {
    logger?.info(
      '[Sphinx]: the uups ownable proxy type was already added to the SphinxRegistry'
    )
  }

  // Set the oz uups proxy type on the registry.
  const ozUUPSAccessControlAdapterAddress =
    OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS
  if (
    (await SphinxRegistry.adapters(OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH)) !==
    ozUUPSAccessControlAdapterAddress
  ) {
    await (
      await SphinxRegistry.connect(owner).addContractKind(
        OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
        ozUUPSAccessControlAdapterAddress,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[Sphinx]: added the uups access control proxy type to the SphinxRegistry'
    )
  } else {
    logger?.info(
      '[Sphinx]: the uups access control proxy type was already added to the SphinxRegistry'
    )
  }

  const defaultAdapterAddress = DEFAULT_ADAPTER_ADDRESS
  if (
    (await SphinxRegistry.adapters(EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH)) !==
    defaultAdapterAddress
  ) {
    await (
      await SphinxRegistry.connect(owner).addContractKind(
        EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
        defaultAdapterAddress,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[Sphinx]: added the external default proxy type to the SphinxRegistry'
    )
  } else {
    logger?.info(
      '[Sphinx]: the external default proxy type was already added to the SphinxRegistry'
    )
  }

  if (
    (await SphinxRegistry.adapters(DEFAULT_PROXY_TYPE_HASH)) !==
    defaultAdapterAddress
  ) {
    await (
      await SphinxRegistry.connect(owner).addContractKind(
        ethers.constants.HashZero,
        defaultAdapterAddress,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    logger?.info(
      '[Sphinx]: added the internal default proxy type to the SphinxRegistry'
    )
  } else {
    logger?.info(
      '[Sphinx]: the internal default proxy type was already added to the SphinxRegistry'
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
