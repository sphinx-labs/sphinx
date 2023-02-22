import * as path from 'path'
import * as fs from 'fs'

import * as semver from 'semver'
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
  ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS,
  OZ_UUPS_UPDATER_ADDRESS,
} from '@chugsplash/contracts'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { remove0x } from '@eth-optimism/core-utils'
import yesno from 'yesno'
import ora from 'ora'
import { assertStorageUpgradeSafe } from '@openzeppelin/upgrades-core'
import { astDereferencer } from 'solidity-ast/utils'

import {
  CanonicalChugSplashConfig,
  ExternalProxyType,
  externalProxyTypes,
  ParsedChugSplashConfig,
  ParsedConfigVariable,
  ParsedContractConfigs,
  proxyTypeHashes,
  UserChugSplashConfig,
  UserConfigVariable,
} from './config/types'
import {
  ChugSplashActionBundle,
  ChugSplashActionType,
  readStorageLayout,
} from './actions'
import { Integration, keywords } from './constants'
import 'core-js/features/array/at'
import { getLatestDeployedStorageLayout } from './deployed'
import { FoundryContractArtifact } from './types'
import {
  ArtifactPaths,
  BuildInfo,
  ContractArtifact,
  ContractASTNode,
  CompilerOutputSources,
  SolidityStorageLayout,
} from './languages/solidity/types'

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

export const getChugSplashManagerProxyAddress = (projectName: string) => {
  if (projectName === 'ChugSplash') {
    return ROOT_CHUGSPLASH_MANAGER_PROXY_ADDRESS
  } else {
    return utils.getCreate2Address(
      CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
      utils.solidityKeccak256(['string'], [projectName]),
      utils.solidityKeccak256(
        ['bytes', 'bytes'],
        [
          ChugSplashManagerProxyArtifact.bytecode,
          utils.defaultAbiCoder.encode(
            ['address', 'address'],
            [
              CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
              CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
            ]
          ),
        ]
      )
    )
  }
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

  const latestEvent = ownershipTransferredEvents.at(-1)

  if (latestEvent === undefined) {
    throw new Error(`Could not find OwnershipTransferred event.`)
  } else if (latestEvent.args === undefined) {
    throw new Error(`No args found for OwnershipTransferred event.`)
  }

  // Get the most recent owner from the list of events
  const projectOwner = latestEvent.args.newOwner

  return projectOwner
}

export const getChugSplashRegistry = (
  signerOrProvider: Signer | providers.Provider
): Contract => {
  return new Contract(
    // CHUGSPLASH_REGISTRY_ADDRESS,
    CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
    ChugSplashRegistryABI,
    signerOrProvider
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
      ([referenceName, contractConfig], i) => {
        const contractName = contractConfig.contract.includes(':')
          ? contractConfig.contract.split(':').at(-1)
          : contractConfig.contract
        deployments[i + 1] = {
          'Reference Name': referenceName,
          Contract: contractName,
          Address: contractConfig.proxy,
        }
      }
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
        contractName: contractConfig.contract.split(':')[1],
        contractAddress: contractConfig.proxy,
      })
  )
  return artifacts
}

export const claimExecutorPayment = async (
  executor: Wallet,
  ChugSplashManager: Contract
) => {
  const executorDebt = await ChugSplashManager.debt(executor.address)
  if (executorDebt.gt(0)) {
    await (
      await ChugSplashManager.claimExecutorPayment(
        await getGasPriceOverrides(executor.provider)
      )
    ).wait()
  }
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
  configUri: string
): CanonicalChugSplashConfig => {
  const ipfsHash = configUri.replace('ipfs://', '')
  // Check that the file containing the canonical config exists.
  const canonicalConfigFilePath = path.join(
    canonicalConfigFolderPath,
    `${ipfsHash}.json`
  )
  if (!fs.existsSync(canonicalConfigFilePath)) {
    throw new Error(`Could not find cached canonical config file at:
${canonicalConfigFilePath}`)
  }

  return JSON.parse(fs.readFileSync(canonicalConfigFilePath, 'utf8'))
}

export const writeCanonicalConfig = (
  canonicalConfigFolderPath: string,
  configUri: string,
  canonicalConfig: CanonicalChugSplashConfig
) => {
  const ipfsHash = configUri.replace('ipfs://', '')

  // Create the canonical config folder if it doesn't already exist.
  if (!fs.existsSync(canonicalConfigFolderPath)) {
    fs.mkdirSync(canonicalConfigFolderPath)
  }

  // Write the canonical config to the local file system. It will exist in a JSON file that has the
  // config URI as its name.
  fs.writeFileSync(
    path.join(canonicalConfigFolderPath, `${ipfsHash}.json`),
    JSON.stringify(canonicalConfig, null, 2)
  )
}

export const getEIP1967ProxyImplementationAddress = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<string> => {
  // keccak256('eip1967.proxy.implementation')) - 1
  // See: https://eips.ethereum.org/EIPS/eip-1967#specification
  const implStorageKey =
    '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

  const encodedImplAddress = await provider.getStorageAt(
    proxyAddress,
    implStorageKey
  )
  const [decoded] = ethers.utils.defaultAbiCoder.decode(
    ['address'],
    encodedImplAddress
  )
  return decoded
}

export const getEIP1967ProxyAdminAddress = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<string> => {
  // See: https://eips.ethereum.org/EIPS/eip-1967#specification
  const ownerStorageKey =
    '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'

  const [ownerAddress] = ethers.utils.defaultAbiCoder.decode(
    ['address'],
    await provider.getStorageAt(proxyAddress, ownerStorageKey)
  )
  return ownerAddress
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

export const isInternalDefaultProxy = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<boolean> => {
  const ChugSplashRegistry = getChugSplashRegistry(provider)

  const actionExecutedEvents = await ChugSplashRegistry.queryFilter(
    ChugSplashRegistry.filters.EventAnnouncedWithData(
      'DefaultProxyDeployed',
      null,
      proxyAddress
    )
  )

  return actionExecutedEvents.length === 1
}

/**
 * Since both UUPS and Transparent proxies use the same interface we use a helper function to check that. This wrapper is intended to
 * keep the code clear by providing separate functions for checking UUPS and Transparent proxies.
 *
 * @param provider JSON RPC provider corresponding to the current project owner.
 * @param contractAddress Address of the contract to check the interface of
 * @returns
 */
export const isTransparentProxy = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<boolean> => {
  // We don't consider default proxies to be transparent proxies, even though they share the same
  // interface.
  if ((await isInternalDefaultProxy(provider, proxyAddress)) === true) {
    return false
  }

  // Check if the contract bytecode contains the expected interface
  const bytecode = await provider.getCode(proxyAddress)
  if (!(await bytecodeContainsEIP1967Interface(bytecode))) {
    return false
  }

  // Fetch proxy owner address from storage slot defined by EIP-1967
  const ownerAddress = await getEIP1967ProxyAdminAddress(provider, proxyAddress)

  // If proxy owner is not a valid address, then proxy type is incompatible
  if (!ethers.utils.isAddress(ownerAddress)) {
    return false
  }

  return true
}

/**
 * Checks if the passed in proxy contract points to an implementation address which implements the minimum requirements to be
 * a ChugSplash compatible UUPS proxy.
 *
 * @param provider JSON RPC provider corresponding to the current project owner.
 * @param proxyAddress Address of the proxy contract. Since this is a UUPS proxy, we check the interface of the implementation function.
 * @returns
 */
export const isUUPSProxy = async (
  provider: providers.Provider,
  proxyAddress: string
): Promise<boolean> => {
  const implementationAddress = await getEIP1967ProxyImplementationAddress(
    provider,
    proxyAddress
  )

  // Check if the contract bytecode contains the expected interface
  const bytecode = await provider.getCode(implementationAddress)
  if (!(await bytecodeContainsUUPSInterface(bytecode))) {
    return false
  }

  // Fetch proxy owner address from storage slot defined by EIP-1967
  const ownerAddress = await getEIP1967ProxyAdminAddress(
    provider,
    implementationAddress
  )

  // If proxy owner is not a valid address, then proxy type is incompatible
  if (!ethers.utils.isAddress(ownerAddress)) {
    return false
  }

  return true
}

const bytecodeContainsUUPSInterface = async (
  bytecode: string
): Promise<boolean> => {
  return bytecodeContainsInterface(bytecode, ['upgradeTo'])
}

const bytecodeContainsEIP1967Interface = async (
  bytecode: string
): Promise<boolean> => {
  return bytecodeContainsInterface(bytecode, [
    'implementation',
    'admin',
    'upgradeTo',
    'changeAdmin',
  ])
}

/**
 * @param bytecode The bytecode of the contract to check the interface of.
 * @returns True if the contract contains the expected interface and false if not.
 */
const bytecodeContainsInterface = async (
  bytecode: string,
  checkFunctions: string[]
): Promise<boolean> => {
  // Fetch proxy bytecode and check if it contains the expected EIP-1967 function definitions
  const iface = new ethers.utils.Interface(ProxyABI)
  for (const func of checkFunctions) {
    const sigHash = remove0x(iface.getSighash(func))
    if (!bytecode.includes(sigHash)) {
      return false
    }
  }
  return true
}

export const setProxiesToReferenceNames = async (
  provider: providers.Provider,
  ChugSplashManager: ethers.Contract,
  contractConfigs: ParsedContractConfigs
): Promise<void> => {
  for (const [referenceName, contractConfig] of Object.entries(
    contractConfigs
  )) {
    if ((await provider.getCode(contractConfig.proxy)) === '0x') {
      continue
    }

    const currProxyTypeHash = await ChugSplashManager.proxyTypes(referenceName)
    const actualProxyTypeHash = proxyTypeHashes[contractConfig.proxyType]
    if (currProxyTypeHash !== actualProxyTypeHash) {
      await ChugSplashManager.setProxyToReferenceName(
        referenceName,
        contractConfig.proxy,
        actualProxyTypeHash
      )
    }
  }
}

export const assertValidParsedChugSplashFile = async (
  provider: providers.Provider,
  parsedConfig: ParsedChugSplashConfig,
  userConfig: UserChugSplashConfig,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  remoteExecution: boolean,
  canonicalConfigFolderPath: string,
  skipStorageCheck: boolean,
  confirm: boolean,
  spinner?: ora.Ora
) => {
  // Determine if the deployment is an upgrade
  const projectName = parsedConfig.options.projectName
  spinner?.start(
    `Checking if ${projectName} is a fresh deployment or upgrade...`
  )

  const chugSplashManagerAddress = getChugSplashManagerProxyAddress(
    parsedConfig.options.projectName
  )

  const requiresOwnershipTransfer: {
    name: string
    proxyAddress: string
    currentAdminAddress: string
  }[] = []
  let isUpgrade: boolean = false
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    if ((await provider.getCode(contractConfig.proxy)) !== '0x') {
      isUpgrade = true

      if (contractConfig.proxyType === 'oz-uups') {
        // We must manually check that the ChugSplashManager can call the UUPS proxy's `upgradeTo`
        // function because OpenZeppelin UUPS proxies can implement arbitrary access control
        // mechanisms.
        const chugsplashManager = new ethers.VoidSigner(
          chugSplashManagerAddress,
          provider
        )
        const UUPSProxy = new ethers.Contract(
          contractConfig.proxy,
          ProxyABI,
          chugsplashManager
        )
        try {
          // Attempt to staticcall the `upgradeTo` function on the proxy from the
          // ChugSplashManager's address. Note that it's necessary for us to set the proxy's
          // implementation to an OpenZeppelin UUPS ProxyUpdater contract to ensure that:
          // 1. The new implementation is deployed on every network. Otherwise, the call will revert
          //    due to this check:
          //    https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/ERC1967/ERC1967Upgrade.sol#L44
          // 2. The new implementation has a public `proxiableUUID()` function. Otherwise, the call
          //    will revert due to this check:
          //    https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/dd8ca8adc47624c5c5e2f4d412f5f421951dcc25/contracts/proxy/ERC1967/ERC1967UpgradeUpgradeable.sol#L91
          await UUPSProxy.callStatic.upgradeTo(OZ_UUPS_UPDATER_ADDRESS)
        } catch (e) {
          // The ChugSplashManager does not have permission to call the `upgradeTo` function on the
          // proxy, which means the user must grant it permission via whichever access control
          // mechanism the UUPS proxy uses.
          requiresOwnershipTransfer.push({
            name: referenceName,
            proxyAddress: contractConfig.proxy,
            currentAdminAddress: 'unknown',
          })
        }
      } else {
        const proxyAdmin = await getEIP1967ProxyAdminAddress(
          provider,
          contractConfig.proxy
        )

        if (proxyAdmin !== chugSplashManagerAddress) {
          requiresOwnershipTransfer.push({
            name: referenceName,
            proxyAddress: contractConfig.proxy,
            currentAdminAddress: proxyAdmin,
          })
        }
      }
    }
  }

  if (requiresOwnershipTransfer.length > 0) {
    throw new Error(
      `Detected proxy contracts which are not managed by ChugSplash:` +
        `${requiresOwnershipTransfer.map(
          ({ name, proxyAddress, currentAdminAddress }) =>
            `\n${name}: ${proxyAddress} | Current admin: ${currentAdminAddress}`
        )}

If you are using any Transparent proxies, you must transfer ownership of each to ChugSplash using the following command:
npx hardhat chugsplash-transfer-ownership --network <network> --config-path <path> --proxy <proxyAddress>

If you are using any UUPS proxies, you must give your ChugSplashManager contract ${chugSplashManagerAddress}
permission to call the 'upgradeTo' function on each of them.
      `
    )
  }

  if (isUpgrade) {
    for (const [referenceName, contractConfig] of Object.entries(
      parsedConfig.contracts
    )) {
      const isProxyDeployed =
        (await provider.getCode(contractConfig.proxy)) !== '0x'
      if (isProxyDeployed) {
        const currStorageLayout = await getLatestDeployedStorageLayout(
          provider,
          referenceName,
          contractConfig.proxy,
          userConfig,
          artifactPaths,
          remoteExecution,
          canonicalConfigFolderPath
        )
        const newStorageLayout = readStorageLayout(
          artifactPaths[referenceName].buildInfoPath,
          contractConfig.contract
        )

        // We could check for the `skipStorageCheck` in the outer for-loop, but this makes it easy to
        // support more granular storage layout config options in the future.
        if (parsedConfig.options.skipStorageCheck !== true) {
          // Run OpenZeppelin's storage slot checker.
          assertStorageUpgradeSafe(
            currStorageLayout as any,
            newStorageLayout as any,
            false
          )
        }
      }

      // Check new UUPS implementations include a public `upgradeTo` function. This ensures that the
      // user will be able to upgrade the proxy in the future.
      if (contractConfig.proxyType === 'oz-uups') {
        const artifact = readContractArtifact(
          artifactPaths[referenceName].contractArtifactPath,
          integration
        )
        const containsPublicUpgradeTo = artifact.abi.some(
          (fragment) =>
            fragment.name === 'upgradeTo' &&
            fragment.inputs.length === 1 &&
            fragment.inputs[0].type === 'address'
        )
        if (!containsPublicUpgradeTo) {
          throw new Error(
            `Contract ${referenceName} proxy type is marked as UUPS, but the new implementation\n` +
              `no longer has a public 'upgradeTo(address)' function. You must include this function \n` +
              `or you will no longer be able to upgrade this contract.`
          )
        }
      }
    }

    spinner?.succeed(`Validated the contracts in ${projectName}.`)

    if (!confirm) {
      // Confirm upgrade with user
      const userConfirmed = await yesno({
        question: `Prior deployment(s) detected for project ${projectName}. Would you like to perform an upgrade? (y/n)`,
      })
      if (!userConfirmed) {
        throw new Error(`User denied upgrade.`)
      }
    }
  } else {
    for (const contractConfig of Object.values(parsedConfig.contracts)) {
      // Throw an error if the 'preserve' keyword is set to a variable's value in the
      // ChugSplash file. This keyword is only allowed for upgrades.
      if (variableContainsPreserveKeyword(contractConfig.variables)) {
        throw new Error(
          `Detected the '{preserve}' keyword in a fresh deployment. This keyword is reserved for\n` +
            `upgrades only. Please remove all instances of it in your ChugSplash file.`
        )
      }
    }

    spinner?.succeed(`Validated the contracts in ${projectName}.`)
  }
}

export const isExternalProxyType = (
  proxyType: string
): proxyType is ExternalProxyType => {
  return externalProxyTypes.includes(proxyType)
}

export const isPreserveKeyword = (
  variableValue: ParsedConfigVariable
): boolean => {
  if (
    typeof variableValue === 'string' &&
    // Remove whitespaces from the variable, then lowercase it
    variableValue.replace(/\s+/g, '').toLowerCase() === keywords.preserve
  ) {
    return true
  } else {
    return false
  }
}

export const variableContainsPreserveKeyword = (
  variable: ParsedConfigVariable
): boolean => {
  if (isPreserveKeyword(variable)) {
    return true
  } else if (Array.isArray(variable)) {
    for (const element of variable) {
      if (variableContainsPreserveKeyword(element)) {
        return true
      }
    }
    return false
  } else if (typeof variable === 'object') {
    for (const varValue of Object.values(variable)) {
      if (variableContainsPreserveKeyword(varValue)) {
        return true
      }
    }
    return false
  } else if (
    typeof variable === 'boolean' ||
    typeof variable === 'number' ||
    typeof variable === 'string' ||
    variable === undefined
  ) {
    return false
  } else {
    throw new Error(
      `Detected unknown variable type, ${typeof variable}, for variable: ${variable}.`
    )
  }
}

/**
 * Throws an error if the given variable contains any invalid contract references. Specifically,
 * it'll throw an error if any of the following conditions occur:
 *
 * 1. There are any leading spaces before '{{', or any trailing spaces after '}}'. This ensures the
 * template string converts into a valid address when it's parsed. If there are any leading or
 * trailing spaces in an address, `ethers.utils.isAddress` will return false.
 *
 * 2. The contract reference is not included in the array of valid contract references.
 *
 * @param variable Config variable defined by the user.
 * @param referenceNames Valid reference names for this ChugSplash file.
 */
export const assertValidContractReferences = (
  variable: UserConfigVariable,
  referenceNames: string[]
) => {
  if (
    typeof variable === 'string' &&
    variable.includes('{{') &&
    variable.includes('}}')
  ) {
    if (!variable.startsWith('{{')) {
      throw new Error(
        `Contract reference cannot contain leading spaces before '{{' : ${variable}`
      )
    }
    if (!variable.endsWith('}}')) {
      throw new Error(
        `Contract reference cannot contain trailing spaces: ${variable}`
      )
    }

    const contractReference = variable.substring(2, variable.length - 2).trim()

    if (!referenceNames.includes(contractReference)) {
      throw new Error(
        `Invalid contract reference: ${variable}.\n` +
          `Did you misspell this contract reference, or forget to define a contract with this reference name?`
      )
    }
  } else if (Array.isArray(variable)) {
    for (const element of variable) {
      assertValidContractReferences(element, referenceNames)
    }
  } else if (typeof variable === 'object') {
    for (const [varName, varValue] of Object.entries(variable)) {
      assertValidContractReferences(varName, referenceNames)
      assertValidContractReferences(varValue, referenceNames)
    }
  } else if (
    typeof variable === 'boolean' ||
    typeof variable === 'number' ||
    typeof variable === 'string'
  ) {
    return
  } else {
    throw new Error(
      `Detected unknown variable type, ${typeof variable}, for variable: ${variable}.`
    )
  }
}

export const assertValidContracts = (
  parsedConfig: ParsedChugSplashConfig,
  artifactPaths: ArtifactPaths
) => {
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    // Get the source name and contract name from its fully qualified name
    const [sourceName, contractName] = contractConfig.contract.split(':')

    const buildInfoPath = artifactPaths[referenceName].buildInfoPath
    const buildInfo = readBuildInfo(buildInfoPath)
    const outputSource = buildInfo.output.sources[sourceName]

    const childContractNode = outputSource.ast.nodes.find(
      (node) =>
        node.nodeType === 'ContractDefinition' && node.name === contractName
    )

    const parentContractNodeAstIds =
      childContractNode.linearizedBaseContracts.filter(
        (astId) => astId !== childContractNode.id
      )
    const parentContractNodes = getParentContractASTNodes(
      buildInfo.output.sources,
      parentContractNodeAstIds
    )

    // TODO: type
    const constructorNodes: Array<any> = []
    const immutableVarAstIds: { [astId: number]: boolean } = {}
    // Create a mapping of constructor node AST IDs to the corresponding contract's name. This is only used
    // for error messages when we parse the constructor nodes later.
    const constructorNodeContractNames: { [astId: number]: string } = {}
    for (const contractNode of parentContractNodes.concat([
      childContractNode,
    ])) {
      for (const node of contractNode.nodes) {
        if (node.kind === 'constructor') {
          constructorNodes.push(node)
          constructorNodeContractNames[node.id] = contractNode.name
        } else if (node.nodeType === 'VariableDeclaration') {
          if (node.mutability === 'mutable' && node.value !== undefined) {
            throw new Error(
              `User attempted to assign a value to a non-immutable state variable '${node.name}' in\n` +
                `the contract: ${contractNode.name}. This is not allowed because the value will not exist in\n` +
                `the upgradeable contract. Please remove the value in the contract and define it in your ChugSplash\n` +
                `file instead. Alternatively, can also set '${node.name} to be a constant or immutable variable.`
            )
          }

          if (
            node.mutability === 'immutable' &&
            node.value !== undefined &&
            node.value.kind === 'functionCall'
          ) {
            throw new Error(
              `User attempted to assign the immutable variable '${node.name}' to the return value of a function call in\n` +
                `the contract: ${contractNode.name}. This is not allowed to ensure that ChugSplash is\n` +
                `deterministic. Please remove the function call.`
            )
          }

          if (node.mutability === 'immutable' && node.value === undefined) {
            immutableVarAstIds[node.id] = true
          }
        }
      }
    }

    for (const node of constructorNodes) {
      for (const statement of node.body.statements) {
        if (statement.nodeType !== 'ExpressionStatement') {
          throw new Error(
            `Detected an unallowed expression, '${statement.nodeType}', in the constructor of the\n` +
              `contract: ${
                constructorNodeContractNames[node.id]
              }. Only immutable variable assignments are allowed in\n` +
              `the constructor to ensure that ChugSplash can deterministically deploy your contracts.`
          )
        }

        if (statement.expression.nodeType !== 'Assignment') {
          const unallowedOperation: string =
            statement.expression.expression.name ?? statement.expression.kind
          throw new Error(
            `Detected an unallowed operation, '${unallowedOperation}', in the constructor of the\n` +
              `contract: ${
                constructorNodeContractNames[node.id]
              }. Only immutable variable assignments are allowed in\n` +
              `the constructor to ensure that ChugSplash can deterministically deploy your contracts.`
          )
        }

        if (
          immutableVarAstIds[
            statement.expression.leftHandSide.referencedDeclaration
          ] !== true
        ) {
          throw new Error(
            `Detected an assignment to a non-immutable variable, '${statement.expression.leftHandSide.name}', in the\n` +
              `constructor of the contract: ${
                constructorNodeContractNames[node.id]
              }. Only immutable variable assignments are allowed in\n` +
              `the constructor to ensure that ChugSplash can deterministically deploy your contracts.`
          )
        }

        if (statement.expression.rightHandSide.kind === 'functionCall') {
          throw new Error(
            `User attempted to assign the immutable variable '${statement.expression.leftHandSide.name}' to the return \n` +
              `value of a function call in the contract: ${
                constructorNodeContractNames[node.id]
              }. This is not allowed to ensure that\n` +
              `ChugSplash is deterministic. Please remove the function call.`
          )
        }
      }
    }
  }
}

export const getParentContractASTNodes = (
  compilerOutputSources: CompilerOutputSources,
  parentContractNodeAstIds: Array<number>
): Array<ContractASTNode> => {
  const parentContractNodes: Array<ContractASTNode> = []
  for (const source of Object.values(compilerOutputSources)) {
    for (const node of source.ast.nodes) {
      if (parentContractNodeAstIds.includes(node.id)) {
        parentContractNodes.push(node)
      }
    }
  }

  // Should never happen.
  if (parentContractNodes.length !== parentContractNodeAstIds.length) {
    throw new Error(
      `Expected ${parentContractNodeAstIds.length} parent contract AST nodes, but got ${parentContractNodes.length}.\n` +
        `Please report this error to ChugSplash.`
    )
  }

  return parentContractNodes
}

/**
 * Grabs the transaction hash of the transaction that completed the given bundle.
 *
 * @param ChugSplashManager ChugSplashManager contract instance.
 * @param bundleId ID of the bundle to look up.
 * @returns Transaction hash of the transaction that completed the bundle.
 */
export const getBundleCompletionTxnHash = async (
  ChugSplashManager: ethers.Contract,
  bundleId: string
): Promise<string> => {
  const events = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.ChugSplashBundleCompleted(bundleId)
  )

  // Might happen if we're asking for the event too quickly after completing the bundle.
  if (events.length === 0) {
    throw new Error(
      `no ChugSplashBundleCompleted event found for bundle ${bundleId}`
    )
  }

  // Shouldn't happen.
  if (events.length > 1) {
    throw new Error(
      `multiple ChugSplashBundleCompleted events found for bundle ${bundleId}`
    )
  }

  return events[0].transactionHash
}

/**
 * Retrieves an artifact by name from the local file system.
 */
export const readContractArtifact = (
  contractArtifactPath: string,
  integration: Integration
): ContractArtifact => {
  const artifact: ContractArtifact = JSON.parse(
    fs.readFileSync(contractArtifactPath, 'utf8')
  )

  if (integration === 'hardhat') {
    return artifact
  } else if (integration === 'foundry') {
    return parseFoundryArtifact(artifact)
  } else {
    throw new Error('Unknown integration')
  }
}

/**
 * Reads the build info from the local file system.
 *
 * @param buildInfoPath Path to the build info file.
 * @returns BuildInfo object.
 */
export const readBuildInfo = (buildInfoPath: string): BuildInfo => {
  const buildInfo: BuildInfo = JSON.parse(
    fs.readFileSync(buildInfoPath, 'utf8')
  )

  if (!semver.satisfies(buildInfo.solcVersion, '>=0.4.x <0.9.x')) {
    throw new Error(
      `Storage layout for Solidity version ${buildInfo.solcVersion} not yet supported. Sorry!`
    )
  }

  if (
    !buildInfo.input.settings.outputSelection['*']['*'].includes(
      'storageLayout'
    )
  ) {
    throw new Error(
      `Storage layout not found. Did you forget to set the "storageLayout" compiler option in your\n` +
        `Hardhat/Foundry config file?\n\n` +
        `If you're using Hardhat, see how to configure your project here:\n` +
        `https://github.com/chugsplash/chugsplash/blob/develop/docs/hardhat/setup-project.md#setup-chugsplash-using-typescript\n\n` +
        `If you're using Foundry, see how to configure your project here:\n` +
        `https://github.com/chugsplash/chugsplash/blob/develop/docs/foundry/getting-started.md#3-configure-your-foundrytoml-file`
    )
  }

  return buildInfo
}

export const addEnumMembersToStorageLayout = (
  storageLayout: SolidityStorageLayout,
  outputSources: any
): SolidityStorageLayout => {
  // If no vars are defined or all vars are immutable, then storageLayout.types will be null and we can just return
  if (storageLayout.types === null) {
    return storageLayout
  }

  const deref = astDereferencer(outputSources)

  for (const [typeName, typeDefinition] of Object.entries(
    storageLayout.types
  )) {
    if (typeDefinition.label.startsWith('enum')) {
      const astId = typeName.split(')').at(-1)
      if (!astId) {
        throw new Error(`Could not find AST ID for variable: ${typeName}`)
      }
      const enumDefinition = deref('EnumDefinition', parseInt(astId, 10))
      typeDefinition.members = enumDefinition.members.map(
        (member) => member.name
      )
    }
  }
  return storageLayout
}

/**
 * Retrieves artifact info from foundry artifacts and returns it in hardhat compatible format.
 *
 * @param artifact Raw artifact object.
 * @returns ContractArtifact
 */
export const parseFoundryArtifact = (artifact: any): ContractArtifact => {
  const abi = artifact.abi
  const bytecode = artifact.bytecode.object

  const compilationTarget = artifact.metadata.settings.compilationTarget
  const sourceName = Object.keys(compilationTarget)[0]
  const contractName = compilationTarget[sourceName]

  return { abi, bytecode, sourceName, contractName }
}
