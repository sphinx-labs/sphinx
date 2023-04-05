import path from 'path'

import { HardhatRuntimeEnvironment } from 'hardhat/types'
import {
  ArtifactPaths,
  UserContractConfigs,
  getEIP1967ProxyImplementationAddress,
  BuildInfo,
  ParsedContractConfig,
} from '@chugsplash/core'
import {
  Manifest,
  getStorageLayoutForAddress,
  StorageLayout,
  withValidationDefaults,
} from '@openzeppelin/upgrades-core'
import { getDeployData } from '@openzeppelin/hardhat-upgrades/dist/utils/deploy-impl'

/**
 * Retrieves contract build info by name.
 *
 * @param sourceName Source file name.
 * @param contractName Contract name within the source file.
 * @returns Contract build info.
 */
export const getBuildInfo = async (
  hre: HardhatRuntimeEnvironment,
  sourceName: string,
  contractName: string
): Promise<BuildInfo> => {
  let buildInfo
  try {
    buildInfo = await hre.artifacts.getBuildInfo(
      `${sourceName}:${contractName}`
    )
  } catch (err) {
    try {
      // Try also loading with the short source name, necessary when using the foundry
      // hardhat plugin
      const shortSourceName = path.basename(sourceName)
      buildInfo = await hre.artifacts.getBuildInfo(
        `${shortSourceName}:${contractName}`
      )
    } catch {
      // Throwing the original error is probably more helpful here because using the
      // foundry hardhat plugin is not a common usecase.
      throw err
    }
  }

  // Shouldn't happen, but might as well be safe.
  if (buildInfo === undefined) {
    throw new Error(
      `unable to find build info for contract ${contractName} in ${sourceName}`
    )
  }

  return buildInfo
}

/**
 * Finds the path to the build info file and the contract artifact file for each contract
 * referenced in the given contract configurations.
 *
 * @param hre Hardhat runtime environment.
 * @param contractConfigs Contract configurations.
 * @param artifactFolder Path to the artifact folder.
 * @param buildInfoFolder Path to the build info folder.
 * @returns Paths to the build info and contract artifact files.
 */
export const getArtifactPaths = async (
  hre: HardhatRuntimeEnvironment,
  contractConfigs: UserContractConfigs,
  artifactFolder: string,
  buildInfoFolder: string
): Promise<ArtifactPaths> => {
  const artifactPaths: ArtifactPaths = {}
  for (const [referenceName, contractConfig] of Object.entries(
    contractConfigs
  )) {
    const { sourceName, contractName } = hre.artifacts.readArtifactSync(
      contractConfig.contract
    )
    const buildInfo = await getBuildInfo(hre, sourceName, contractName)
    artifactPaths[referenceName] = {
      buildInfoPath: path.join(buildInfoFolder, `${buildInfo.id}.json`),
      contractArtifactPath: path.join(
        artifactFolder,
        sourceName,
        `${contractName}.json`
      ),
    }
  }
  return artifactPaths
}

export const filterChugSplashInputs = async (
  chugsplashInputs: ChugSplashInputs,
  parsedConfig: ParsedChugSplashConfig
): Promise<ChugSplashInputs> => {
  const filteredChugSplashInputs: ChugSplashInputs = []
  for (const chugsplashInput of chugsplashInputs) {
    let filteredSources: CompilerInput['sources'] = {}
    for (const contractConfig of Object.values(parsedConfig.contracts)) {
      const { sourceName, contractName } = getContractArtifact(
        contractConfig.contract
      )
      const { solcVersion, output: compilerOutput } = await getBuildInfo(
        sourceName,
        contractName
      )
      if (solcVersion === chugsplashInput.solcVersion) {
        const { sources: newSources } = getMinimumCompilerInput(
          chugsplashInput.input,
          compilerOutput.sources,
          sourceName
        )
        // Merge the existing sources with the new sources, which are required to compile the
        // current `sourceName`.
        filteredSources = { ...filteredSources, ...newSources }
      }
    }
    const filteredCompilerInput: CompilerInput = {
      language: chugsplashInput.input.language,
      settings: chugsplashInput.input.settings,
      sources: filteredSources,
    }
    filteredChugSplashInputs.push({
      solcVersion: chugsplashInput.solcVersion,
      solcLongVersion: chugsplashInput.solcLongVersion,
      input: filteredCompilerInput,
    })
  }

  return filteredChugSplashInputs
}

export const writeDeploymentArtifacts = async (
  hre: HardhatRuntimeEnvironment,
  parsedConfig: ParsedChugSplashConfig,
  deploymentEvents: ethers.Event[]
) => {
  writeDeploymentFolderForNetwork(
    hre.network.name,
    hre.config.paths.deployments
  )

  const provider = hre.ethers.provider

  for (const deploymentEvent of deploymentEvents) {
    const receipt = await deploymentEvent.getTransactionReceipt()

    if (deploymentEvent.event === 'DefaultProxyDeployed') {
      const { metadata, storageLayout } =
        chugsplashBuildInfo.output.contracts['contracts/libraries/Proxy.sol'][
          'Proxy'
        ]
      const { devdoc, userdoc } =
        typeof metadata === 'string'
          ? JSON.parse(metadata).output
          : metadata.output

      // Define the deployment artifact for the proxy.
      const proxyArtifact = {
        address: deploymentEvent.args.proxy,
        abi: ProxyABI,
        transactionHash: deploymentEvent.transactionHash,
        solcInputHash: chugsplashBuildInfo.id,
        receipt: {
          ...receipt,
          gasUsed: receipt.gasUsed.toString(),
          cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
          effectiveGasPrice: receipt.effectiveGasPrice.toString(),
          // Exclude the `effectiveGasPrice` if it's undefined, which is the case on Optimism.
          ...(receipt.effectiveGasPrice && {
            effectiveGasPrice: receipt.effectiveGasPrice.toString(),
          }),
        },
        numDeployments: 1,
        metadata:
          typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
        args: [
          getChugSplashManagerProxyAddress(parsedConfig.options.projectName),
        ],
        bytecode: ProxyArtifact.bytecode,
        deployedBytecode: await provider.getCode(deploymentEvent.args.proxy),
        devdoc,
        userdoc,
        storageLayout,
      }

      // Write the deployment artifact for the proxy contract.
      writeDeploymentArtifact(
        hre.network.name,
        hre.config.paths.deployments,
        proxyArtifact,
        `${deploymentEvent.args.target}Proxy`
      )
    } else if (deploymentEvent.event === 'ImplementationDeployed') {
      // Get the implementation contract's info.
      const referenceName = deploymentEvent.args.target
      const contractConfig = parsedConfig.contracts[referenceName]
      const artifact = getContractArtifact(contractConfig.contract)
      const { sourceName, contractName, bytecode, abi } = artifact
      const buildInfo = await getBuildInfo(sourceName, contractName)
      const { constructorArgValues } = getConstructorArgs(
        parsedConfig,
        referenceName,
        abi,
        buildInfo.output,
        sourceName,
        contractName
      )
      const { metadata, storageLayout } =
        buildInfo.output.contracts[sourceName][contractName]
      const { devdoc, userdoc } =
        typeof metadata === 'string'
          ? JSON.parse(metadata).output
          : metadata.output

      // Define the deployment artifact for the implementation contract.
      const implementationArtifact = {
        address: deploymentEvent.args.implementation,
        abi,
        transactionHash: deploymentEvent.transactionHash,
        solcInputHash: buildInfo.id,
        receipt: {
          ...receipt,
          gasUsed: receipt.gasUsed.toString(),
          cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
          effectiveGasPrice: receipt.effectiveGasPrice.toString(),
          // Exclude the `effectiveGasPrice` if it's undefined, which is the case on Optimism.
          ...(receipt.effectiveGasPrice && {
            effectiveGasPrice: receipt.effectiveGasPrice.toString(),
          }),
        },
        numDeployments: 1,
        metadata:
          typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
        args: constructorArgValues,
        bytecode,
        deployedBytecode: await provider.getCode(
          deploymentEvent.args.implementation
        ),
        devdoc,
        userdoc,
        storageLayout,
      }
      // Write the deployment artifact for the implementation contract.
      writeDeploymentArtifact(
        hre.network.name,
        hre.config.paths.deployments,
        implementationArtifact,
        referenceName
      )
    }
  }
}

/**
 * Get storage layouts from OpenZeppelin's Network Files for any proxies that are being imported
 * into ChugSplash from the OpenZeppelin Hardhat Upgrades plugin.
 */
export const importOpenZeppelinStorageLayout = async (
  hre: HardhatRuntimeEnvironment,
  parsedContractConfig: ParsedContractConfig
): Promise<StorageLayout | undefined> => {
  const { kind } = parsedContractConfig
  if (
    kind === 'oz-transparent' ||
    kind === 'oz-ownable-uups' ||
    kind === 'oz-access-control-uups'
  ) {
    const proxy = parsedContractConfig.proxy
    const isProxyDeployed = await hre.ethers.provider.getCode(proxy)
    if (isProxyDeployed) {
      const manifest = await Manifest.forNetwork(hre.network.provider)
      const deployData = await getDeployData(
        hre,
        await hre.ethers.getContractFactory(parsedContractConfig.contract),
        withValidationDefaults({})
      )
      const storageLayout = await getStorageLayoutForAddress(
        manifest,
        deployData.validations,
        await getEIP1967ProxyImplementationAddress(hre.ethers.provider, proxy)
      )
      return storageLayout
    }
  }
}
