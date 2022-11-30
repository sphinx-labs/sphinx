import * as path from 'path'
import * as fs from 'fs'

import { utils, constants, Signer, Contract, providers, ethers } from 'ethers'
import {
  ProxyArtifact,
  ChugSplashRegistryABI,
  ChugSplashManagerABI,
  ChugSplashManagerProxyArtifact,
  CHUGSPLASH_REGISTRY_PROXY_ADDRESS,
  ProxyABI,
} from '@chugsplash/contracts'

import { ParsedChugSplashConfig } from './config'

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
  networkName: string,
  deploymentFolderPath: string,
  snapshotId: string
) => {
  const networkPath = path.join(
    path.basename(deploymentFolderPath),
    networkName
  )
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
  const networkPath = path.join(
    path.basename(deploymentFolderPath),
    networkName
  )
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
    path.basename(deploymentFolderPath),
    networkName,
    `${referenceName}.json`
  )
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, '\t'))
}

export const getProxyAddress = (
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
  for (const referenceName of Object.keys(parsedConfig.contracts)) {
    if (
      await isProxyDeployed(
        provider,
        parsedConfig.options.projectName,
        referenceName
      )
    ) {
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
  for (const referenceName of Object.keys(parsedConfig.contracts)) {
    if (
      await isProxyDeployed(
        provider,
        parsedConfig.options.projectName,
        referenceName
      )
    ) {
      proxyDetected = true
      const proxyAddress = getProxyAddress(
        parsedConfig.options.projectName,
        referenceName
      )

      const contract = new ethers.Contract(proxyAddress, ProxyABI, provider)

      const owner = await getProxyOwner(contract)
      const managerProxy = await getChugSplashManagerProxyAddress(
        parsedConfig.options.projectName
      )
      if (owner !== managerProxy) {
        requiresOwnershipTransfer.push({
          name: referenceName,
          address: proxyAddress,
        })
      }
    }
  }

  if (!proxyDetected) {
    throw new Error(
      `Error: No deployed contracts were detected for project ${parsedConfig.options.projectName}.

Run the following command to deploy this project for the first time:
npx hardhat chugsplash-deploy --network ${networkName} ${configPath}
      `
    )
  }

  if (requiresOwnershipTransfer.length > 0) {
    // TODO update this once the transfer ownership task is implemented
    throw new Error(
      `Error: Detected proxy contracts which are not managed by ChugSplash.
      ${requiresOwnershipTransfer.map(
        ({ name, address }) => `${name}, ${address}\n`
      )}

To upgrade these contracts, you must first transfer ownership of them to ChugSplash using the following command:
npx hardhat chugsplash-transfer-ownership>
      `
    )
  }
}

export const isProxyDeployed = async (
  provider: ethers.providers.Provider,
  projectName: string,
  referenceName: string
): Promise<boolean> => {
  const proxyAddress = getProxyAddress(projectName, referenceName)
  return (await provider.getCode(proxyAddress)) !== '0x'
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
  projectName: string,
  projectOwner: string
): Promise<boolean> => {
  const signer = provider.getSigner()
  const ChugSplashRegistry = getChugSplashRegistry(signer)

  if (
    (await ChugSplashRegistry.projects(projectName)) === constants.AddressZero
  ) {
    await (await ChugSplashRegistry.register(projectName, projectOwner)).wait()
    return true
  } else {
    const existingProjectOwner = await getProjectOwnerAddress(
      provider,
      projectName
    )
    if (existingProjectOwner !== (await signer.getAddress())) {
      throw new Error(`Project already owned by: ${existingProjectOwner}.`)
    } else {
      return false
    }
  }
}

export const getProjectOwnerAddress = async (
  provider: providers.JsonRpcProvider,
  projectName: string
): Promise<string> => {
  const signer = provider.getSigner()
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
          Address: contractConfig.address,
        })
    )
    console.table(deployments)
  }
}

export const claimExecutorPayment = async (
  executor: Signer,
  ChugSplashManager: Contract
) => {
  const executorDebt = await ChugSplashManager.debt(await executor.getAddress())
  if (executorDebt.gt(0)) {
    await (await ChugSplashManager.claimExecutorPayment()).wait()
  }
}

export const getProxyOwner = async (Proxy: Contract) => {
  // Use the latest `AdminChanged` event on the Proxy to get the most recent owner.
  const { args } = (await Proxy.queryFilter('AdminChanged')).at(-1)
  return args.newAdmin
}
