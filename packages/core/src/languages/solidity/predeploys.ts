import { assert } from 'console'

import { ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ManagedServiceArtifact,
  OWNER_MULTISIG_ADDRESS,
  getManagedServiceAddress,
  getOwnerAddress,
  getSphinxConstants,
  getSphinxModuleFactoryAddress,
} from '@sphinx-labs/contracts'
import { Logger } from '@eth-optimism/common-ts'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

import {
  isContractDeployed,
  getGasPriceOverrides,
  isLiveNetwork,
  getImpersonatedSigner,
} from '../../utils'
import { SphinxJsonRpcProvider } from '../../provider'
import {
  FUNDER_ROLE,
  RELAYER_ROLE,
  REMOTE_EXECUTOR_ROLE,
} from '../../constants'

/**
 * @notice Ensures that the Sphinx contracts are deployed and initialized. This will only send
 * transactions from the signer exists on a non-live network (i.e. a local or forked network). The
 * signer will never be used to send transactions on a live network.
 */
export const ensureSafeAndSphinxInitialized = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  signer: ethers.Signer,
  executors: string[] = [],
  relayers: string[] = [],
  funders: string[] = [],
  logger?: Logger
) => {
  if (!(await isLiveNetwork(provider))) {
    await initializeSafeAndSphinx(
      provider,
      signer,
      executors,
      relayers,
      funders,
      logger
    )
  } else if (
    await isContractDeployed(getSphinxModuleFactoryAddress(), provider)
  ) {
    return
  } else {
    throw new Error(`Sphinx is not supported on this network.`)
  }
}

// TODO - Does it make sense to use a forge script for the real deployment instead of this?
//        I think we need this for the plugin anyway (or maybe not?)
export const initializeSafeAndSphinx = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  signer: ethers.Signer,
  executors: string[],
  relayers: string[],
  funders: string[],
  logger?: Logger
): Promise<void> => {
  const block = await provider.getBlock('latest')
  if (!block) {
    throw new Error('Failed to get latest block.')
  }

  for (const {
    artifact,
    constructorArgs,
    expectedAddress,
  } of getSphinxConstants((await provider.getNetwork()).chainId)) {
    const { abi, bytecode, contractName } = artifact

    logger?.info(`[Sphinx]: deploying ${contractName}...`)

    const contract = await doDeterministicDeploy(provider, {
      signer,
      contract: {
        abi,
        bytecode,
      },
      args: constructorArgs,
      salt: ethers.ZeroHash,
    })

    const addr = await contract.getAddress()
    assert(addr === expectedAddress, `address mismatch for ${contractName}`)

    logger?.info(
      `[Sphinx]: deployed ${contractName}, ${await contract.getAddress()}`
    )
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
  const isLiveNetwork_ = await isLiveNetwork(provider)
  if (isLiveNetwork_ && getOwnerAddress() === OWNER_MULTISIG_ADDRESS) {
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

    if (!isLiveNetwork_) {
      // Fund the signer
      await (
        await signer.sendTransaction({
          to: await owner.getAddress(),
          value: ethers.parseEther('1'),
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
        await ManagedService.grantRole(
          REMOTE_EXECUTOR_ROLE,
          executor,
          await getGasPriceOverrides(owner)
        )
      ).wait()
    }
  }
  logger?.info('[Sphinx]: finished assigning executor roles')

  logger?.info('[Sphinx]: assigning caller roles...')
  for (const relayer of relayers) {
    if ((await ManagedService.hasRole(RELAYER_ROLE, relayer)) === false) {
      await (
        await ManagedService.grantRole(
          RELAYER_ROLE,
          relayer,
          await getGasPriceOverrides(owner)
        )
      ).wait()
    }
  }
  logger?.info('[Sphinx]: finished assigning caller roles')

  logger?.info('[Sphinx]: assigning funder role...')
  for (const funder of funders) {
    if ((await ManagedService.hasRole(FUNDER_ROLE, funder)) === false) {
      await (
        await ManagedService.grantRole(
          FUNDER_ROLE,
          funder,
          await getGasPriceOverrides(owner)
        )
      ).wait()
    }
  }
  logger?.info('[Sphinx]: finished assigning role')
}

export const getDeterministicFactoryAddress = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
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
      const txnHash = await provider.send('eth_sendRawTransaction', [
        '0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222',
      ])
      const txn = await provider.getTransaction(txnHash)
      if (!txn) {
        throw new Error(`Failed to deploy CREATE2 factory.`)
      }
      await txn.wait()
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
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
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

  const deploymentTx = await factory.getDeployTransaction(
    ...(options.args || [])
  )
  if (deploymentTx.data === undefined) {
    throw new Error(`Deployment transaction data is undefined`)
  }

  const address = ethers.getCreate2Address(
    deployer,
    options.salt,
    ethers.keccak256(deploymentTx.data)
  )

  // Short circuit if already deployed.
  if (await isContractDeployed(address, provider)) {
    return new ethers.Contract(address, options.contract.abi, options.signer)
  }

  // Create a transaction request with gas price overrides.
  const txnRequest = await getGasPriceOverrides(options.signer, {
    to: deployer,
    data: options.salt + ethers.toBeHex(deploymentTx.data).slice(2),
  })

  // Deploy the contract.
  await (await options.signer.sendTransaction(txnRequest)).wait()

  if ((await isContractDeployed(address, provider)) === false) {
    throw new Error(`failed to deploy contract at ${address}`)
  }

  return new ethers.Contract(address, options.contract.abi, options.signer)
}
