import * as path from 'path'
import * as fs from 'fs'

import '@nomiclabs/hardhat-ethers'
import { Contract, ethers } from 'ethers'
import {
  ChugSplashConfig,
  getProxyAddress,
  loadChugSplashConfig,
  isSetImplementationAction,
  fromRawChugSplashAction,
  isEmptyChugSplashConfig,
  registerChugSplashProject,
  ChugSplashBundleState,
  ChugSplashBundleStatus,
  isProxyDeployed,
  getChugSplashManagerProxyAddress,
  parseChugSplashConfig,
  createDeploymentFolderForNetwork,
  writeDeploymentArtifact,
  log,
} from '@chugsplash/core'
import {
  ChugSplashManagerABI,
  OWNER_BOND_AMOUNT,
  EXECUTOR_BOND_AMOUNT,
  ProxyABI,
} from '@chugsplash/contracts'
import { getChainId } from '@eth-optimism/core-utils'

import {
  getContractArtifact,
  getStorageLayout,
  getBuildInfo,
  getConstructorArgs,
} from './artifacts'
import { writeHardhatSnapshotId } from './utils'

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
  const parsedConfig = parseChugSplashConfig(config)

  log(`Deploying: ${parsedConfig.options.projectName}`, hide)

  // Register the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the project owner specified in the config.
  await registerChugSplashProject(
    parsedConfig.options.projectName,
    deployerAddress,
    deployer
  )

  const { bundleId } = await hre.run('chugsplash-commit', {
    deployConfig: configRelativePath,
    local: false,
    log: verbose,
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

  const { bundle } = await hre.run('chugsplash-propose', {
    deployConfig: configRelativePath,
    local: true,
    log: verbose,
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
    projectName: parsedConfig.options.projectName,
    bundleId,
    log: verbose,
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
  let finalDeploymentTxnHash: string
  let finalDeploymentReceipt: any
  if (bundleState.status !== ChugSplashBundleStatus.COMPLETED) {
    const setImplActions = bundle.actions.slice(
      firstSetImplementationActionIndex
    )
    const finalDeploymentTxn = await ChugSplashManager.completeChugSplashBundle(
      setImplActions.map((action) => action.action),
      setImplActions.map((action) => action.proof.actionIndex),
      setImplActions.map((action) => action.proof.siblings)
    )
    finalDeploymentReceipt = await finalDeploymentTxn.wait()
    finalDeploymentTxnHash = finalDeploymentTxn.hash
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
  for (const referenceName of Object.keys(parsedConfig.contracts)) {
    // First, check if the Proxy's owner is the ChugSplashManager by getting the latest
    // `AdminChanged` event on the Proxy.
    const Proxy = new ethers.Contract(
      getProxyAddress(parsedConfig.options.projectName, referenceName),
      new ethers.utils.Interface(ProxyABI),
      deployer
    )
    const { args } = (await Proxy.queryFilter('AdminChanged')).at(-1)
    if (args.newAdmin === ChugSplashManager.address) {
      await (
        await ChugSplashManager.transferProxyOwnership(
          referenceName,
          parsedConfig.options.projectOwner
        )
      ).wait()
    }
  }

  if (parsedConfig.options.projectOwner !== (await ChugSplashManager.owner())) {
    if (parsedConfig.options.projectOwner === ethers.constants.AddressZero) {
      await (await ChugSplashManager.renounceOwnership()).wait()
    } else {
      await (
        await ChugSplashManager.transferOwnership(
          parsedConfig.options.projectOwner
        )
      ).wait()
    }
  }

  if ((await getChainId(hre.ethers.provider)) !== 31337) {
    createDeploymentFolderForNetwork(
      hre.network.name,
      hre.config.paths.deployed
    )

    for (const [referenceName, contractConfig] of Object.entries(
      parsedConfig.contracts
    )) {
      const artifact = getContractArtifact(contractConfig.contract)
      const { sourceName, contractName, bytecode, abi } = artifact

      const buildInfo = await getBuildInfo(sourceName, contractName)
      const output = buildInfo.output.contracts[sourceName][contractName]
      const immutableReferences: {
        [astId: number]: {
          length: number
          start: number
        }[]
      } = output.evm.deployedBytecode.immutableReferences

      const metadata =
        buildInfo.output.contracts[sourceName][contractName].metadata
      const { devdoc, userdoc } = JSON.parse(metadata).output
      const { constructorArgValues } = await getConstructorArgs(
        parsedConfig,
        referenceName,
        abi,
        buildInfo.output.sources,
        immutableReferences
      )
      const deploymentArtifact = {
        contractName,
        address: contractConfig.address,
        abi,
        transactionHash: finalDeploymentTxnHash,
        solcInputHash: buildInfo.id,
        receipt: finalDeploymentReceipt,
        numDeployments: 1,
        metadata,
        args: constructorArgValues,
        bytecode,
        deployedBytecode: await hre.ethers.provider.getCode(
          contractConfig.address
        ),
        devdoc,
        userdoc,
        storageLayout: await getStorageLayout(contractConfig.contract),
      }

      writeDeploymentArtifact(
        hre.network.name,
        hre.config.paths.deployed,
        deploymentArtifact,
        referenceName
      )
    }
  }

  if (!hide) {
    const deployments = {}
    Object.entries(parsedConfig.contracts).forEach(
      ([referenceName, contractConfig], i) =>
        (deployments[i + 1] = {
          Reference: referenceName,
          Contract: contractConfig.contract,
          Address: contractConfig.address,
        })
    )
    console.table(deployments)
  }

  log(`Deployed: ${parsedConfig.options.projectName}`, hide)
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
      const config = loadChugSplashConfig(
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
