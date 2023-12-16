import { join } from 'path'

import {
  getReadableActions,
  ParsedConfig,
  addSphinxWalletsToGnosisSafeOwners,
  findLeafWithProof,
  fundAccount,
  getMappingValueSlotKey,
  getSphinxWalletPrivateKey,
  findStorageSlotKey,
  removeSphinxWalletsFromGnosisSafeOwners,
  signMerkleRoot,
  RELAYER_ROLE,
  executeBatchActions,
  getGasPriceOverrides,
  MerkleRootStatus,
  EstimateGas,
  ExecuteActions,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import {
  SphinxLeafWithProof,
  GnosisSafeProxyFactoryArtifact,
  ManagedServiceArtifact,
  getGnosisSafeAddress,
  getGnosisSafeProxyFactoryAddress,
  SphinxMerkleTree,
  SphinxModuleABI,
  SphinxLeafType,
  getManagedServiceAddress,
} from '@sphinx-labs/contracts'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

type simulateDeploymentSubtaskArgs = {
  merkleTree: SphinxMerkleTree
  parsedConfig: ParsedConfig
  config: string
  estimateGas: EstimateGas
  executeActions: ExecuteActions
}

export const simulate = async (
  parsedConfig: ParsedConfig,
  merkleTree: SphinxMerkleTree,
  rpcUrl: string,
  estimateGas: EstimateGas,
  executeActions: ExecuteActions
): Promise<{
  receipts: Array<ethers.TransactionReceipt>
  batches: Array<Array<SphinxLeafWithProof>>
}> => {
  const initialHardhatConfigEnvVar = process.env['HARDHAT_CONFIG']
  process.env['HARDHAT_CONFIG'] = join('dist', 'hardhat.config.js')
  process.env['SPHINX_INTERNAL__FORK_URL'] = rpcUrl
  process.env['SPHINX_INTERNAL__CHAIN_ID'] = parsedConfig.chainId
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const hre = require('hardhat')

  const rootPluginPath =
    process.env.DEV_FILE_PATH ?? join('node_modules', '@sphinx-labs', 'plugins')
  const hardhatConfigPath = join(rootPluginPath, 'dist', 'hardhat.config.js')

  const taskParams: simulateDeploymentSubtaskArgs = {
    parsedConfig,
    merkleTree,
    config: hardhatConfigPath,
    estimateGas,
    executeActions,
  }
  const {
    receipts,
    batches,
  }: Awaited<ReturnType<typeof simulateDeploymentSubtask>> = await hre.run(
    'sphinxSimulateDeployment',
    taskParams
  )

  process.env['HARDHAT_CONFIG'] = initialHardhatConfigEnvVar
  delete process.env['SPHINX_INTERNAL__FORK_URL']
  delete process.env['SPHINX_INTERNAL__CHAIN_ID']

  return { receipts, batches }
}

export const simulateDeploymentSubtask = async (
  taskArgs: simulateDeploymentSubtaskArgs,
  hre: any
): Promise<{
  receipts: Array<ethers.TransactionReceipt>
  batches: Array<Array<SphinxLeafWithProof>>
}> => {
  const { merkleTree, parsedConfig, estimateGas, executeActions } = taskArgs

  const provider: HardhatEthersProvider = hre.ethers.provider

  const humanReadableActions = {
    [parsedConfig.chainId]: getReadableActions(parsedConfig.actionInputs),
  }

  // TODO(later): for deploying on anvil, where do we fund `firstSphinxWallet`?

  const firstSphinxPrivateKey = getSphinxWalletPrivateKey(0)
  const firstSphinxWallet = new ethers.Wallet(firstSphinxPrivateKey, provider)
  await fundAccount(firstSphinxWallet.address, provider)

  await setManagedServiceRelayer(firstSphinxWallet.address, provider)

  const sphinxModule = new ethers.Contract(
    parsedConfig.moduleAddress,
    SphinxModuleABI,
    firstSphinxWallet
  )

  const receipts: Array<ethers.TransactionReceipt> = []

  if (!parsedConfig.initialState.isSafeDeployed) {
    // TODO(docs): explain why we can't broadcast on Anvil for this. (it's because Anvil doesn't
    // have access to the in-process Hardhat node).
    const gnosisSafeProxyFactory = new ethers.Contract(
      getGnosisSafeProxyFactoryAddress(),
      GnosisSafeProxyFactoryArtifact.abi,
      firstSphinxWallet
    )
    const gnosisSafeDeploymentReceipt = await (
      await gnosisSafeProxyFactory.createProxyWithNonce(
        getGnosisSafeAddress(),
        parsedConfig.safeInitData,
        parsedConfig.newConfig.saltNonce,
        await getGasPriceOverrides(firstSphinxWallet) // TODO: is there anything in `getGasPriceOverrides` that could cause the deployment to break on Hardhat?
      )
    ).wait()
    receipts.push(gnosisSafeDeploymentReceipt)
  }

  // Before we can approve the deployment on Anvil, we must add a set of auto-generated wallets
  // as owners of the Gnosis Safe. This allows us to approve the deployment without knowing the
  // private keys of the actual Gnosis Safe owners. We don't do this in a Forge script because
  // we'd need to broadcast from the Gnosis Safe's address in order for the transactions to
  // succeed, but we can't broadcast from a contract onto a standalone network.
  const sphinxWallets = await addSphinxWalletsToGnosisSafeOwners(
    parsedConfig.safeAddress,
    provider
  )

  // TODO(docs): explain why we approve here even though there's approval logic in the
  // `executeDeployment` function. (it's so we can remove the auto-generated addresses as gnosis
  // safe owners).
  // TODO(docs): explain why we can't broadcast on Anvil.
  const approvalLeafWithProof = findLeafWithProof(
    merkleTree,
    SphinxLeafType.APPROVE,
    BigInt(parsedConfig.chainId)
  )

  const managedService = new ethers.Contract(
    getManagedServiceAddress(),
    ManagedServiceArtifact.abi,
    firstSphinxWallet
  )
  const ownerSignatures = await Promise.all(
    sphinxWallets.map((wallet) => signMerkleRoot(merkleTree.root, wallet))
  )
  const packedOwnerSignatures = ethers.solidityPacked(
    new Array(ownerSignatures.length).fill('bytes'),
    ownerSignatures
  )

  const approvalData = sphinxModule.interface.encodeFunctionData('approve', [
    merkleTree.root,
    approvalLeafWithProof,
    packedOwnerSignatures,
  ])
  const approvalReceipt = await (
    await managedService.exec(
      parsedConfig.moduleAddress,
      approvalData,
      await getGasPriceOverrides(firstSphinxWallet)
    )
  ).wait()

  receipts.push(approvalReceipt)

  // Remove the auto-generated wallets that are currently Gnosis Safe owners. This isn't
  // strictly necessary, but it ensures that the Gnosis Safe owners and threshold match the
  // production environment when we broadcast the deployment on Anvil.
  await removeSphinxWalletsFromGnosisSafeOwners(
    sphinxWallets,
    parsedConfig.safeAddress,
    provider
  )

  const networkLeaves = merkleTree.leavesWithProofs.filter(
    (leaf) => leaf.leaf.chainId === BigInt(parsedConfig.chainId)
  )
  const { status, failureAction, executionReceipts, batches } =
    await executeBatchActions(
      networkLeaves,
      BigInt(parsedConfig.chainId),
      sphinxModule,
      BigInt(parsedConfig.blockGasLimit),
      humanReadableActions,
      firstSphinxWallet,
      executeActions,
      estimateGas
    )

  if (status === MerkleRootStatus.FAILED) {
    if (failureAction) {
      throw new Error(
        `Failed to execute deployment because the following action reverted:\n"${failureAction}`
      )
    } else {
      throw new Error(`Deployment failed.`)
    }
  }

  receipts.push(...executionReceipts)

  return { receipts, batches }
}

const setManagedServiceRelayer = async (
  address: string,
  provider: HardhatEthersProvider
) => {
  const managedServiceAddress = getManagedServiceAddress()
  const accessControlRoleSlotKey = findStorageSlotKey(
    ManagedServiceArtifact.storageLayout,
    '_roles'
  )
  const roleSlotKey = getMappingValueSlotKey(
    accessControlRoleSlotKey,
    RELAYER_ROLE
  )
  const memberSlotKey = getMappingValueSlotKey(
    roleSlotKey,
    ethers.zeroPadValue(ethers.toBeHex(address), 32)
  )

  await provider.send('hardhat_setStorageAt', [
    managedServiceAddress,
    memberSlotKey,
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  ])
}
