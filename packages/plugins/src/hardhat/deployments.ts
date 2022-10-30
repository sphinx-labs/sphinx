import * as path from 'path'
import * as fs from 'fs'

import '@nomiclabs/hardhat-ethers'
import { Contract, ethers } from 'ethers'
import {
  ChugSplashConfig,
  getProxyAddress,
  loadChugSplashConfig,
  writeSnapshotId,
  getChugSplashRegistry,
  isSetImplementationAction,
  ChugSplashActionBundle,
  fromRawChugSplashAction,
  isEmptyChugSplashConfig,
  registerChugSplashProject,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
} from '@chugsplash/core'
import {
  ChugSplashManagerABI,
  OWNER_BOND_AMOUNT,
  EXECUTOR_BOND_AMOUNT,
  ProxyABI,
} from '@chugsplash/contracts'
import ora from 'ora'

import { getContractArtifact } from './artifacts'

/**
 * TODO
 *
 * @param hre Hardhat Runtime Environment.
 * @param contractName Name of the contract in the config file.
 */
export const deployContracts = async (
  hre: any,
  verbose: boolean,
  hide: boolean
) => {
  const fileNames = fs.readdirSync(hre.config.paths.chugsplash)
  for (const fileName of fileNames) {
    await deployChugSplashConfig(hre, fileName, verbose, hide)
  }
}

export const deployChugSplashConfig = async (
  hre: any,
  fileName: string,
  verbose: boolean,
  hide: boolean
) => {
  const configRelativePath = path.format({
    dir: path.basename(hre.config.paths.chugsplash),
    ext: fileName,
  })

  // Skip this config if it's empty.
  if (isEmptyChugSplashConfig(configRelativePath)) {
    return
  }

  const deployer = hre.ethers.provider.getSigner()
  const deployerAddress = await deployer.getAddress()

  const config: ChugSplashConfig = await hre.run('chugsplash-load', {
    deployConfig: configRelativePath,
  })

  const spinner = ora({ isSilent: hide })
  spinner.start(`Deploying: ${config.options.projectName}`)

  // Register the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the project owner specified in the config.
  await registerChugSplashProject(
    config.options.projectName,
    deployerAddress,
    deployer
  )

  const {
    bundle,
    bundleId,
  }: { bundle: ChugSplashActionBundle; bundleId: string } = await hre.run(
    'chugsplash-propose',
    {
      deployConfig: configRelativePath,
      local: true,
      verbose,
    }
  )

  const ChugSplashRegistry = getChugSplashRegistry(deployer)

  const ChugSplashManager = new Contract(
    await ChugSplashRegistry.projects(config.options.projectName),
    ChugSplashManagerABI,
    deployer
  )

  const bundleState: ChugSplashBundleState = await ChugSplashManager.bundles(
    bundleId
  )

  if (bundleState.status === ChugSplashBundleStatus.CANCELLED) {
    spinner.fail(`"${config.options.projectName}" was previously cancelled.`)
    return
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
    projectName: config.options.projectName,
    bundleId,
    verbose,
  })

  if (bundleState.selectedExecutor === ethers.constants.AddressZero) {
    const tx = await ChugSplashManager.claimBundle({
      value: EXECUTOR_BOND_AMOUNT,
    })
    await tx.wait()
  }

  // Execute the SetCode and DeployImplementation actions that have not been executed yet. Note that
  // the SetImplementation actions have already been sorted so that they are at the end of the
  // actions array.
  const firstSetImplementationActionIndex = bundle.actions.findIndex((action) =>
    isSetImplementationAction(fromRawChugSplashAction(action.action))
  )
  for (
    let i = bundleState.actionsExecuted;
    i < firstSetImplementationActionIndex;
    i++
  ) {
    const action = bundle.actions[i]
    const tx = await ChugSplashManager.executeChugSplashAction(
      action.action,
      action.proof.actionIndex,
      action.proof.siblings
    )
    await tx.wait()
  }

  // If the bundle hasn't already been completed in an earlier call, complete the bundle by
  // executing all the SetImplementation actions in a single transaction.
  if (bundleState.status !== ChugSplashBundleStatus.COMPLETED) {
    const setImplActions = bundle.actions.slice(
      firstSetImplementationActionIndex
    )
    const txn = await ChugSplashManager.completeChugSplashBundle(
      setImplActions.map((action) => action.action),
      setImplActions.map((action) => action.proof.actionIndex),
      setImplActions.map((action) => action.proof.siblings)
    )
    await txn.wait()
  }

  // Withdraw all available funds from the ChugSplashManager.
  const totalDebt = await ChugSplashManager.totalDebt()
  const chugsplashManagerBalance = await hre.ethers.provider.getBalance(
    ChugSplashManager.address
  )
  if (chugsplashManagerBalance.sub(totalDebt).gt(0)) {
    await (await ChugSplashManager.withdrawOwnerETH()).wait()
  }
  const deployerDebt = await ChugSplashManager.debt(deployerAddress)
  if (deployerDebt.gt(0)) {
    await (await ChugSplashManager.claimExecutorPayment()).wait()
  }

  // Transfer ownership of the deployments to the project owner.
  for (const referenceName of Object.keys(config.contracts)) {
    // First, check if the Proxy's owner is the ChugSplashManager by getting the latest
    // `AdminChanged` event on the Proxy.
    const Proxy = new ethers.Contract(
      getProxyAddress(config.options.projectName, referenceName),
      new ethers.utils.Interface(ProxyABI),
      deployer
    )
    const { args } = (await Proxy.queryFilter('AdminChanged')).at(-1)
    if (args.newAdmin === ChugSplashManager.address) {
      await (
        await ChugSplashManager.transferProxyOwnership(
          referenceName,
          config.options.projectOwner
        )
      ).wait()
    }
  }

  if (config.options.projectOwner !== (await ChugSplashManager.owner())) {
    if (config.options.projectOwner === ethers.constants.AddressZero) {
      await (await ChugSplashManager.renounceOwnership()).wait()
    } else {
      await (
        await ChugSplashManager.transferOwnership(config.options.projectOwner)
      ).wait()
    }
  }

  spinner.succeed(`Deployed: ${config.options.projectName}`)

  if (!hide) {
    const deployments = {}
    Object.entries(config.contracts).forEach(
      ([referenceName, contractConfig], i) =>
        (deployments[i + 1] = {
          Reference: referenceName,
          Contract: contractConfig.contract,
          Address: contractConfig.address,
        })
    )
    console.table(deployments)
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
    getProxyAddress(cfg.options.projectName, target),
    new ethers.utils.Interface(
      getContractArtifact(cfg.contracts[target].contract).abi
    ),
    provider.getSigner()
  )

  if ((await provider.getCode(Proxy.address)) === '0x') {
    throw new Error(`You must first deploy ${target}.`)
  }

  return Proxy
}

export const resetChugSplashDeployments = async (hre: any) => {
  const networkFolderName =
    hre.network.name === 'localhost' ? '31337-localhost' : '31337-hardhat'
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
  await writeSnapshotId(hre)
}
