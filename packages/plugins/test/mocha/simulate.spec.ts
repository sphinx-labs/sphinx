import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  DeploymentConfig,
  ExecutionMode,
  SphinxJsonRpcProvider,
  fetchURLForNetwork,
  fetchNameForNetwork,
  isFork,
  isLiveNetwork,
  NetworkConfig,
  InvariantError,
  sphinxCoreExecute,
  sphinxCoreUtils,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import { SPHINX_NETWORKS } from '@sphinx-labs/contracts'
import sinon from 'sinon'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import sinonChai from 'sinon-chai'

import {
  getAnvilRpcUrl,
  getGnosisSafeProxyAddress,
  killAnvilNodes,
  makeDeployment,
  makeStandardDeployment,
  promiseThatNeverSettles,
  startForkedAnvilNodes,
  sumEvenNumbers,
} from './common'
import {
  simulationConstants,
  createHardhatEthersProviderProxy,
  getUndeployedContractErrorMesage,
  handleSimulationSuccess,
  simulate,
  simulateDeploymentSubtask,
} from '../../src/hardhat/simulate'
import {
  dummyUnlabeledAddress,
  getDummyDeploymentConfig,
  getDummyNetworkConfig,
} from './dummy'
import {
  HardhatResetNotAllowedErrorMessage,
  getRpcRequestStalledErrorMessage,
} from '../../src/foundry/error-messages'

chai.use(chaiAsPromised)
chai.use(sinonChai)

describe('Simulate', () => {
  let networkConfigArray: Array<NetworkConfig>
  let deploymentConfig: DeploymentConfig

  before(async function () {
    // Skip the tests if the environment variable `CIRCLE_BRANCH` is defined and does not equal
    // 'develop', which enforces that these tests only run in CI when the source branch is
    // 'develop'. These tests will also run on local machines because the `CIRCLE_BRANCH`
    // environment variable isn't defined.
    const CIRCLE_BRANCH = process.env.CIRCLE_BRANCH
    if (typeof CIRCLE_BRANCH === 'string' && CIRCLE_BRANCH !== 'develop') {
      console.log('Skipping tests since this is not the develop branch')
      this.skip()
    }

    process.env['SPHINX_API_KEY'] = 'test-api-key'

    const ownerWallets = [
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    ].map((pk) => new ethers.Wallet(pk))
    const threshold = 3
    const safeAddress = getGnosisSafeProxyAddress(
      ownerWallets.map((o) => o.address),
      threshold,
      0
    )
    const { accountAccesses, deployedContractSizes } = makeStandardDeployment(
      0,
      ExecutionMode.Platform,
      safeAddress
    )

    const productionNetworkNames = SPHINX_NETWORKS.filter(
      (n) => n.networkType === 'Mainnet'
    ).map((n) => n.name)
    const testnetNames = SPHINX_NETWORKS.filter(
      (n) => n.networkType === 'Testnet'
    ).map((n) => n.name)
    const networkNames = productionNetworkNames.concat(testnetNames)

    const deployment = await makeDeployment(
      0, // First deployment
      networkNames,
      'Project_Name',
      ownerWallets,
      threshold, // Threshold
      ExecutionMode.Platform,
      accountAccesses,
      deployedContractSizes,
      fetchURLForNetwork
    )
    networkConfigArray = deployment.deploymentConfig.networkConfigs
    deploymentConfig = deployment.deploymentConfig
  })

  // The main purpose of this test is to check that there aren't conditions on live networks that
  // would always cause the simulation to fail. These conditions may not be captured when testing on
  // local nodes. For example, networks like Arbitrum Sepolia have a block gas limit that's several
  // orders of magniture higher than standard local nodes, which caused a bug in the simulation
  // logic.
  it('succeeds on every live supported network', async () => {
    const results = await Promise.allSettled(
      networkConfigArray.map((networkConfig) =>
        simulate(
          deploymentConfig,
          networkConfig.chainId,
          fetchURLForNetwork(BigInt(networkConfig.chainId))
        )
      )
    )

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const chainId = networkConfigArray[index].chainId
        const networkName = fetchNameForNetwork(BigInt(chainId))
        console.error(`Error on network ${networkName}:`, result.reason)
      }
    })

    // Check that all promises were resolved
    expect(results.every((result) => result.status === 'fulfilled')).to.be.true
  })

  // This test checks that we can simulate a deployment on an Anvil node that's forking Ethereum. We
  // added this test because we were previously receiving a `HeadersTimeoutError` originating from
  // undici, which is called by Hardhat during the simulation. The error was occurring because we
  // were fast-forwarding the block number on forked local nodes. It was only occurring ~50% of the
  // time in this situation for an unknown reason.
  it(`succeeds on anvil fork of ethereum`, async () => {
    const ethereumChainId = BigInt(1)
    await startForkedAnvilNodes([ethereumChainId])

    const networkConfig = networkConfigArray.find(
      ({ chainId }) => chainId === ethereumChainId.toString()
    )
    if (!networkConfig) {
      throw new Error(`Could not find Ethereum NetworkConfig.`)
    }

    // Get the Anvil RPC url, which is running the Ethereum fork.
    const rpcUrl = getAnvilRpcUrl(ethereumChainId)
    const provider = new SphinxJsonRpcProvider(rpcUrl)

    // Sanity check that the provider is targeting a forked network which isn't a live network.
    expect(await isFork(provider)).equals(true)
    expect(await isLiveNetwork(provider)).equals(false)

    // Run the simulation. If an error is thrown, the test will fail. We don't use `chaiAsPromised`
    // here because it truncates the error message if an error occurs.
    await simulate(
      deploymentConfig,
      networkConfig.chainId,
      getAnvilRpcUrl(ethereumChainId)
    )

    await killAnvilNodes([ethereumChainId])
  })
})

describe('simulateDeploymentSubtask', () => {
  const testInvariantErrorMessage = 'Test InvariantError'
  const hre: any = {}
  hre.ethers = {}

  let providerStub: sinon.SinonStubbedInstance<HardhatEthersProvider>

  beforeEach(() => {
    providerStub = sinon.createStubInstance(HardhatEthersProvider)
    hre.ethers.provider = providerStub

    sinon
      .stub(sphinxCoreExecute, 'compileAndExecuteDeployment')
      .throws(new InvariantError(testInvariantErrorMessage))
  })

  afterEach(() => {
    sinon.restore()
  })

  it('should rethrow the InvariantError thrown by compileAndExecuteDeployment', async () => {
    const taskArgs = {
      deploymentConfig: getDummyDeploymentConfig(),
      chainId: '1',
    }

    try {
      await simulateDeploymentSubtask(taskArgs, hre)
      // If the function doesn't throw, force the test to fail
      expect.fail('Expected function to throw an InvariantError.')
    } catch (error) {
      expect(error).to.be.instanceOf(InvariantError)
      expect(error.message).to.include(testInvariantErrorMessage)
    }
  })
})

describe('handleSimulationSuccess', () => {
  let providerStub: sinon.SinonStubbedInstance<HardhatEthersProvider>

  beforeEach(() => {
    providerStub = sinon.createStubInstance(HardhatEthersProvider)

    providerStub.getCode.resolves('0x')
  })

  afterEach(() => {
    sinon.restore()
  })

  it('should throw an InvariantError if a contract address has no deployed code', async () => {
    const networkConfig = getDummyNetworkConfig()

    try {
      await handleSimulationSuccess(networkConfig, providerStub)
      // If the function doesn't throw, force the test to fail
      expect.fail('Expected function to throw an InvariantError.')
    } catch (error) {
      expect(error).to.be.instanceOf(InvariantError)
      expect(error.message).to.include(
        getUndeployedContractErrorMesage(dummyUnlabeledAddress)
      )
    }
  })
})

describe('createHardhatEthersProviderProxy', () => {
  const asyncMethods = [
    { name: 'send', isAsync: true },
    { name: 'hardhat_reset', isAsync: true },
    { name: 'getBlockNumber', isAsync: true },
    { name: 'toJSON', isAsync: false },
  ]

  let ethersProvider: any
  let proxy: HardhatEthersProvider
  let timeSum: number = 0
  let sendStub: sinon.SinonStub
  let isPublicAsyncMethodStub: sinon.SinonStub

  beforeEach(() => {
    sinon
      .stub(sphinxCoreUtils, 'sleep')
      .callsFake(async (time: number): Promise<void> => {
        timeSum += time
      })
    isPublicAsyncMethodStub = sinon.stub(sphinxCoreUtils, 'isPublicAsyncMethod')

    for (const { name, isAsync } of asyncMethods) {
      isPublicAsyncMethodStub.withArgs(sinon.match.any, name).returns(isAsync)
    }

    sendStub = sinon.stub().resolves('defaultPromiseValue')
    sendStub.withArgs('evm_snapshot', []).resolves('snapshotId')
    sendStub.withArgs('evm_revert').resolves(true)
    ethersProvider = {
      send: sendStub,
    } as any

    proxy = createHardhatEthersProviderProxy(ethersProvider)
  })

  afterEach(() => {
    timeSum = 0
    sinon.restore()
  })

  it('CHU-768: throws error if hardhat_reset is called', async () => {
    await expect(proxy.send('hardhat_reset', [])).to.eventually.be.rejectedWith(
      HardhatResetNotAllowedErrorMessage
    )
  })

  it('CHU-768: throws timeout error for a promise that never settles', async () => {
    const originalTimeout = simulationConstants.timeout
    const timeout = 4 // We use a timeout of 4 ms so that this test executes quickly.
    simulationConstants.timeout = timeout

    ethersProvider.getBlockNumber = sinon
      .stub()
      .resolves(promiseThatNeverSettles)

    const callWithTimeoutSpy = sinon.spy(sphinxCoreUtils, 'callWithTimeout')

    await expect(proxy.getBlockNumber()).to.eventually.be.rejectedWith(
      getRpcRequestStalledErrorMessage(timeout)
    )

    // Check that we made `maxAttempts` attempts. In production, we still make repeated attempts
    // when there's a timeout in case this fixes the stall issue.
    expect(callWithTimeoutSpy.callCount).to.equal(
      simulationConstants.maxAttempts
    )
    for (let i = 0; i < simulationConstants.maxAttempts; i++) {
      expect(callWithTimeoutSpy.getCall(i).args[1]).to.equal(timeout)
    }

    simulationConstants.timeout = originalTimeout
  })

  it('throws error after max attempts', async () => {
    const methodError = new Error('Test method failure')

    ethersProvider.getBlockNumber = sinon.stub()
    ethersProvider.getBlockNumber.rejects(methodError)

    await expect(proxy.getBlockNumber()).to.be.rejectedWith(methodError)

    expect(ethersProvider.getBlockNumber.callCount).to.equal(
      simulationConstants.maxAttempts
    )

    // Verify linear backoff timing
    const expectedDuration =
      sumEvenNumbers(
        2,
        // We subtract one because we throw the error after the last attempt instead of waiting.
        simulationConstants.maxAttempts - 1
      ) * 1000
    expect(timeSum).equals(expectedDuration)
    // Check that the time is denominated in seconds
    expect(timeSum % 1000).equals(0)

    // The following is a regression test for the 'nonce too low' bug described in this pull request
    // description: https://github.com/sphinx-labs/sphinx/pull/1565
    //
    // We check that each iteration follows the pattern: evm_snapshot -> forwarded method ->
    // evm_revert.
    for (let i = 0; i < simulationConstants.maxAttempts; i++) {
      const baseIndex = i * 2

      const callOne = ethersProvider.send.getCall(baseIndex)
      const callTwo = ethersProvider.getBlockNumber.getCall(i)

      expect(callOne.calledWith('evm_snapshot')).to.be.true
      expect(callOne).calledBefore(callTwo)

      const callThree = sendStub.getCall(baseIndex + 1)
      expect(callTwo).calledBefore(callThree)
      expect(callThree.calledWith('evm_revert')).to.be.true
    }
  })

  it('successful call on first attempt', async () => {
    const expectedReturnValue = 42
    ethersProvider.getBlockNumber = sinon.stub().resolves(expectedReturnValue)

    const result = await proxy.getBlockNumber()
    expect(result).to.equal(expectedReturnValue)
    expect(ethersProvider.send.withArgs('evm_snapshot', [])).to.have.been
      .calledOnce
    expect(ethersProvider.send.withArgs('evm_revert', sinon.match.any)).to.not
      .have.been.called
    expect(sendStub.withArgs('evm_snapshot', [])).to.have.been.calledBefore(
      ethersProvider.getBlockNumber
    )
  })

  it('successful call on last retry', async () => {
    const expectedReturnValue = 42
    const methodError = new Error('Test method failure')

    // Make every call reject except for the last one
    ethersProvider.getBlockNumber = sinon.stub()
    for (let i = 0; i < simulationConstants.maxAttempts - 1; i++) {
      ethersProvider.getBlockNumber.onCall(i).rejects(methodError)
    }
    // Make the last call resolve successfully
    ethersProvider.getBlockNumber
      .onCall(simulationConstants.maxAttempts - 1)
      .resolves(expectedReturnValue)

    const result = await proxy.getBlockNumber()

    expect(result).to.equal(expectedReturnValue)

    // Check that 'evm_snapshot' was called first (i.e. before `getBlockNumber`).
    expect(ethersProvider.send.firstCall).to.have.been.calledWith(
      'evm_snapshot',
      []
    )
    // Check that we made `maxAttempts` attempts.
    expect(ethersProvider.getBlockNumber.callCount).to.equal(
      simulationConstants.maxAttempts
    )

    // Verify linear backoff timing
    const expectedDuration =
      sumEvenNumbers(
        2,
        // We subtract one because we throw the error after the last attempt instead of waiting.
        simulationConstants.maxAttempts - 1
      ) * 1000
    expect(timeSum).equals(expectedDuration)
    // Check that the time is denominated in seconds
    expect(timeSum % 1000).equals(0)

    // Check that the last call was successful
    expect(
      ethersProvider.getBlockNumber.lastCall.returnValue
    ).to.eventually.equal(expectedReturnValue)
  })

  it('returns value for synchronous function call', () => {
    const expected = 'myValue'
    ethersProvider.toJSON = () => expected
    expect(proxy.toJSON()).to.equal(expected)
  })

  it('forwards async call to the proxy after being awaited', async () => {
    ethersProvider.getBlockNumber = sinon.stub().resolves(42)
    const callWithTimeoutSpy = sinon.spy(sphinxCoreUtils, 'callWithTimeout')

    // Call an asynchronous method on the proxy without awaiting it.
    const resultPromise = proxy.getBlockNumber()

    // Check that the call to the Hardhat provider wasn't made yet.
    expect(callWithTimeoutSpy.called).to.be.false

    await resultPromise

    // Check that the Hardhat provider was called.
    expect(callWithTimeoutSpy.called).to.be.true
  })
})
