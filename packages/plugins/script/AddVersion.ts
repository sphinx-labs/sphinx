import {
  AuthABI,
  AuthArtifact,
  AuthFactoryABI,
  EXECUTION_LOCK_TIME,
  OWNER_MULTISIG_ADDRESS,
  SphinxManagerABI,
  SphinxManagerArtifact,
} from '@sphinx-labs/contracts'
import {
  AUTH_FACTORY_ADDRESS,
  DEFAULT_CREATE3_ADDRESS,
  SphinxJsonRpcProvider,
  doDeterministicDeploy,
  getImpersonatedSigner,
  getManagedServiceAddress,
  getSphinxRegistry,
  getSphinxRegistryAddress,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'

/**
 * Adds a new version of the SphinxManager and Auth contracts to the SphinxRegistry and AuthFactory.
 * Used for testing version upgrades.
 */
const main = async () => {
  const rpcUrls = ['http://127.0.0.1:42005', 'http://127.0.0.1:42420']

  for (const rpcUrl of rpcUrls) {
    const provider = new SphinxJsonRpcProvider(rpcUrl)

    const systemOwner = await getImpersonatedSigner(
      OWNER_MULTISIG_ADDRESS,
      provider
    )

    // Deploy new auth and manager implementations on all chains for testing upgrades
    const NewManagerImplementation = await doDeterministicDeploy(provider, {
      signer: systemOwner,
      contract: {
        abi: SphinxManagerABI,
        bytecode: SphinxManagerArtifact.bytecode,
      },
      args: [
        getSphinxRegistryAddress(),
        DEFAULT_CREATE3_ADDRESS,
        getManagedServiceAddress(
          await provider.getNetwork().then((n) => n.chainId)
        ),
        EXECUTION_LOCK_TIME,
        [9, 9, 9],
      ],
      salt: ethers.ZeroHash,
    })

    const NewAuthImplementation = await doDeterministicDeploy(provider, {
      signer: systemOwner,
      contract: {
        abi: AuthABI,
        bytecode: AuthArtifact.bytecode,
      },
      args: [[9, 9, 9]],
      salt: ethers.ZeroHash,
    })

    const SphinxRegistry = getSphinxRegistry(systemOwner)
    await (
      await SphinxRegistry.addVersion(
        await NewManagerImplementation.getAddress()
      )
    ).wait()

    const AuthFactory = new ethers.Contract(
      AUTH_FACTORY_ADDRESS,
      AuthFactoryABI,
      systemOwner
    )
    await (
      await AuthFactory.addVersion(await NewAuthImplementation.getAddress())
    ).wait()
  }
}

main()
