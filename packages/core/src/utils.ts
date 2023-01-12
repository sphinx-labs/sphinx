import * as path from 'path'
import * as fs from 'fs'

import {
  utils,
  constants,
  Signer,
  Wallet,
  Contract,
  providers,
  ethers,
  PayableOverrides,
  BigNumber,
} from 'ethers'
import {
  ProxyArtifact,
  ChugSplashRegistryABI,
  ChugSplashManagerABI,
  ChugSplashManagerProxyArtifact,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  ProxyABI,
} from '@chugsplash/contracts'
import { TransactionRequest } from '@ethersproject/abstract-provider'

import {
  CanonicalChugSplashConfig,
  parseChugSplashConfig,
  ParsedChugSplashConfig,
} from './config'
import { ChugSplashActionBundle, ChugSplashActionType } from './actions'
import { FoundryContractArtifact } from './types'

export const computeBundleId = (
  bundleRoot: string,
  bundleSize: number,
  configUri: string
): string => {
  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['bytes32', 'uint256', 'string'],
      [bundleRoot, bundleSize, configUri]
    )
  )
}

export const writeSnapshotId = async (
  provider: ethers.providers.JsonRpcProvider,
  networkName: string,
  deploymentFolderPath: string
) => {
  const snapshotId = await provider.send('evm_snapshot', [])
  const networkPath = path.join(deploymentFolderPath, networkName)
  if (!fs.existsSync(networkPath)) {
    fs.mkdirSync(networkPath, { recursive: true })
  }
  const snapshotIdPath = path.join(networkPath, '.snapshotId')
  fs.writeFileSync(snapshotIdPath, snapshotId)
}

export const createDeploymentFolderForNetwork = (
  networkName: string,
  deploymentFolderPath: string
) => {
  const networkPath = path.join(deploymentFolderPath, networkName)
  if (!fs.existsSync(networkPath)) {
    fs.mkdirSync(networkPath, { recursive: true })
  }
}

export const writeDeploymentArtifact = (
  networkName: string,
  deploymentFolderPath: string,
  artifact: any,
  referenceName: string
) => {
  const artifactPath = path.join(
    deploymentFolderPath,
    networkName,
    `${referenceName}.json`
  )
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, '\t'))
}

/**
 * Returns the address of a default proxy used by ChugSplash, which is calculated as a function of
 * the projectName and the corresponding contract's reference name. Note that a default proxy will
 * NOT be used if the user defines their own proxy address in the ChugSplash config via the `proxy`
 * attribute.
 *
 * @param projectName Name of the ChugSplash project.
 * @param referenceName Reference name of the contract that corresponds to the proxy.
 * @returns Address of the default EIP-1967 proxy used by ChugSplash.
 */
export const getDefaultProxyAddress = (
  projectName: string,
  referenceName: string
): string => {
  // const chugSplashManagerAddress = getChugSplashManagerAddress(projectName)
  const chugSplashManagerAddress = getChugSplashManagerProxyAddress(projectName)

  return utils.getCreate2Address(
    chugSplashManagerAddress,
    utils.keccak256(utils.toUtf8Bytes(referenceName)),
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ProxyArtifact.bytecode,
        utils.defaultAbiCoder.encode(['address'], [chugSplashManagerAddress]),
      ]
    )
  )
}

export const checkIsUpgrade = async (
  provider: ethers.providers.Provider,
  parsedConfig: ParsedChugSplashConfig
): Promise<boolean | string> => {
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    if (await isContractDeployed(contractConfig.proxy, provider)) {
      return referenceName
    }
  }
  return false
}

export const checkValidUpgrade = async (
  provider: ethers.providers.Provider,
  parsedConfig: ParsedChugSplashConfig,
  configPath: string,
  networkName: string
) => {
  const requiresOwnershipTransfer: {
    name: string
    address: string
  }[] = []
  let proxyDetected = false
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    if (await isContractDeployed(contractConfig.proxy, provider)) {
      proxyDetected = true

      const contract = new ethers.Contract(
        contractConfig.proxy,
        ProxyABI,
        provider
      )

      const owner = await getProxyAdmin(contract)
      const managerProxy = await getChugSplashManagerProxyAddress(
        parsedConfig.options.projectName
      )
      if (owner !== managerProxy) {
        requiresOwnershipTransfer.push({
          name: referenceName,
          address: contractConfig.proxy,
        })
      }
    }
  }

  if (!proxyDetected) {
    throw new Error(
      `Error: No deployed contracts were detected for project ${parsedConfig.options.projectName}.

Run the following command to deploy this project for the first time:
npx hardhat chugsplash-deploy --network ${networkName} --config-path ${configPath}
      `
    )
  }

  if (requiresOwnershipTransfer.length > 0) {
    throw new Error(
      `Error: Detected proxy contracts which are not managed by ChugSplash.
      ${requiresOwnershipTransfer.map(
        ({ name, address }) => `${name}, ${address}\n`
      )}

To upgrade these contracts, you must first transfer ownership of them to ChugSplash using the following command:
npx hardhat chugsplash-transfer-ownership --network ${networkName} --config-path ${configPath} --proxy <proxy address>
      `
    )
  }
}

export const getChugSplashManagerProxyAddress = (projectName: string) => {
  return utils.getCreate2Address(
    CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    utils.solidityKeccak256(['string'], [projectName]),
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ChugSplashManagerProxyArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address', 'address'],
          [CHUGSPLASH_REGISTRY_PROXY_ADDRESS, CHUGSPLASH_REGISTRY_PROXY_ADDRESS]
        ),
      ]
    )
  )
}

/**
 * Registers a new ChugSplash project.
 *
 * @param Provider Provider corresponding to the signer that will execute the transaction.
 * @param projectName Name of the created project.
 * @param projectOwner Owner of the ChugSplashManager contract deployed by this call.
 * @returns True if the project was registered for the first time in this call, and false if the
 * project was already registered by the caller.
 */
export const registerChugSplashProject = async (
  provider: providers.JsonRpcProvider,
  signer: Signer,
  signerAddress: string,
  projectName: string,
  projectOwner: string
): Promise<boolean> => {
  const ChugSplashRegistry = getChugSplashRegistry(signer)

  if (
    (await ChugSplashRegistry.projects(projectName)) === constants.AddressZero
  ) {
    await (
      await ChugSplashRegistry.register(
        projectName,
        projectOwner,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    return true
  } else {
    const existingProjectOwner = await getProjectOwnerAddress(
      signer,
      projectName
    )
    if (existingProjectOwner !== signerAddress) {
      throw new Error(`Project already owned by: ${existingProjectOwner}.`)
    } else {
      return false
    }
  }
}

export const getProjectOwnerAddress = async (
  signer: Signer,
  projectName: string
): Promise<string> => {
  const ChugSplashManager = getChugSplashManager(signer, projectName)

  const ownershipTransferredEvents = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.OwnershipTransferred()
  )

  // Get the most recent owner from the list of events
  const projectOwner = ownershipTransferredEvents.at(-1).args.newOwner

  return projectOwner
}

export const getChugSplashRegistry = (signer: Signer): Contract => {
  return new Contract(
    // CHUGSPLASH_REGISTRY_ADDRESS,
    CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    ChugSplashRegistryABI,
    signer
  )
}

export const getChugSplashManager = (signer: Signer, projectName: string) => {
  return new Contract(
    getChugSplashManagerProxyAddress(projectName),
    ChugSplashManagerABI,
    signer
  )
}

export const getChugSplashManagerReadOnly = (
  provider: providers.Provider,
  projectName: string
) => {
  return new Contract(
    getChugSplashManagerProxyAddress(projectName),
    ChugSplashManagerABI,
    provider
  )
}

export const getChugSplashManagerImplementationAddress = async (
  signer: Signer
): Promise<string> => {
  const ChugSplashRegistryProxy = getChugSplashRegistry(signer)
  const managerImplementationAddress =
    await ChugSplashRegistryProxy.managerImplementation()
  return managerImplementationAddress
}

export const chugsplashLog = (text: string, silent: boolean) => {
  if (!silent) {
    console.log(text)
  }
}

export const displayProposerTable = (proposerAddresses: string[]) => {
  const proposers = {}
  proposerAddresses.forEach((address, i) => {
    proposers[i + 1] = {
      Address: address,
    }
  })
  console.table(proposers)
}

export const displayDeploymentTable = (
  parsedConfig: ParsedChugSplashConfig,
  silent: boolean
) => {
  if (!silent) {
    const deployments = {}
    Object.entries(parsedConfig.contracts).forEach(
      ([referenceName, contractConfig], i) =>
        (deployments[i + 1] = {
          'Reference Name': referenceName,
          Contract: contractConfig.contract,
          Address: contractConfig.proxy,
        })
    )
    console.table(deployments)
  }
}

export const generateFoundryTestArtifacts = (
  parsedConfig: ParsedChugSplashConfig
): FoundryContractArtifact[] => {
  const artifacts: {
    referenceName: string
    contractName: string
    contractAddress: string
  }[] = []
  Object.entries(parsedConfig.contracts).forEach(
    ([referenceName, contractConfig], i) =>
      (artifacts[i] = {
        referenceName,
        contractName: contractConfig.contract,
        contractAddress: contractConfig.proxy,
      })
  )
  return artifacts
}

export const claimExecutorPayment = async (
  executor: Wallet,
  ChugSplashManager: Contract
) => {
  const executorDebt = await ChugSplashManager.debt(await executor.getAddress())
  if (executorDebt.gt(0)) {
    await (
      await ChugSplashManager.claimExecutorPayment(
        await getGasPriceOverrides(executor.provider)
      )
    ).wait()
  }
}

export const getProxyAdmin = async (Proxy: Contract) => {
  // Use the latest `AdminChanged` event on the Proxy to get the most recent owner.
  const { args } = (await Proxy.queryFilter('AdminChanged')).at(-1)
  return args.newAdmin
}

export const getProxyAt = (signer: Signer, proxyAddress: string): Contract => {
  return new Contract(proxyAddress, ProxyABI, signer)
}

export const getCurrentChugSplashActionType = (
  bundle: ChugSplashActionBundle,
  actionsExecuted: ethers.BigNumber
): ChugSplashActionType => {
  return bundle.actions[actionsExecuted.toNumber()].action.actionType
}

export const isProposer = async (
  provider: providers.Provider,
  projectName: string,
  address: string
): Promise<boolean> => {
  const ChugSplashManager = getChugSplashManagerReadOnly(provider, projectName)
  return ChugSplashManager.proposers(address)
}

export const isContractDeployed = async (
  address: string,
  provider: providers.Provider
): Promise<boolean> => {
  return (await provider.getCode(address)) !== '0x'
}

export const formatEther = (
  amount: ethers.BigNumber,
  decimals: number
): string => {
  return parseFloat(ethers.utils.formatEther(amount)).toFixed(decimals)
}

export const readCanonicalConfig = (
  canonicalConfigFolderPath: string,
  bundleId: string
): CanonicalChugSplashConfig => {
  // Check that the file containing the canonical config exists.
  const canonicalConfigPath = path.join(
    canonicalConfigFolderPath,
    `${bundleId}.json`
  )
  if (!fs.existsSync(canonicalConfigPath)) {
    throw new Error(
      `Could not find local bundle ID file. Please report this error.`
    )
  }

  return JSON.parse(fs.readFileSync(canonicalConfigPath, 'utf8'))
}

export const writeCanonicalConfig = (
  canonicalConfigFolderPath: string,
  bundleId: string,
  canonicalConfig: CanonicalChugSplashConfig
) => {
  // Create the canonical config folder if it doesn't already exist.
  if (!fs.existsSync(canonicalConfigFolderPath)) {
    fs.mkdirSync(canonicalConfigFolderPath)
  }

  // Write the canonical config to the local file system. It will exist in a JSON file that has the
  // bundle ID as its name.
  fs.writeFileSync(
    path.join(canonicalConfigFolderPath, `${bundleId}.json`),
    JSON.stringify(canonicalConfig, null, 2)
  )
}

export const getProxyImplementationAddress = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<string> => {
  const iface = new ethers.utils.Interface(ProxyABI)
  const encodedImplAddress = await provider.call({
    to: proxyAddress,
    from: ethers.constants.AddressZero,
    data: iface.getSighash('implementation'),
  })
  const [decoded] = ethers.utils.defaultAbiCoder.decode(
    ['address'],
    encodedImplAddress
  )
  return decoded
}

/**
 * Overrides an object's gas price settings to support EIP-1559 transactions if EIP-1559 is
 * supported by the network. This only overrides the default behavior on Goerli, where transactions
 * sent via Alchemy or Infura do not yet support EIP-1559 gas pricing, despite the fact that
 * `maxFeePerGas` and `maxPriorityFeePerGas` are defined.
 *
 * @param provider Provider object.
 * @param overridden The object whose gas price settings will be overridden.
 * @returns The object whose gas price settings will be overridden.
 */
export const getGasPriceOverrides = async (
  provider: ethers.providers.Provider,
  overridden: PayableOverrides | TransactionRequest = {}
): Promise<PayableOverrides | TransactionRequest> => {
  const { maxFeePerGas, maxPriorityFeePerGas } = await provider.getFeeData()

  if (
    BigNumber.isBigNumber(maxFeePerGas) &&
    BigNumber.isBigNumber(maxPriorityFeePerGas)
  ) {
    overridden.maxFeePerGas = maxFeePerGas
    overridden.maxPriorityFeePerGas = maxPriorityFeePerGas
  }

  return overridden
}

/**
 * Loads a ChugSplash config file synchronously.
 *
 * @param configPath Path to the ChugSplash config file.
 */
export const loadParsedChugSplashConfig = (
  configPath: string
): ParsedChugSplashConfig => {
  delete require.cache[require.resolve(path.resolve(configPath))]

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let config = require(path.resolve(configPath))
  config = config.default || config
  return parseChugSplashConfig(config)
}

export const isProjectRegistered = async (
  signer: Signer,
  projectName: string
) => {
  const ChugSplashRegistry = getChugSplashRegistry(signer)
  const chugsplashManagerAddress = getChugSplashManagerProxyAddress(projectName)
  const isRegistered: boolean = await ChugSplashRegistry.managers(
    chugsplashManagerAddress
  )
  return isRegistered
}
