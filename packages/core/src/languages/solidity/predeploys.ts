import { assert } from 'console'

import { Contract, ethers } from 'ethers'
import {
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  getSphinxConstants,
} from '@sphinx-labs/contracts'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import ora from 'ora'

import {
  isContractDeployed,
  getGasPriceOverrides,
  fundAccountMaxBalance,
} from '../../utils'
import { SphinxJsonRpcProvider } from '../../provider'
import { ExecutionMode } from '../../constants'

export const ensureSphinxAndGnosisSafeDeployed = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  wallet: ethers.Wallet,
  executionMode: ExecutionMode,
  includeManagedServiceRoles: boolean,
  relayers: string[] = [],
  spinner?: ora.Ora
) => {
  if (
    executionMode === ExecutionMode.LocalNetworkCLI ||
    executionMode === ExecutionMode.Platform
  ) {
    // Fund the wallet to ensure that it has enough funds to deploy the contracts.
    await fundAccountMaxBalance(wallet.address, provider)
  }

  await deploySphinxSystem(
    provider,
    wallet,
    relayers,
    executionMode,
    includeManagedServiceRoles,
    spinner
  )
}

export const cancelPreviousDripVersions = async (
  Drippie: Contract,
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  wallet: ethers.Signer,
  executionMode: ExecutionMode,
  dripName: string,
  currentDripVersion: number,
  spinner?: ora.Ora
) => {
  if (currentDripVersion === 0) {
    return
  } else {
    for (let version = 0; version < currentDripVersion; version++) {
      const previousDripName =
        version === 0 ? dripName : `${dripName}_${version}`

      // Cancel drip if not archived
      const [status] = await Drippie.drips(previousDripName)
      if (status !== BigInt(3) && status !== BigInt(0)) {
        spinner?.start(`Archiving outdated drip: ${previousDripName}...`)
        if (status !== BigInt(1)) {
          await (
            await Drippie.status(
              previousDripName,
              1,
              await getGasPriceOverrides(provider, wallet, executionMode)
            )
          ).wait()
        }

        await (
          await Drippie.status(
            previousDripName,
            3,
            await getGasPriceOverrides(provider, wallet, executionMode)
          )
        ).wait()

        spinner?.succeed(
          `Finished archiving outdated drip: ${previousDripName}`
        )
      }
    }
  }
}

export const checkSystemDeployed = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
): Promise<boolean> => {
  const contracts = getSphinxConstants()

  // Create an array of promises for each contract's code
  const codePromises = contracts.map(({ expectedAddress }) =>
    provider.getCode(expectedAddress)
  )

  // Resolve all promises in parallel
  const codes = await Promise.all(codePromises)

  // Check if any code is '0x', indicating the contract is not deployed
  return codes.every((code) => code !== '0x')
}

export const deploySphinxSystem = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider,
  signer: ethers.Signer,
  relayers: string[],
  executionMode: ExecutionMode,
  includeManagedServiceRoles: boolean,
  spinner?: ora.Ora
): Promise<void> => {
  const block = await provider.getBlock('latest')
  if (!block) {
    throw new Error('Failed to get latest block.')
  }

  for (const {
    artifact,
    constructorArgs,
    expectedAddress,
  } of getSphinxConstants()) {
    const { abi, bytecode, contractName } = artifact

    spinner?.start(`Deploying ${contractName}...`)

    const contract = await doDeterministicDeploy(provider, executionMode, {
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

    spinner?.succeed(`Deployed ${contractName}, ${await contract.getAddress()}`)
  }

  spinner?.succeed(`Finished deploying Sphinx contracts`)
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
  executionMode: ExecutionMode,
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
  const txnRequest = await getGasPriceOverrides(
    provider,
    options.signer,
    executionMode,
    {
      to: deployer,
      data: options.salt + ethers.toBeHex(deploymentTx.data).slice(2),
    }
  )

  // Deploy the contract.
  await (await options.signer.sendTransaction(txnRequest)).wait()

  if ((await isContractDeployed(address, provider)) === false) {
    throw new Error(`failed to deploy contract at ${address}`)
  }

  return new ethers.Contract(address, options.contract.abi, options.signer)
}
