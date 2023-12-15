import {
  GnosisSafeProxyFactoryArtifact,
  ManagedServiceArtifact,
  SphinxLeafType,
  SphinxMerkleTree,
  SphinxModuleABI,
  getGnosisSafeAddress,
  getGnosisSafeProxyFactoryAddress,
  getManagedServiceAddress,
} from '@sphinx-labs/contracts'
import {
  ParsedConfig,
  addSphinxWalletsToGnosisSafeOwners,
  executeDeployment,
  findLeafWithProof,
  fundAccount,
  getImpersonatedSigner,
  getMappingValueSlotKey,
  getReadableActions,
  getSphinxWalletPrivateKey,
  findStorageSlotKey,
  removeSphinxWalletsFromGnosisSafeOwners,
  signMerkleRoot,
  stopImpersonatingAccount,
  RELAYER_ROLE,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'

export type SimulateDeploymentTaskArgs = {
  merkleTree: SphinxMerkleTree
  parsedConfig: ParsedConfig
  config: string
}

export const simulateDeploymentTask = async (
  taskArgs: SimulateDeploymentTaskArgs,
  hre: any
): Promise<Array<ethers.TransactionReceipt>> => {
  const { merkleTree, parsedConfig } = taskArgs

  const provider: HardhatEthersProvider = hre.ethers.provider

  const humanReadableActions = {
    [parsedConfig.chainId]: getReadableActions(parsedConfig.actionInputs),
  }

  const firstSphinxPrivateKey = getSphinxWalletPrivateKey(0)
  const firstSphinxWallet = new ethers.Wallet(firstSphinxPrivateKey, provider)
  await fundAccount(firstSphinxWallet.address, provider)

  await setManagedServiceRelayer(firstSphinxWallet.address, provider)

  const sphinxModule = new ethers.Contract(
    parsedConfig.moduleAddress,
    SphinxModuleABI,
    provider
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
        parsedConfig.newConfig.saltNonce
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
  const approveLeafWithProof = findLeafWithProof(
    merkleTree,
    SphinxLeafType.APPROVE,
    BigInt(parsedConfig.chainId)
  )

  const ownerSignatures = await Promise.all(
    sphinxWallets.map((wallet) => signMerkleRoot(merkleTree.root, wallet))
  )
  const packedOwnerSignatures = ethers.solidityPacked(
    new Array(ownerSignatures.length).fill('bytes'),
    ownerSignatures
  )

  const managedServiceAddress = getManagedServiceAddress()
  const managedServiceSigner = await getImpersonatedSigner(
    managedServiceAddress,
    provider
  )
  await fundAccount(managedServiceAddress, provider)
  const approvalReceipt = await (
    await sphinxModule.connect(managedServiceSigner).getFunction('approve')(
      merkleTree.root,
      approveLeafWithProof,
      packedOwnerSignatures
    )
  ).wait()
  await stopImpersonatingAccount(managedServiceAddress, provider)
  receipts.push(approvalReceipt)

  // Remove the auto-generated wallets that are currently Gnosis Safe owners. This isn't
  // strictly necessary, but it ensures that the Gnosis Safe owners and threshold match the
  // production environment when we broadcast the deployment on Anvil.
  await removeSphinxWalletsFromGnosisSafeOwners(
    sphinxWallets,
    parsedConfig.safeAddress,
    provider
  )

  const { success, receipts: executionReceipts } = await executeDeployment(
    sphinxModule,
    merkleTree,
    ownerSignatures,
    humanReadableActions,
    BigInt(parsedConfig.blockGasLimit),
    provider,
    firstSphinxWallet
  )

  if (!success) {
    throw new Error(`TODO: humanreadableaction if it exists`)
  }

  receipts.push(...executionReceipts)

  return receipts
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
