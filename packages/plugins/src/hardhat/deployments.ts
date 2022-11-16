import * as path from 'path'
import * as fs from 'fs'

import '@nomiclabs/hardhat-ethers'
import { Contract, ethers } from 'ethers'
import {
  ChugSplashConfig,
  getProxyAddress,
  isEmptyChugSplashConfig,
  registerChugSplashProject,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  isProxyDeployed,
  getChugSplashManagerProxyAddress,
  chugsplashLog,
  displayDeploymentTable,
} from '@chugsplash/core'
import { ChugSplashManagerABI, OWNER_BOND_AMOUNT } from '@chugsplash/contracts'
import { getChainId } from '@eth-optimism/core-utils'

import { getContractArtifact } from './artifacts'
import { loadParsedChugSplashConfig, writeHardhatSnapshotId } from './utils'
import {
  chugsplashApproveSubtask,
  chugsplashCommitSubtask,
  chugsplashProposeSubtask,
} from './tasks'

/**
 * TODO
 *
 * @param hre Hardhat Runtime Environment.
 * @param contractName Name of the contract in the config file.
 */
export const deployAllChugSplashConfigs = async (
  hre: any,
  silent: boolean,
  ipfsUrl: string
) => {
  const remoteExecution = (await getChainId(hre.ethers.provider)) !== 31337
  const fileNames = fs.readdirSync(hre.config.paths.chugsplash)
  for (const fileName of fileNames) {
    const configPath = path.join(hre.config.paths.chugsplash, fileName)
    await deployChugSplashConfig(
      hre,
      configPath,
      silent,
      remoteExecution,
      ipfsUrl
    )
  }
}

export const deployChugSplashConfig = async (
  hre: any,
  configPath: string,
  silent: boolean,
  remoteExecution: boolean,
  ipfsUrl: string
) => {
  // Skip this config if it's empty.
  if (isEmptyChugSplashConfig(configPath)) {
    return
  }

  const provider = hre.ethers.provider
  const deployer = provider.getSigner()
  const deployerAddress = await deployer.getAddress()

  const parsedConfig = loadParsedChugSplashConfig(configPath)

  chugsplashLog(`Deploying: ${parsedConfig.options.projectName}`, silent)

  // Register the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the project owner specified in the config.
  await registerChugSplashProject(
    provider,
    parsedConfig.options.projectName,
    deployerAddress
  )

  // Get the bundle ID without publishing anything to IPFS.
  const { bundleId, bundle } = await chugsplashCommitSubtask(
    {
      configPath,
      ipfsUrl,
      commitToIpfs: false,
      compile: true,
    },
    hre
  )

  const ChugSplashManager = new Contract(
    getChugSplashManagerProxyAddress(parsedConfig.options.projectName),
    ChugSplashManagerABI,
    deployer
  )

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    throw new Error(
      `${parsedConfig.options.projectName} was previously cancelled.`
    )
  } else if (bundleState.status === ChugSplashBundleStatus.EMPTY) {
    for (const referenceName of Object.keys(parsedConfig.contracts)) {
      if (
        await isProxyDeployed(
          hre.ethers.provider,
          parsedConfig.options.projectName,
          referenceName
        )
      ) {
        throw new Error(
          `The contract ${referenceName} inside ${parsedConfig.options.projectName} has already been deployed.`
        )
      }
    }
  }

  await chugsplashProposeSubtask(
    {
      configPath,
      ipfsUrl,
      silent: true,
      noCompile: true,
      remoteExecution,
    },
    hre
  )

  if ((await deployer.getBalance()).lt(OWNER_BOND_AMOUNT.mul(5))) {
    throw new Error(
      `Deployer has insufficient funds. Please add ${ethers.utils.formatEther(
        OWNER_BOND_AMOUNT.mul(5)
      )} ETH to its wallet.`
    )
  }

  const managerBalance = await hre.ethers.provider.getBalance(
    ChugSplashManager.address
  )
  if (managerBalance.lt(OWNER_BOND_AMOUNT.mul(5))) {
    const tx = await deployer.sendTransaction({
      value: OWNER_BOND_AMOUNT.mul(5), // TODO: get a better cost estimate for deployments
      to: ChugSplashManager.address,
    })
    await tx.wait()
  }

  await chugsplashApproveSubtask(
    {
      configPath,
      silent: true,
      remoteExecution,
    },
    hre
  )

  if (!remoteExecution) {
    await hre.run('chugsplash-execute', {
      chugSplashManager: ChugSplashManager,
      bundleState,
      bundle,
      parsedConfig,
      deployer,
      silent: true,
    })
    displayDeploymentTable(parsedConfig, false)
  }
  chugsplashLog(`Deployed ${parsedConfig.options.projectName}.`, silent)
}

export const getContract = async (
  hre: any,
  provider: ethers.providers.JsonRpcProvider,
  referenceName: string
): Promise<ethers.Contract> => {
  if ((await getChainId(provider)) !== 31337) {
    throw new Error('Only the Hardhat Network is currently supported.')
  }
  const configsWithFileNames: {
    config: ChugSplashConfig
    configFileName: string
  }[] = fs
    .readdirSync(hre.config.paths.chugsplash)
    .map((configFileName) => {
      const config = loadParsedChugSplashConfig(
        path.join('chugsplash', configFileName)
      )
      return { configFileName, config }
    })
    .filter(({ config }) => {
      return Object.keys(config.contracts).includes(referenceName)
    })

  // TODO: Make function `getContract(projectName, target)` and change this error message.
  if (configsWithFileNames.length > 1) {
    throw new Error(
      `Multiple config files contain the target: ${referenceName}. Target names must be unique for now. Config files containing ${referenceName}: ${configsWithFileNames.map(
        (cfgWithFileName) => cfgWithFileName.configFileName
      )}\n`
    )
  } else if (configsWithFileNames.length === 0) {
    throw new Error(`Cannot find a config file containing ${referenceName}.`)
  }

  const { config: cfg } = configsWithFileNames[0]

  if (
    (await isProxyDeployed(
      hre.ethers.provider,
      cfg.options.projectName,
      referenceName
    )) === false
  ) {
    throw new Error(`You must first deploy ${referenceName}.`)
  }

  const Proxy = new ethers.Contract(
    getProxyAddress(cfg.options.projectName, referenceName),
    new ethers.utils.Interface(
      getContractArtifact(cfg.contracts[referenceName].contract).abi
    ),
    provider.getSigner()
  )

  return Proxy
}

export const resetChugSplashDeployments = async (hre: any) => {
  const networkFolderName =
    hre.network.name === 'localhost' ? 'localhost' : 'hardhat'
  const snapshotIdPath = path.join(
    path.basename(hre.config.paths.deployed),
    networkFolderName,
    '.snapshotId'
  )
  const snapshotId = fs.readFileSync(snapshotIdPath, 'utf8')
  const snapshotReverted = await hre.network.provider.send('evm_revert', [
    snapshotId,
  ])
  if (!snapshotReverted) {
    throw new Error('Snapshot failed to be reverted.')
  }
  await writeHardhatSnapshotId(hre)
}
