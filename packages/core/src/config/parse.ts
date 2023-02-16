/* Imports: External */
import * as path from 'path'

import * as Handlebars from 'handlebars'
import { ethers, providers } from 'ethers'
import { assertStorageUpgradeSafe } from '@openzeppelin/upgrades-core'
import { OZ_UUPS_UPDATER_ADDRESS, ProxyABI } from '@chugsplash/contracts'
import ora from 'ora'
import yesno from 'yesno'

import { ArtifactPaths } from '../languages/solidity/types'
import { readStorageLayout } from '../actions'
import {
  getChugSplashManagerProxyAddress,
  getDefaultProxyAddress,
  getEIP1967ProxyAdminAddress,
  isExternalProxyType,
  readContractArtifact,
} from '../utils'
import {
  UserChugSplashConfig,
  ParsedChugSplashConfig,
  ProxyType,
} from './types'
import { Integration } from '../constants'
import { getLatestDeployedStorageLayout } from '../deployed'

/**
 * Reads a ChugSplash config file synchronously.
 *
 * @param configPath Path to the ChugSplash config file.
 * @returns The parsed ChugSplash config file.
 */
export const readParsedChugSplashConfig = async (
  provider: providers.Provider,
  configPath: string,
  artifactPaths: ArtifactPaths,
  integration: Integration
): Promise<ParsedChugSplashConfig> => {
  const userConfig = readUserChugSplashConfig(configPath)
  return parseChugSplashConfig(provider, userConfig, artifactPaths, integration)
}

export const readUserChugSplashConfig = (
  configPath: string
): UserChugSplashConfig => {
  delete require.cache[require.resolve(path.resolve(configPath))]

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let config = require(path.resolve(configPath))
  config = config.default || config
  assertValidUserConfigFields(config)
  return config
}

export const isEmptyChugSplashConfig = (configFileName: string): boolean => {
  delete require.cache[require.resolve(path.resolve(configFileName))]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(path.resolve(configFileName))
  return Object.keys(config).length === 0
}

/**
 * Validates a ChugSplash config file.
 *
 * @param config Config file to validate.
 */
export const assertValidUserConfigFields = (config: UserChugSplashConfig) => {
  if (config.contracts === undefined) {
    throw new Error('contracts field must be defined in ChugSplash config')
  }

  const referenceNames: string[] = Object.keys(config.contracts)

  for (const [referenceName, contractConfig] of Object.entries(
    config.contracts
  )) {
    // Block people from accidentally using templates in contract names.
    if (referenceName.includes('{') || referenceName.includes('}')) {
      throw new Error(
        `cannot use template strings in reference names: ${referenceName}`
      )
    }

    // Block people from accidentally using templates in contract names.
    if (
      contractConfig.contract.includes('{') ||
      contractConfig.contract.includes('}')
    ) {
      throw new Error(
        `cannot use template strings in contract names: ${contractConfig.contract}`
      )
    }

    // Make sure addresses are fixed and are actually addresses.
    if (
      contractConfig.externalProxy !== undefined &&
      !ethers.utils.isAddress(contractConfig.externalProxy)
    ) {
      throw new Error(
        `external proxy address is not a valid address: ${contractConfig.externalProxy}`
      )
    }

    // Make sure that the external proxy type is valid.
    if (
      contractConfig.externalProxyType !== undefined &&
      isExternalProxyType(contractConfig.externalProxyType) === false
    ) {
      throw new Error(
        `External proxy type is not valid: ${contractConfig.externalProxyType}`
      )
    }

    // The user must include both an `externalProxy` and `externalProxyType` field, or neither.
    if (
      contractConfig.externalProxy !== undefined &&
      contractConfig.externalProxyType === undefined
    ) {
      throw new Error(
        `User included an 'externalProxy' field for ${contractConfig.contract} in ${config.options.projectName},\n` +
          `but did not include an 'externalProxyType' field.`
      )
    } else if (
      contractConfig.externalProxy === undefined &&
      contractConfig.externalProxyType !== undefined
    ) {
      throw new Error(
        `User included an 'externalProxyType' field for ${contractConfig.contract} in ${config.options.projectName},\n` +
          `but did not include an 'externalProxy' field.`
      )
    }

    // Check for invalid contract references.
    if (contractConfig.variables !== undefined) {
      for (const [varName, varValue] of Object.entries(
        contractConfig.variables
      )) {
        if (
          typeof varValue === 'string' &&
          varValue.includes('{{') &&
          varValue.includes('}}')
        ) {
          if (!varValue.startsWith('{{')) {
            throw new Error(`Contract reference cannot contain leading spaces: ${varValue}
                 Location: ${config.options.projectName} -> ${referenceName} -> ${varName}
                 `)
          } else if (!varValue.endsWith('}}')) {
            throw new Error(`Contract reference cannot contain trailing spaces: ${varValue}
                  Location: ${config.options.projectName} -> ${referenceName} -> ${varName}
                  `)
          }

          const contractReference = varValue
            .substring(2, varValue.length - 2)
            .trim()

          if (!referenceNames.includes(contractReference)) {
            throw new Error(`Contract reference cannot be found: ${contractReference}
                  Location: ${config.options.projectName} -> ${referenceName} -> ${varName}
                  `)
          }
        }
      }
    }
  }
}

export const assertStorageSlotCheck = async (
  provider: providers.Provider,
  config: ParsedChugSplashConfig,
  artifactPaths: ArtifactPaths,
  integration: Integration,
  remoteExecution: boolean,
  canonicalConfigFolderPath: string
) => {
  for (const [referenceName, contractConfig] of Object.entries(
    config.contracts
  )) {
    const isProxyDeployed =
      (await provider.getCode(contractConfig.proxy)) !== '0x'
    if (isProxyDeployed && config.options.skipStorageCheck !== true) {
      const currStorageLayout = await getLatestDeployedStorageLayout(
        provider,
        referenceName,
        contractConfig.proxy,
        remoteExecution,
        canonicalConfigFolderPath
      )
      const newStorageLayout = readStorageLayout(
        contractConfig.contract,
        artifactPaths,
        integration
      )
      // Run OpenZeppelin's storage slot checker.
      assertStorageUpgradeSafe(
        currStorageLayout as any,
        newStorageLayout as any,
        false
      )
    }
  }
}

/**
 * Parses a ChugSplash config file from the config file given by the user.
 *
 * @param userConfig Unparsed config file to parse.
 * @param env Environment variables to inject into the file.
 * @return Parsed config file with template variables replaced.
 */
export const parseChugSplashConfig = async (
  provider: providers.Provider,
  userConfig: UserChugSplashConfig,
  artifactPaths: ArtifactPaths,
  integration: Integration
): Promise<ParsedChugSplashConfig> => {
  const parsedConfig: ParsedChugSplashConfig = {
    options: userConfig.options,
    contracts: {},
  }

  const contracts = {}
  for (const [referenceName, userContractConfig] of Object.entries(
    userConfig.contracts
  )) {
    if (
      userContractConfig.externalProxy !== undefined &&
      (await provider.getCode(userContractConfig.externalProxy)) === '0x'
    ) {
      throw new Error(
        `User entered a proxy address that does not exist: ${userContractConfig.externalProxy}`
      )
    }

    const {
      contract,
      externalProxy,
      externalProxyType,
      variables,
      constructorArgs,
    } = userContractConfig

    // Change the `contract` fields to be a fully qualified name. This ensures that it's easy for the
    // executor to create the `CanonicalConfigArtifacts` when it eventually compiles the canonical
    // config.
    const { sourceName, contractName } = readContractArtifact(
      artifactPaths,
      contract,
      integration
    )
    const contractFullyQualifiedName = `${sourceName}:${contractName}`

    // Set the proxy address to the user-defined value if it exists, otherwise set it to the default proxy
    // used by ChugSplash.
    const proxy =
      externalProxy ||
      getDefaultProxyAddress(userConfig.options.projectName, referenceName)

    const proxyType: ProxyType = externalProxyType ?? 'default'

    parsedConfig.contracts[referenceName] = {
      contract: contractFullyQualifiedName,
      proxy,
      proxyType,
      variables: variables ?? {},
      constructorArgs: constructorArgs ?? {},
    }

    contracts[referenceName] = proxy
  }

  return JSON.parse(
    Handlebars.compile(JSON.stringify(parsedConfig))({
      ...contracts,
    })
  )
}

export const assertValidUpgrade = async (
  provider: providers.Provider,
  parsedConfig: ParsedChugSplashConfig,
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
    address: string
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
            address: contractConfig.proxy,
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
            address: contractConfig.proxy,
          })
        }
      }
    }
  }

  if (requiresOwnershipTransfer.length > 0) {
    throw new Error(
      `Detected proxy contracts which are not managed by ChugSplash.
      ${requiresOwnershipTransfer.map(
        ({ name, address }) => `${name}, ${address}\n`
      )}

If you are using any Transparent proxies, you must transfer ownership of each to ChugSplash using the following command:
npx hardhat chugsplash-transfer-ownership --network <network> --config-path <path> --proxy <proxyAddress>

If you are using any UUPS proxies, you must give your ChugSplashManager contract ${chugSplashManagerAddress}
permission to call the 'upgradeTo' function on each of them.
      `
    )
  }

  if (isUpgrade) {
    if (!skipStorageCheck) {
      await assertStorageSlotCheck(
        provider,
        parsedConfig,
        artifactPaths,
        integration,
        remoteExecution,
        canonicalConfigFolderPath
      )
    }

    // Check new UUPS implementations include a public `upgradeTo` function. This ensures that the
    // user will be able to upgrade the proxy in the future.
    for (const [referenceName, contractConfig] of Object.entries(
      parsedConfig.contracts
    )) {
      if (contractConfig.proxyType === 'oz-uups') {
        const artifact = readContractArtifact(
          artifactPaths,
          contractConfig.contract,
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

    spinner?.succeed(`${projectName} is a valid upgrade.`)

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
    spinner?.succeed(`${projectName} is not an upgrade.`)
  }
}
