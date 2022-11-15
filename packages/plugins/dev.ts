import * as path from 'path'
import * as fs from 'fs'

import hre from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import { Wallet, Contract, ethers } from 'ethers'
import {
  isEmptyChugSplashConfig,
  registerChugSplashProject,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  isProxyDeployed,
  getChugSplashManagerProxyAddress,
  ChugSplashLog,
} from '@chugsplash/core'
import { ChugSplashManagerABI, OWNER_BOND_AMOUNT } from '@chugsplash/contracts'

import { loadParsedChugSplashConfig } from './src/hardhat/utils'

const deployConfigsForceCommit = async () => {
  const fileNames = fs.readdirSync('chugsplash')
  for (const fileName of fileNames) {
    await deployConfigForceCommit(fileName, false)
  }
}

const deployConfigForceCommit = async (fileName: string, silent: boolean) => {
  const deployer = new Wallet(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    hre.ethers.provider
  )
  const deployerAddress = await deployer.getAddress()

  const configPath = path.format({
    dir: 'chugsplash',
    ext: fileName,
  })

  // Skip this config if it's empty.
  if (isEmptyChugSplashConfig(configPath)) {
    return
  }

  const parsedConfig = loadParsedChugSplashConfig(configPath)

  ChugSplashLog(`Deploying: ${parsedConfig.options.projectName}`, silent)

  // Register the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the project owner specified in the config.
  await registerChugSplashProject(
    parsedConfig.options.projectName,
    deployerAddress,
    deployer
  )

  // Publish the config to IPFS and get the bundle ID.
  const { bundleId } = await hre.run('chugsplash-commit', {
    configPath,
    ipfsUrl: '',
    commitToIpfs: true,
  })

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

  await hre.run('chugsplash-propose', {
    configPath,
    ipfsUrl: '',
    silent,
  })

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

  await hre.run('chugsplash-approve', {
    configPath,
  })
}

deployConfigsForceCommit()
