import { exec } from 'child_process'
import { resolve } from 'path'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  CURRENT_SPHINX_MANAGER_VERSION,
  SphinxConfig,
  SphinxJsonRpcProvider,
  execAsync,
  getAuthAddress,
  getSphinxManagerAddress,
  spawnAsync,
  AUTH_FACTORY_ADDRESS,
  DEFAULT_CREATE3_ADDRESS,
  doDeterministicDeploy,
  getImpersonatedSigner,
  getManagedServiceAddress,
  getSphinxRegistry,
  getSphinxRegistryAddress,
  getSphinxRegistryReadOnly,
  getSphinxManagerReadOnly,
  getEIP1967ProxyImplementationAddress,
  getSphinxManagerImplAddress,
  CURRENT_SPHINX_AUTH_VERSION,
  getAuthImplAddress,
} from '@sphinx-labs/core'
import {
  AuthABI,
  AuthArtifact,
  AuthFactoryABI,
  EXECUTION_LOCK_TIME,
  OWNER_MULTISIG_ADDRESS,
  SphinxManagerABI,
  SphinxManagerArtifact,
} from '@sphinx-labs/contracts'
import { ethers } from 'ethers'

import { deploy } from '../../../src/cli/deploy'
import { buildParsedConfigArray } from '../../../src/cli/propose'
import {
  FoundryToml,
  getFoundryConfigOptions,
} from '../../../src/foundry/options'
import { getBundleInfoArray } from '../../../src/foundry/utils'

chai.use(chaiAsPromised)
const expect = chai.expect

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
const mockPrompt = async (q: string) => {}

const scriptPath = 'test/foundry/Proposal.t.sol'
const isTestnet = true

const proposerAddress = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'
const sphinxConfig: SphinxConfig = {
  projectName: 'Multisig project',
  // Accounts #0-3 on Anvil
  owners: [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  ],
  // Account #4 on Anvil
  proposers: [proposerAddress],
  threshold: '3',
  mainnets: [],
  testnets: ['goerli', 'optimism_goerli'],
  orgId: '1111',
  version: CURRENT_SPHINX_MANAGER_VERSION,
}

describe('Simulate proposal', () => {
  let foundryToml: FoundryToml
  let authAddress: string
  let managerAddress: string
  before(async () => {
    await execAsync('yarn test:kill')

    exec('anvil --silent --chain-id 5 --port 42005 &')
    exec('anvil --silent --chain-id 420 --port 42420 &')
    exec('anvil --silent --chain-id 10200 --port 42200 &')
    exec('anvil --silent --chain-id 421613 --port 42613 &')

    authAddress = getAuthAddress(
      sphinxConfig.owners,
      Number(sphinxConfig.threshold),
      sphinxConfig.projectName
    )
    managerAddress = getSphinxManagerAddress(
      authAddress,
      sphinxConfig.projectName
    )
    foundryToml = await getFoundryConfigOptions()
  })

  after(async () => {
    await execAsync(`yarn test:kill`)
  })

  // TODO: .only
  it.only('Simulates proposal for a project that has not been deployed on any network yet', async () => {
    for (const network of sphinxConfig.testnets) {
      const rpcUrl = foundryToml.rpcEndpoints[network.toString()]
      // Narrow the type of `rpcUrl` to string
      if (!rpcUrl) {
        throw new Error(`Could not find RPC. Should never happen.`)
      }
      const provider = new SphinxJsonRpcProvider(rpcUrl)

      expect(await provider.getCode(authAddress)).equals('0x')
    }

    await testProposalSimulation('Proposal_Initial_Test', foundryToml)
  })

  describe('After deployment is completed on initial networks', async () => {
    before(async () => {
      for (const network of sphinxConfig.testnets) {
        await deploy(
          scriptPath,
          network.toString(),
          true, // Skip preview
          true, // Silent
          'Proposal_Initial_Test',
          false, // Don't verify on Etherscan
          undefined,
          mockPrompt
        )
      }
    })

    it('Simulates proposal for a project that was previously deployed', async () => {
      for (const network of sphinxConfig.testnets) {
        const rpcUrl = foundryToml.rpcEndpoints[network.toString()]
        // Narrow the type of `rpcUrl` to string
        if (!rpcUrl) {
          throw new Error(`Could not find RPC. Should never happen.`)
        }
        const provider = new SphinxJsonRpcProvider(rpcUrl)

        expect(await provider.getCode(authAddress)).does.not.equal('0x')
      }

      await testProposalSimulation('Proposal_AddContract_Test', foundryToml)
    })

    it('Simulates proposal for project that has a SphinxManager version upgrade', async () => {
      let newAuthImplAddress: string | undefined
      let newManagerImplAddressStandard: string | undefined
      let newManagerImplAddressOptimismGoerli: string | undefined
      for (const network of sphinxConfig.testnets) {
        newAuthImplAddress = ''
        const rpcUrl = foundryToml.rpcEndpoints[network.toString()]
        // Narrow the type of `rpcUrl` to string
        if (!rpcUrl) {
          throw new Error(`Could not find RPC. Should never happen.`)
        }
        const provider = new SphinxJsonRpcProvider(rpcUrl)

        const auth = new ethers.Contract(authAddress, AuthABI, provider)
        const manager = getSphinxManagerReadOnly(managerAddress, provider)
        const registry = getSphinxRegistryReadOnly(provider)
        const authFactory = new ethers.Contract(
          AUTH_FACTORY_ADDRESS,
          AuthFactoryABI,
          provider
        )

        expect(await provider.getCode(authAddress)).does.not.equal('0x')

        const { newManagerImpl, newAuthImpl } = await deployNewVersion(provider)
        newAuthImplAddress = newAuthImpl
        if (network === 'optimism_goerli') {
          newManagerImplAddressOptimismGoerli = newManagerImpl
        } else {
          newManagerImplAddressStandard = newManagerImpl
        }

        expect(await registry.managerImplementations(newManagerImpl)).equals(
          true
        )
        expect(await authFactory.authImplementations(newAuthImpl)).equals(true)

        const chainId = await provider.getNetwork().then((n) => n.chainId)
        const currentManagerImpl = getSphinxManagerImplAddress(
          chainId,
          CURRENT_SPHINX_MANAGER_VERSION
        )
        const currentAuthImpl = getAuthImplAddress(CURRENT_SPHINX_AUTH_VERSION)

        const authVersion: Array<bigint> = await auth.version()
        const managerVersion: Array<bigint> = await manager.version()
        const expectedAuthVersion = Object.values(
          CURRENT_SPHINX_AUTH_VERSION
        ).map((v) => BigInt(v))
        const expectedManagerVersion = Object.values(
          CURRENT_SPHINX_MANAGER_VERSION
        ).map((v) => BigInt(v))
        expect(authVersion).deep.equals(expectedAuthVersion)
        expect(managerVersion).deep.equals(expectedManagerVersion)

        expect(
          await getEIP1967ProxyImplementationAddress(provider, authAddress)
        ).equals(currentAuthImpl)
        expect(
          await getEIP1967ProxyImplementationAddress(provider, managerAddress)
        ).equals(currentManagerImpl)
      }

      if (
        !newAuthImplAddress ||
        !newManagerImplAddressStandard ||
        !newManagerImplAddressOptimismGoerli
      ) {
        throw new Error(
          `Did not load upgraded impl addresses. Should never happen.`
        )
      }

      process.env['SPHINX_INTERNAL__TEST_VERSION_UPGRADE'] = 'true'
      await testProposalSimulation(
        'Proposal_VersionUpgrade_Test',
        foundryToml,
        {
          NEW_AUTH_IMPL_ADDR: newAuthImplAddress,
          NEW_MANAGER_IMPL_ADDR_STANDARD: newManagerImplAddressStandard,
          NEW_MANAGER_IMPL_ADDR_OPTIMISM_GOERLI:
            newManagerImplAddressOptimismGoerli,
        }
      )
    })

    it('Tests a proposal for a project with a previously failed deployment', async () => {
      for (const network of sphinxConfig.testnets) {
        const rpcUrl = foundryToml.rpcEndpoints[network.toString()]
        // Narrow the type of `rpcUrl` to string
        if (!rpcUrl) {
          throw new Error(`Could not find RPC. Should never happen.`)
        }

        // Run the test that that cancels a previous deployment. First, we set the storage value of the
        // `activeDeploymentId` in the SphinxManager to be non-zero. This replicates what happens when a
        // previous deployment is 'stuck' and needs to be cancelled.
        await execAsync(
          `cast rpc --rpc-url ${rpcUrl} anvil_setStorageAt ${managerAddress} 0x0000000000000000000000000000000000000000000000000000000000000099 0x1111111111111111111111111111111111111111111111111111111111111111`
        )
        // Bump the block number on both networks. Necessary to make the previous RPC methods take effect.
        await execAsync(`cast rpc --rpc-url ${rpcUrl} anvil_mine`)

        const provider = new SphinxJsonRpcProvider(rpcUrl)
        const manager = getSphinxManagerReadOnly(managerAddress, provider)
        const auth = new ethers.Contract(authAddress, AuthABI, provider)
        expect(await manager.isExecuting()).equals(true)
        expect(await auth.firstProposalOccurred()).equals(true)
      }

      await testProposalSimulation(
        'Proposal_CancelExistingDeployment_Test',
        foundryToml
      )
    })
  })
})

const deployNewVersion = async (
  provider: SphinxJsonRpcProvider
): Promise<{
  newAuthImpl: string
  newManagerImpl: string
}> => {
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
    await SphinxRegistry.addVersion(await NewManagerImplementation.getAddress())
  ).wait()

  const AuthFactory = new ethers.Contract(
    AUTH_FACTORY_ADDRESS,
    AuthFactoryABI,
    systemOwner
  )
  await (
    await AuthFactory.addVersion(await NewAuthImplementation.getAddress())
  ).wait()

  return {
    newManagerImpl: await NewManagerImplementation.getAddress(),
    newAuthImpl: await NewAuthImplementation.getAddress(),
  }
}

const testProposalSimulation = async (
  testContractName: string,
  foundryToml: FoundryToml,
  envVars?: NodeJS.ProcessEnv
) => {
  const { parsedConfigArray, configArtifacts } = await buildParsedConfigArray(
    scriptPath,
    proposerAddress,
    isTestnet,
    testContractName,
    undefined // No spinner.
  )

  const { authRoot, bundleInfoArray } = await getBundleInfoArray(
    configArtifacts,
    parsedConfigArray
  )

  const sphinxPluginTypesABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${foundryToml.artifactFolder}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
    )).abi
  const iface = new ethers.Interface(sphinxPluginTypesABI)
  const bundleInfoArrayFragment = iface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'bundleInfoArrayType')
  if (!bundleInfoArrayFragment) {
    throw new Error(
      `'bundleInfoArrayType' not found in ABI. Should never happen.`
    )
  }

  const coder = ethers.AbiCoder.defaultAbiCoder()
  const encodedBundleInfoArray = coder.encode(bundleInfoArrayFragment.outputs, [
    bundleInfoArray,
  ])

  const { code, stdout, stderr } = await spawnAsync(
    `forge`,
    ['test', '--match-contract', testContractName],
    {
      AUTH_ROOT: authRoot,
      BUNDLE_INFO_ARRAY: encodedBundleInfoArray,
      ...envVars,
    }
  )
  expect(code).equals(0, `${stderr}\n${stdout}`)
}
