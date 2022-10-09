import * as path from 'path'
import * as fs from 'fs'

import { Contract, ethers } from 'ethers'
import {
  ChugSplashConfig,
  getProxyAddress,
  loadChugSplashConfig,
  writeSnapshotId,
  getChugSplashRegistry,
} from '@chugsplash/core'
import {
  ChugSplashManagerABI,
  OWNER_BOND_AMOUNT,
  EXECUTOR_BOND_AMOUNT,
  DEFAULT_ADAPTER_ADDRESS,
} from '@chugsplash/contracts'

import { getContractArtifact } from './artifacts'

/**
 * TODO
 *
 * @param hre Hardhat Runtime Environment.
 * @param contractName Name of the contract in the config file.
 */
export const deployContracts = async (hre: any) => {
  const deployPromises = fs
    .readdirSync(hre.config.paths.chugsplash)
    .map(async (fileName) => {
      await deployChugSplashConfig(hre, fileName)
    })

  await Promise.all(deployPromises)
}

export const deployChugSplashConfig = async (hre: any, fileName: string) => {
  const signer = hre.ethers.provider.getSigner()

  const configRelativePath = path.format({
    dir: path.basename(hre.config.paths.chugsplash),
    ext: fileName,
  })

  const config: ChugSplashConfig = await hre.run('chugsplash-load', {
    deployConfig: configRelativePath,
  })

  await hre.run('chugsplash-register', {
    deployConfig: configRelativePath,
  })

  const { bundle, bundleId } = await hre.run('chugsplash-propose', {
    deployConfig: configRelativePath,
    local: true,
  })

  const ChugSplashRegistry = getChugSplashRegistry(signer)

  const ChugSplashManager = new Contract(
    await ChugSplashRegistry.projects(config.options.name),
    ChugSplashManagerABI,
    signer
  )

  if (
    (await ChugSplashRegistry.adapters(ethers.constants.HashZero)) ===
    ethers.constants.AddressZero
  ) {
    const tx = await ChugSplashRegistry.addProxyType(
      ethers.constants.HashZero,
      DEFAULT_ADAPTER_ADDRESS
    )
    await tx.wait()
  }

  const managerBalance = await hre.ethers.provider.getBalance(
    ChugSplashManager.address
  )
  if (managerBalance.lt(OWNER_BOND_AMOUNT)) {
    await signer.sendTransaction({
      value: OWNER_BOND_AMOUNT.sub(managerBalance),
      to: ChugSplashManager.address,
    })
  }

  await hre.run('chugsplash-approve', {
    projectName: config.options.name,
    bundleId,
  })

  const bundleState = await ChugSplashManager.bundles(bundleId)
  if (bundleState.selectedExecutor === ethers.constants.AddressZero) {
    const tx = await ChugSplashManager.claim(bundleId, {
      value: EXECUTOR_BOND_AMOUNT,
    })
    await tx.wait()
  }

  for (const action of bundle.actions) {
    const tx = await ChugSplashManager.executeChugSplashBundleAction(
      action.action,
      action.proof.actionIndex,
      action.proof.siblings
    )
    await tx.wait()
  }
}

export const getContract = async (
  hre: any,
  provider: ethers.providers.JsonRpcProvider,
  target: string
): Promise<ethers.Contract> => {
  if ((await hre.getChainId()) !== '31337') {
    throw new Error('Only the Hardhat Network is currently supported.')
  }
  const configsWithFileNames: {
    config: ChugSplashConfig
    configFileName: string
  }[] = fs
    .readdirSync(hre.config.paths.chugsplash)
    .map((configFileName) => {
      const config = loadChugSplashConfig(
        path.join('chugsplash', configFileName)
      )
      return { configFileName, config }
    })
    .filter(({ config }) => {
      return Object.keys(config.contracts).includes(target)
    })

  // TODO: Make function `getContract(projectName, target)` and change this error message.
  if (configsWithFileNames.length > 1) {
    throw new Error(
      `Multiple config files contain the target: ${target}. Target names must be unique for now. Config files containing ${target}: ${configsWithFileNames.map(
        (cfgWithFileName) => cfgWithFileName.configFileName
      )}\n`
    )
  } else if (configsWithFileNames.length === 0) {
    throw new Error(`Cannot find a config file containing ${target}.`)
  }

  const { config: cfg } = configsWithFileNames[0]

  const Proxy = new ethers.Contract(
    getProxyAddress(cfg.options.name, target),
    new ethers.utils.Interface(
      getContractArtifact(cfg.contracts[target].source).abi
    ),
    provider.getSigner()
  )

  if ((await provider.getCode(Proxy.address)) === '0x') {
    throw new Error(`The proxy for ${target} has not been deployed.`)
  }

  // const targets = hre.chugsplash.snapshots.map((snapshot) => snapshot.target)
  // if (!targets.includes(target)) {
  //   const snapshotId = await hre.network.provider.send('evm_snapshot', [])
  //   hre.chugsplash.snapshots.push({ target, snapshotId })
  // } else {
  //   const targetIndex = targets.indexOf(target)
  //   const targetSnapshotId = hre.chugsplash.snapshots[targetIndex].snapshotId
  //   const snapshotReverted = await hre.network.provider.send('evm_revert', [
  //     targetSnapshotId,
  //   ])
  //   if (!snapshotReverted) {
  //     throw new Error('Snapshot failed to be reverted.')
  //   }
  //   // Remove the snapshot that was just reverted from the array.
  //   const snapshots = hre.chugsplash.snapshots.slice(0, targetIndex)

  //   const snapshotId = await hre.network.provider.send('evm_snapshot', [])
  //   snapshots.push({ target, snapshotId })
  //   hre.chugsplash.snapshots = snapshots
  // }

  return Proxy
}

export const resetChugSplashDeployments = async (hre: any) => {
  const snapshotIdPath = path.join(
    path.basename(hre.config.paths.deployed),
    '31337',
    '.snapshotId'
  )
  const snapshotId = fs.readFileSync(snapshotIdPath, 'utf8')
  const snapshotReverted = await hre.network.provider.send('evm_revert', [
    snapshotId,
  ])
  if (!snapshotReverted) {
    throw new Error('Snapshot failed to be reverted.')
  }
  await writeSnapshotId(hre)
}
