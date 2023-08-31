import { expect } from 'chai'
import hre from 'hardhat'
import { ethers } from 'ethers'
import {
  Contract,
  FailureAction,
  Integration,
  SupportedNetworkName,
  UserAddressOverrides,
  UserCallAction,
  UserConfig,
  UserFunctionArgOverride,
  contractInstantiatedWithDuplicatedNetworkOverrides,
  contractInstantiatedWithInvalidAbi,
  contractInstantiatedWithInvalidAddress,
  contractInstantiatedWithInvalidNetworkOverrides,
  contractInstantiatedWithInvalidOverridingAddresses,
  createSphinxLog,
  ensureSphinxInitialized,
  getSphinxManagerAddress,
  getTargetAddress,
} from '@sphinx-labs/core'
import { SphinxManagerABI } from '@sphinx-labs/contracts'
import {
  externalContractMustIncludeAbi,
  externalContractsMustBeDeployed,
  failedToEncodeFunctionCall,
} from '@sphinx-labs/core/src'

import {
  deployerPrivateKey,
  multichainTestInfo,
  relayerPrivateKey,
  rpcProviders,
} from './constants'
import {
  deploy,
  emptyCanonicalConfigCallback,
  registerProject,
  revertSnapshots,
  setupThenProposeThenApproveDeploymentThenExecute,
} from './helpers'
import { createSphinxRuntime } from '../src/cre'

// TODO: make sure that ryan's foundry deployment bug is reproduced in the automated test before
// it's fixed.

const initialTestnets: Array<SupportedNetworkName> = [
  'goerli',
  'optimism-goerli',
  'arbitrum-goerli',
]
const allTestnets: Array<SupportedNetworkName> = initialTestnets.concat([
  'gnosis-chiado',
])

const { abi: ConfigContractABI } = hre.artifacts.readArtifactSync('MyContract1')
const { abi: ExternalContractABI } =
  hre.artifacts.readArtifactSync('MyContract2')

const constructorArgs = {
  _intArg: 0,
  _uintArg: 0,
  _addressArg: ethers.ZeroAddress,
  _otherAddressArg: ethers.ZeroAddress,
}

const projectName = 'PostDeploymentActions'
const userConfigWithoutPostDeployActions: UserConfig = {
  projectName,
  contracts: {
    ConfigContract1: {
      kind: 'immutable',
      contract: 'MyContract1',
      constructorArgs,
    },
    ConfigContract2: {
      kind: 'immutable',
      contract: 'MyContract1',
      constructorArgs,
    },
  },
}

const deployerAddress = new ethers.Wallet(deployerPrivateKey).address
const sphinxManagerAddress = getSphinxManagerAddress(
  deployerAddress,
  projectName
)

describe('Post-Deployment Actions', () => {
  let externalContractAddress1: string
  let externalContractAddress2: string
  let externalContractAddress3: string
  before(async () => {
    await Promise.all(
      allTestnets.map(async (network) => {
        const provider = rpcProviders[network]
        const deployer = new ethers.Wallet(deployerPrivateKey, provider)

        const ExternalContract1 = await hre.ethers.deployContract(
          'MyContract2',
          [],
          deployer
        )
        externalContractAddress1 = await ExternalContract1.getAddress()
        const ExternalContract2 = await hre.ethers.deployContract(
          'MyContract2',
          [],
          deployer
        )
        externalContractAddress2 = await ExternalContract2.getAddress()
        const ExternalContract3 = await hre.ethers.deployContract(
          'MyContract2',
          [],
          deployer
        )
        externalContractAddress3 = await ExternalContract3.getAddress()

        expect(externalContractAddress1).to.not.equal(externalContractAddress2)
        expect(externalContractAddress1).to.not.equal(externalContractAddress3)

        // Initialize the Sphinx contracts including an executor so that it's possible to execute
        // the proposal test case.
        const relayerAndExecutor = new ethers.Wallet(
          relayerPrivateKey,
          provider
        )
        await ensureSphinxInitialized(provider, relayerAndExecutor, [
          relayerAndExecutor.address,
        ])
        for (const projectTestInfo of multichainTestInfo) {
          await registerProject(provider, projectTestInfo)
        }
      })
    )
  })

  const snapshotIds: {
    [network: string]: string
  } = {}
  beforeEach(async () => {
    await revertSnapshots(allTestnets, snapshotIds)
  })

  // TODO: yarn test:hardhat -> yarn test:ts

  describe('Validation', () => {
    let validationOutput = ''

    const cre = createSphinxRuntime(
      'hardhat',
      false,
      hre.config.networks.hardhat.allowUnlimitedContractSize,
      true,
      hre.config.paths.compilerConfigs,
      hre,
      false,
      process.stderr
    )

    before(() => {
      process.stderr.write = (message: string) => {
        validationOutput += message
        return true
      }
    })

    beforeEach(() => {
      // Reset the validation output before each test.
      validationOutput = ''
    })

    it('Contract instantiated with invalid address', async () => {
      const invalidAddress = '0x1111'
      const ExternalContract1 = new Contract(invalidAddress, {
        abi: ExternalContractABI,
      })
      const userConfig = structuredClone(userConfigWithoutPostDeployActions)
      userConfig.postDeploy = [ExternalContract1.incrementMyContract2(1)]

      try {
        await deploy(
          userConfig,
          rpcProviders['goerli'],
          deployerPrivateKey,
          cre,
          FailureAction.THROW
        )
      } catch (e) {
        /* empty */
      }

      expect(validationOutput).to.have.string(
        `${contractInstantiatedWithInvalidAddress(invalidAddress)}`
      )
    })

    it('Contract instantiated with invalid ABI', async () => {
      const invalidFragment = 1234
      const ExternalContract1 = new Contract(externalContractAddress1, {
        abi: [invalidFragment],
      })
      const userConfig = structuredClone(userConfigWithoutPostDeployActions)
      userConfig.postDeploy = [ExternalContract1.incrementMyContract2(1)]

      try {
        await deploy(
          userConfig,
          rpcProviders['goerli'],
          deployerPrivateKey,
          cre,
          FailureAction.THROW
        )
      } catch (e) {
        /* empty */
      }

      let ethersErrorMessage: string | undefined
      try {
        ethers.Fragment.from(invalidFragment)
      } catch (e) {
        ethersErrorMessage = e.message
      }

      // This narrows the type of `ethersErrorMessage` to `string` so that it can be used in the
      // `expect` assertion.
      if (ethersErrorMessage === undefined) {
        throw new Error(
          'Could not get ethers error message. Should never happen.'
        )
      }

      expect(validationOutput).to.have.string(
        contractInstantiatedWithInvalidAbi(
          ethersErrorMessage,
          externalContractAddress1
        )
      )
    })

    it('Contract instantiated with invalid network overrides', async () => {
      const invalidNetworks = ['invalidNetwork1', 'invalidNetwork2']
      const ExternalContract1 = new Contract(externalContractAddress1, {
        overrides: [
          {
            chains: invalidNetworks,
            address: externalContractAddress2,
          },
        ],
        abi: ExternalContractABI,
      })
      const userConfig = structuredClone(userConfigWithoutPostDeployActions)
      userConfig.postDeploy = [ExternalContract1.incrementMyContract2(1)]

      try {
        await deploy(
          userConfig,
          rpcProviders['goerli'],
          deployerPrivateKey,
          cre,
          FailureAction.THROW
        )
      } catch (e) {
        /* empty */
      }

      expect(validationOutput).to.have.string(
        contractInstantiatedWithInvalidNetworkOverrides(
          invalidNetworks,
          externalContractAddress1
        )
      )
    })

    it('Contract instantiated with duplicated network overrides', async () => {
      const duplicatedNetworks = ['goerli', 'optimism-goerli']
      const ExternalContract1 = new Contract(externalContractAddress1, {
        overrides: [
          {
            chains: duplicatedNetworks,
            address: externalContractAddress2,
          },
          {
            chains: duplicatedNetworks,
            address: externalContractAddress3,
          },
        ],
        abi: ExternalContractABI,
      })
      const userConfig = structuredClone(userConfigWithoutPostDeployActions)
      userConfig.postDeploy = [ExternalContract1.incrementMyContract2(1)]

      try {
        await deploy(
          userConfig,
          rpcProviders['goerli'],
          deployerPrivateKey,
          cre,
          FailureAction.THROW
        )
      } catch (e) {
        /* empty */
      }

      const expectedOutput = createSphinxLog(
        'error',
        contractInstantiatedWithDuplicatedNetworkOverrides(
          externalContractAddress1
        ),
        duplicatedNetworks
      )

      expect(validationOutput).to.have.string(expectedOutput)
    })

    it('Contract instantiated with invalid overriding addresses', async () => {
      const invalidAddress1 = '0x1111'
      const invalidAddress2 = '0x2222'
      const ExternalContract1 = new Contract(externalContractAddress1, {
        overrides: [
          {
            chains: ['goerli'],
            address: invalidAddress1,
          },
          {
            chains: ['optimism-goerli'],
            address: invalidAddress2,
          },
        ],
        abi: ExternalContractABI,
      })
      const userConfig = structuredClone(userConfigWithoutPostDeployActions)
      userConfig.postDeploy = [ExternalContract1.incrementMyContract2(1)]

      try {
        await deploy(
          userConfig,
          rpcProviders['goerli'],
          deployerPrivateKey,
          cre,
          FailureAction.THROW
        )
      } catch (e) {
        /* empty */
      }

      const expectedOutput = createSphinxLog(
        'error',
        contractInstantiatedWithInvalidOverridingAddresses(
          externalContractAddress1
        ),
        [invalidAddress1, invalidAddress2]
      )
      expect(validationOutput).to.have.string(expectedOutput)
    })

    it('External contract must include ABI', async () => {
      const userConfig = structuredClone(userConfigWithoutPostDeployActions)
      const ExternalContract1 = new Contract(externalContractAddress1)
      userConfig.postDeploy = [ExternalContract1.incrementMyContract2(1)]

      try {
        await deploy(
          userConfig,
          rpcProviders['goerli'],
          deployerPrivateKey,
          cre,
          FailureAction.THROW
        )
      } catch (e) {
        /* empty */
      }

      expect(validationOutput).to.have.string(
        externalContractMustIncludeAbi(externalContractAddress1)
      )
    })

    describe('Fails to encode function call', () => {
      const ConfigContract1 = new Contract('{{ ConfigContract1 }}')
      const configContract1Address = getTargetAddress(
        sphinxManagerAddress,
        'ConfigContract1'
      )
      const configContract1ReferenceName = 'ConfigContract1'
      const ConfigContract1_Iface = new ethers.Interface(ConfigContractABI)

      it('Missing argument', async () => {
        const functionArgs = [1, 2]
        const userConfig = structuredClone(userConfigWithoutPostDeployActions)
        userConfig.postDeploy = [ConfigContract1.setInts(...functionArgs)]

        try {
          await deploy(
            userConfig,
            rpcProviders['goerli'],
            deployerPrivateKey,
            cre,
            FailureAction.THROW
          )
        } catch (e) {
          /* empty */
        }

        let ethersErrorMessage: string | undefined
        try {
          ConfigContract1_Iface.encodeFunctionData('setInts', functionArgs)
        } catch (e) {
          ethersErrorMessage = e.message
        }

        const callAction: UserCallAction = {
          address: configContract1Address,
          functionName: 'setInts',
          functionArgs,
        }
        // This narrows the type of `ethersErrorMessage` to `string` so that it can be used in the
        // `expect` assertion.
        if (ethersErrorMessage === undefined) {
          throw new Error(
            'Could not get ethers error message. Should never happen.'
          )
        }

        expect(validationOutput).to.have.string(
          failedToEncodeFunctionCall(
            ethersErrorMessage,
            callAction,
            configContract1ReferenceName
          )
        )
      })

      it('Extra argument', async () => {
        const functionArgs = [1, 2, 3, 4]
        const userConfig = structuredClone(userConfigWithoutPostDeployActions)
        userConfig.postDeploy = [ConfigContract1.setInts(...functionArgs)]

        try {
          await deploy(
            userConfig,
            rpcProviders['goerli'],
            deployerPrivateKey,
            cre,
            FailureAction.THROW
          )
        } catch (e) {
          /* empty */
        }

        let ethersErrorMessage: string | undefined
        try {
          ConfigContract1_Iface.encodeFunctionData('setInts', functionArgs)
        } catch (e) {
          ethersErrorMessage = e.message
        }

        const callAction: UserCallAction = {
          address: configContract1Address,
          functionName: 'setInts',
          functionArgs,
        }
        // This narrows the type of `ethersErrorMessage` to `string` so that it can be used in the
        // `expect` assertion.
        if (ethersErrorMessage === undefined) {
          throw new Error(
            'Could not get ethers error message. Should never happen.'
          )
        }

        expect(validationOutput).to.have.string(
          failedToEncodeFunctionCall(
            ethersErrorMessage,
            callAction,
            configContract1ReferenceName
          )
        )
      })

      it('Invalid argument type', async () => {
        const functionArgs = [1, 'abc', 3]
        const userConfig = structuredClone(userConfigWithoutPostDeployActions)
        userConfig.postDeploy = [ConfigContract1.setInts(...functionArgs)]

        try {
          await deploy(
            userConfig,
            rpcProviders['goerli'],
            deployerPrivateKey,
            cre,
            FailureAction.THROW
          )
        } catch (e) {
          /* empty */
        }

        let ethersErrorMessage: string | undefined
        try {
          ConfigContract1_Iface.encodeFunctionData('setInts', functionArgs)
        } catch (e) {
          ethersErrorMessage = e.message
        }

        const callAction: UserCallAction = {
          address: configContract1Address,
          functionName: 'setInts',
          functionArgs,
        }
        // This narrows the type of `ethersErrorMessage` to `string` so that it can be used in the
        // `expect` assertion.
        if (ethersErrorMessage === undefined) {
          throw new Error(
            'Could not get ethers error message. Should never happen.'
          )
        }

        expect(validationOutput).to.have.string(
          failedToEncodeFunctionCall(
            ethersErrorMessage,
            callAction,
            configContract1ReferenceName
          )
        )
      })

      it('Ambiguous overloaded function signature', async () => {
        const functionName = 'set'
        const functionArgs = [1, 2]
        const userConfig = structuredClone(userConfigWithoutPostDeployActions)
        userConfig.postDeploy = [ConfigContract1[functionName](...functionArgs)]

        try {
          await deploy(
            userConfig,
            rpcProviders['goerli'],
            deployerPrivateKey,
            cre,
            FailureAction.THROW
          )
        } catch (e) {
          /* empty */
        }

        let ethersErrorMessage: string | undefined
        try {
          ConfigContract1_Iface.encodeFunctionData(functionName, functionArgs)
        } catch (e) {
          ethersErrorMessage = e.message
        }

        const callAction: UserCallAction = {
          address: configContract1Address,
          functionName,
          functionArgs,
        }
        // This narrows the type of `ethersErrorMessage` to `string` so that it can be used in the
        // `expect` assertion.
        if (ethersErrorMessage === undefined) {
          throw new Error(
            'Could not get ethers error message. Should never happen.'
          )
        }

        expect(validationOutput).to.have.string(
          failedToEncodeFunctionCall(
            ethersErrorMessage,
            callAction,
            configContract1ReferenceName
          )
        )
      })

      it('Function name does not exist in contract', async () => {
        const functionName = 'invalidFunctionName'
        const functionArgs = []
        const userConfig = structuredClone(userConfigWithoutPostDeployActions)
        userConfig.postDeploy = [ConfigContract1[functionName](...functionArgs)]

        try {
          await deploy(
            userConfig,
            rpcProviders['goerli'],
            deployerPrivateKey,
            cre,
            FailureAction.THROW
          )
        } catch (e) {
          /* empty */
        }

        let ethersErrorMessage: string | undefined
        try {
          ConfigContract1_Iface.encodeFunctionData(functionName, functionArgs)
        } catch (e) {
          ethersErrorMessage = e.message
        }

        const callAction: UserCallAction = {
          address: configContract1Address,
          functionName,
          functionArgs,
        }
        // This narrows the type of `ethersErrorMessage` to `string` so that it can be used in the
        // `expect` assertion.
        if (ethersErrorMessage === undefined) {
          throw new Error(
            'Could not get ethers error message. Should never happen.'
          )
        }

        expect(validationOutput).to.have.string(
          failedToEncodeFunctionCall(
            ethersErrorMessage,
            callAction,
            configContract1ReferenceName
          )
        )
      })
    })

    it('External contracts must be deployed', async () => {
      const randomExternalContractAddressOne = '0x' + '11'.repeat(20)
      const randomExternalContractAddressTwo = '0x' + '22'.repeat(20)
      const userConfig = structuredClone(userConfigWithoutPostDeployActions)
      const ExternalContract1 = new Contract(randomExternalContractAddressOne, {
        abi: ExternalContractABI,
      })
      const ExternalContract2 = new Contract(randomExternalContractAddressTwo, {
        abi: ExternalContractABI,
      })
      userConfig.postDeploy = [
        ExternalContract1.incrementMyContract2(1),
        ExternalContract2.incrementMyContract2(1),
      ]

      try {
        await deploy(
          userConfig,
          rpcProviders['goerli'],
          deployerPrivateKey,
          cre,
          FailureAction.THROW
        )
      } catch {
        // Do nothing.
      }

      const expectedOutput = createSphinxLog(
        'error',
        externalContractsMustBeDeployed(5),
        [randomExternalContractAddressOne, randomExternalContractAddressTwo]
      )

      expect(validationOutput).to.have.string(expectedOutput)
    })
  })

  const integrations: Array<Integration> = ['foundry']
  for (const integration of integrations) {
    describe(`Execution on ${integration}`, () => {
      const configContract1Address = getTargetAddress(
        sphinxManagerAddress,
        'ConfigContract1'
      )
      const configContract2Address = getTargetAddress(
        sphinxManagerAddress,
        'ConfigContract2'
      )

      describe('Performs post-deployment action(s) on Contract instantiated with...', () => {
        let addressOverrides: Array<UserAddressOverrides>
        before(() => {
          // This assignment must be in a `before` instead of being defined in-line because it relies on
          // the existence of the external contract addresses, which are only avaiable after the first
          // `before` block.
          addressOverrides = [
            {
              chains: ['optimism-goerli', 'goerli'],
              address: externalContractAddress2,
            },
            { chains: ['arbitrum-goerli'], address: externalContractAddress3 },
          ]
        })

        it('Reference name', async () => {
          const ConfigContract1 = new Contract('{{ ConfigContract1 }}')
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [ConfigContract1.incrementUint()]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            const ConfigContract1_Deployed = new ethers.Contract(
              configContract1Address,
              ConfigContractABI,
              rpcProviders[network]
            )
            expect(await ConfigContract1_Deployed.uintArg()).equals(1n)
          }
        })

        it('External contract address w/ ABI', async () => {
          const ExternalContract1 = new Contract(externalContractAddress1, {
            abi: ExternalContractABI,
          })
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [ExternalContract1.incrementMyContract2(1)]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            const ExternalContract_Deployed = new ethers.Contract(
              externalContractAddress1,
              ExternalContractABI,
              rpcProviders[network]
            )
            expect(await ExternalContract_Deployed.number()).equals(1n)
          }
        })

        it('Overridden external contract', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          const ExternalContract = new Contract(externalContractAddress1, {
            overrides: addressOverrides,
            abi: ExternalContractABI,
          })
          userConfig.postDeploy = [ExternalContract.incrementMyContract2(2)]

          await Promise.all(
            allTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of allTestnets) {
            let externalContractAddress: string
            if (network === 'optimism-goerli' || network === 'goerli') {
              externalContractAddress = externalContractAddress2
            } else if (network === 'arbitrum-goerli') {
              externalContractAddress = externalContractAddress3
            } else {
              externalContractAddress = externalContractAddress1
            }

            const ExternalContract_Deployed = new ethers.Contract(
              externalContractAddress,
              ExternalContractABI,
              rpcProviders[network]
            )
            expect(await ExternalContract_Deployed.number()).equals(2n)
          }
        })

        it('Reference name overridden with another reference name', async () => {
          const overriddenNetworks = ['optimism-goerli', 'goerli']
          const ConfigContract = new Contract('{{ ConfigContract1 }}', {
            overrides: [
              {
                chains: overriddenNetworks,
                address: '{{ ConfigContract2 }}',
              },
            ],
          })
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [ConfigContract.incrementUint()]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            let ConfigContract_Deployed: ethers.Contract
            if (overriddenNetworks.includes(network)) {
              ConfigContract_Deployed = new ethers.Contract(
                configContract2Address,
                ConfigContractABI,
                rpcProviders[network]
              )
            } else {
              ConfigContract_Deployed = new ethers.Contract(
                configContract1Address,
                ConfigContractABI,
                rpcProviders[network]
              )
            }
            expect(await ConfigContract_Deployed.uintArg()).equals(1n)
          }
        })
      })

      describe('Performs post-deployment actions on...', () => {
        const ConfigContract1 = new Contract('{{ ConfigContract1 }}')

        let ExternalContract1: Contract
        let functionArgOverrides: Array<UserFunctionArgOverride>
        // TODO(docs)
        before(() => {
          ExternalContract1 = new Contract(externalContractAddress1, {
            abi: ExternalContractABI,
          })

          functionArgOverrides = [
            { chains: ['optimism-goerli', 'goerli'], args: { _b: 5, _c: 6 } },
            { chains: ['arbitrum-goerli'], args: { _a: 4 } },
          ]
        })

        it('Single function with no arguments', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [ConfigContract1.incrementUint()]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            const ConfigContract1_Deployed = new ethers.Contract(
              configContract1Address,
              ConfigContractABI,
              rpcProviders[network]
            )
            expect(await ConfigContract1_Deployed.uintArg()).equals(1n)
          }
        })

        it('Single function with one argument', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [ExternalContract1.incrementMyContract2(5)]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            const ExternalContract_Deployed = new ethers.Contract(
              externalContractAddress1,
              ExternalContractABI,
              rpcProviders[network]
            )
            expect(await ExternalContract_Deployed.number()).equals(5n)
          }
        })

        it('Single function with struct argument', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [
            ConfigContract1.setMyStructValues({
              b: 2,
              c: {
                d: '0x' + '11'.repeat(20),
              },
              a: 1,
            }),
          ]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            const ConfigContract1_Deployed = new ethers.Contract(
              configContract1Address,
              ConfigContractABI,
              rpcProviders[network]
            )
            expect(await ConfigContract1_Deployed.intArg()).equals(1n)
            expect(await ConfigContract1_Deployed.secondIntArg()).equals(2n)
            expect(await ConfigContract1_Deployed.addressArg()).equals(
              '0x' + '11'.repeat(20)
            )
          }
        })

        it('Overloaded functions with two arguments', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          const newAddress1 = '0x' + '11'.repeat(20)
          const newAddress2 = '0x' + '22'.repeat(20)
          userConfig.postDeploy = [
            ConfigContract1['set(int,int)'](1, 2),
            ConfigContract1['set(address,address)'](newAddress1, newAddress2),
          ]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            const ConfigContract1_Deployed = new ethers.Contract(
              configContract1Address,
              ConfigContractABI,
              rpcProviders[network]
            )
            expect(await ConfigContract1_Deployed.intArg()).equals(1n)
            expect(await ConfigContract1_Deployed.secondIntArg()).equals(2n)
            expect(await ConfigContract1_Deployed.addressArg()).equals(
              newAddress1
            )
            expect(await ConfigContract1_Deployed.otherAddressArg()).equals(
              newAddress2
            )
          }
        })

        it('Single function with three arguments', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [
            ConfigContract1.setInts(-1, -2, ethers.MinInt256.toString()),
          ]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            const ConfigContract1_Deployed = new ethers.Contract(
              configContract1Address,
              ConfigContractABI,
              rpcProviders[network]
            )
            expect(await ConfigContract1_Deployed.intArg()).equals(-1n)
            expect(await ConfigContract1_Deployed.secondIntArg()).equals(-2n)
            expect(await ConfigContract1_Deployed.thirdIntArg()).equals(
              ethers.MinInt256
            )
          }
        })

        it('Single function with chain-specific overrides', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [
            ConfigContract1.setInts(1, 2, 3, functionArgOverrides),
          ]

          await Promise.all(
            allTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of allTestnets) {
            const ConfigContract1_Deployed = new ethers.Contract(
              configContract1Address,
              ConfigContractABI,
              rpcProviders[network]
            )

            // Default values
            let _a = 1n
            let _b = 2n
            let _c = 3n

            // Overridding values
            if (network === 'optimism-goerli' || network === 'goerli') {
              _b = 5n
              _c = 6n
            } else if (network === 'arbitrum-goerli') {
              _a = 4n
            }

            expect(await ConfigContract1_Deployed.intArg()).equals(_a)
            expect(await ConfigContract1_Deployed.secondIntArg()).equals(_b)
            expect(await ConfigContract1_Deployed.thirdIntArg()).equals(_c)
          }
        })

        it('Overrides nested struct value', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [
            ConfigContract1.setMyStructValues(
              {
                b: 2,
                c: {
                  d: '0x' + '11'.repeat(20),
                },
                a: 1,
              },
              [
                {
                  chains: ['goerli', 'optimism-goerli'],
                  args: {
                    _myStruct: { a: 4, b: 5, c: { d: '0x' + '22'.repeat(20) } },
                  },
                },
              ]
            ),
          ]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )
          for (const network of initialTestnets) {
            const ConfigContract1_Deployed = new ethers.Contract(
              configContract1Address,
              ConfigContractABI,
              rpcProviders[network]
            )
            if (network === 'optimism-goerli' || network === 'goerli') {
              expect(await ConfigContract1_Deployed.intArg()).equals(4n)
              expect(await ConfigContract1_Deployed.secondIntArg()).equals(5n)
              expect(await ConfigContract1_Deployed.addressArg()).equals(
                '0x' + '22'.repeat(20)
              )
            } else {
              expect(await ConfigContract1_Deployed.intArg()).equals(1n)
              expect(await ConfigContract1_Deployed.secondIntArg()).equals(2n)
              expect(await ConfigContract1_Deployed.addressArg()).equals(
                '0x' + '11'.repeat(20)
              )
            }
          }
        })

        it('Complex post-deployment actions', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [
            ConfigContract1.incrementUint(),
            ConfigContract1.incrementUint(),
            ExternalContract1.incrementMyContract2(6, [
              { chains: ['goerli', 'arbitrum-goerli'], args: { _num: 7 } },
            ]),
            ConfigContract1.incrementUint(),
            ConfigContract1['set(int,int)'](-3, -4, [
              { chains: ['optimism-goerli'], args: { _secondInt: -5 } },
            ]),
            ConfigContract1.incrementUint(),
          ]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            const ConfigContract1_Deployed = new ethers.Contract(
              configContract1Address,
              ConfigContractABI,
              rpcProviders[network]
            )
            // Increment was called 4 times
            expect(await ConfigContract1_Deployed.uintArg()).equals(4n)

            const ExternalContract_Deployed = new ethers.Contract(
              externalContractAddress1,
              ExternalContractABI,
              rpcProviders[network]
            )
            if (network === 'goerli' || network === 'arbitrum-goerli') {
              expect(await ExternalContract_Deployed.number()).equals(7n)
            } else {
              expect(await ExternalContract_Deployed.number()).equals(6n)
            }

            // Default values
            expect(await ConfigContract1_Deployed.intArg()).equals(-3n)
            if (network === 'optimism-goerli') {
              expect(await ConfigContract1_Deployed.secondIntArg()).equals(-5n)
            } else {
              expect(await ConfigContract1_Deployed.secondIntArg()).equals(-4n)
            }
          }
        })

        it('Skips actions that have already been executed', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          // Since these function increment values, we can use them to check that the actions were
          // executed only once after multiple deployments.
          userConfig.postDeploy = [
            ConfigContract1.incrementUint(),
            ConfigContract1.incrementUint(),
            ExternalContract1.incrementMyContract2(6, [
              { chains: ['goerli', 'arbitrum-goerli'], args: { _num: 7 } },
            ]),
          ]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          // Assert that the actions were executed
          for (const network of initialTestnets) {
            await assertActionsExecuted(
              network,
              configContract1Address,
              externalContractAddress1,
              sphinxManagerAddress,
              {
                configContract: 2n,
                externalContract: {
                  goerli: 7n,
                  'arbitrum-goerli': 7n,
                  'optimism-goerli': 6n,
                },
              }
            )
          }

          // Add a contract to the config. If we don't do this, the deployment ID will be skipped because
          // it has already been executed.
          userConfig.contracts.ConfigContract3 = {
            kind: 'immutable',
            contract: 'MyContract1',
            constructorArgs,
          }

          // Deploy again
          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            const provider = rpcProviders[network]

            // Check that the new contract was deployed, which indicates that the second config wasn't
            // skipped.
            const configContract3Address = getTargetAddress(
              sphinxManagerAddress,
              'ConfigContract3'
            )
            expect(await provider.getCode(configContract3Address)).to.not.equal(
              '0x'
            )

            // Check that the actions were not executed again
            await assertActionsExecuted(
              network,
              configContract1Address,
              externalContractAddress1,
              sphinxManagerAddress,
              {
                configContract: 2n,
                externalContract: {
                  goerli: 7n,
                  'arbitrum-goerli': 7n,
                  'optimism-goerli': 6n,
                },
              }
            )
          }
        })

        it('Skips previously executed actions and executes new actions', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [
            ConfigContract1.incrementUint(),
            ConfigContract1.incrementUint(),
            ExternalContract1.incrementMyContract2(6, [
              { chains: ['goerli', 'arbitrum-goerli'], args: { _num: 7 } },
            ]),
          ]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          // Assert that the actions were executed
          for (const network of initialTestnets) {
            await assertActionsExecuted(
              network,
              configContract1Address,
              externalContractAddress1,
              sphinxManagerAddress,
              {
                configContract: 2n,
                externalContract: {
                  goerli: 7n,
                  'arbitrum-goerli': 7n,
                  'optimism-goerli': 6n,
                },
              }
            )
          }

          // Add new post-deploy actions
          userConfig.postDeploy.push(ConfigContract1.incrementUint())
          userConfig.postDeploy.push(
            ExternalContract1.incrementMyContract2(6, [
              { chains: ['goerli', 'arbitrum-goerli'], args: { _num: 7 } },
            ])
          )

          // Deploy again
          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            // Check that only the new actions were executed
            await assertActionsExecuted(
              network,
              configContract1Address,
              externalContractAddress1,
              sphinxManagerAddress,
              {
                configContract: 3n,
                externalContract: {
                  goerli: 14n,
                  'arbitrum-goerli': 14n,
                  'optimism-goerli': 12n,
                },
              }
            )
          }
        })

        it('Skips executing actions except for new overridden function call', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [
            ConfigContract1.incrementUint(),
            ConfigContract1.incrementUint(),
            ExternalContract1.incrementMyContract2(6, [
              { chains: ['goerli', 'arbitrum-goerli'], args: { _num: 7 } },
            ]),
          ]

          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          // Assert that the initial actions were executed
          for (const network of initialTestnets) {
            await assertActionsExecuted(
              network,
              configContract1Address,
              externalContractAddress1,
              sphinxManagerAddress,
              {
                configContract: 2n,
                externalContract: {
                  goerli: 7n,
                  'arbitrum-goerli': 7n,
                  'optimism-goerli': 6n,
                },
              }
            )
          }

          // Change the last action to use a different overriding function argument
          userConfig.postDeploy.pop()
          userConfig.postDeploy.push(
            ExternalContract1.incrementMyContract2(6, [
              { chains: ['goerli', 'arbitrum-goerli'], args: { _num: 100 } },
            ])
          )

          // Deploy again
          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of initialTestnets) {
            // Check that only the new actions were executed
            await assertActionsExecuted(
              network,
              configContract1Address,
              externalContractAddress1,
              sphinxManagerAddress,
              {
                configContract: 2n, // This should remain the same because it was skipped
                externalContract: {
                  'optimism-goerli': 6n, // This should remain the same because it was skipped
                  // These values should be updated from their initial values:
                  goerli: 107n,
                  'arbitrum-goerli': 107n,
                },
              }
            )
          }
        })

        it('Executes actions on new chain and skips actions on existing chains', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [
            ConfigContract1.incrementUint(),
            ConfigContract1.incrementUint(),
            ExternalContract1.incrementMyContract2(6, [
              { chains: ['goerli', 'arbitrum-goerli'], args: { _num: 7 } },
            ]),
          ]

          // Deploy on the initial testnets
          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          // Assert that the initial actions were executed
          for (const network of initialTestnets) {
            await assertActionsExecuted(
              network,
              configContract1Address,
              externalContractAddress1,
              sphinxManagerAddress,
              {
                configContract: 2n,
                externalContract: {
                  goerli: 7n,
                  'arbitrum-goerli': 7n,
                  'optimism-goerli': 6n,
                },
              }
            )
          }

          // Add a contract to the config. If we don't do this, the deployment ID will be skipped on the
          // initial chains because it has already been executed.
          userConfig.contracts.ConfigContract3 = {
            kind: 'immutable',
            contract: 'MyContract1',
            constructorArgs,
          }

          // Deploy on all the testnets
          await Promise.all(
            allTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of allTestnets) {
            const provider = rpcProviders[network]

            // Check that the new contract was deployed, which indicates that the second config wasn't
            // skipped.
            const configContract3Address = getTargetAddress(
              sphinxManagerAddress,
              'ConfigContract3'
            )
            expect(await provider.getCode(configContract3Address)).to.not.equal(
              '0x'
            )

            // Check that the actions have only been executed once on each chain.
            await assertActionsExecuted(
              network,
              configContract1Address,
              externalContractAddress1,
              sphinxManagerAddress,
              {
                configContract: 2n,
                externalContract: {
                  goerli: 7n,
                  'arbitrum-goerli': 7n,
                  'optimism-goerli': 6n,
                },
              }
            )
          }
        })

        it('Executes actions on new chain, skips previous actions on existing chains, and executes new actions on existing chains', async () => {
          const userConfig = structuredClone(userConfigWithoutPostDeployActions)
          userConfig.postDeploy = [
            ConfigContract1.incrementUint(),
            ConfigContract1.incrementUint(),
            ExternalContract1.incrementMyContract2(6, [
              { chains: ['goerli', 'arbitrum-goerli'], args: { _num: 7 } },
            ]),
          ]

          // Deploy on the initial testnets
          await Promise.all(
            initialTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          // Assert that the initial actions were executed
          for (const network of initialTestnets) {
            await assertActionsExecuted(
              network,
              configContract1Address,
              externalContractAddress1,
              sphinxManagerAddress,
              {
                configContract: 2n,
                externalContract: {
                  goerli: 7n,
                  'arbitrum-goerli': 7n,
                  'optimism-goerli': 6n,
                },
              }
            )
          }

          // Add new post-deploy actions
          userConfig.postDeploy.push(ConfigContract1.incrementUint())
          userConfig.postDeploy.push(
            ExternalContract1.incrementMyContract2(6, [
              { chains: ['goerli', 'arbitrum-goerli'], args: { _num: 7 } },
            ])
          )

          // Deploy on all the testnets
          await Promise.all(
            allTestnets.map((network) =>
              deploy(
                userConfig,
                rpcProviders[network],
                deployerPrivateKey,
                undefined,
                undefined,
                integration
              )
            )
          )

          for (const network of allTestnets) {
            // Check that only the new actions were executed
            await assertActionsExecuted(
              network,
              configContract1Address,
              externalContractAddress1,
              sphinxManagerAddress,
              {
                configContract: 3n,
                externalContract: {
                  goerli: 14n,
                  'arbitrum-goerli': 14n,
                  'optimism-goerli': 12n,
                },
              }
            )
          }
        })
      })

      it('Marks the deployment as failed if call action reverts on-chain', async () => {
        const network = 'goerli'
        const provider = rpcProviders[network]
        const ConfigContract1 = new Contract('{{ ConfigContract1 }}')
        const userConfig = structuredClone(userConfigWithoutPostDeployActions)
        userConfig.postDeploy = [ConfigContract1.reverter()]

        try {
          await deploy(userConfig, provider, deployerPrivateKey)
        } catch {
          // We expect this to throw. Do nothing.
        }

        const SphinxManager = new ethers.Contract(
          sphinxManagerAddress,
          SphinxManagerABI,
          provider
        )
        const deploymentFailedEvents = await SphinxManager.queryFilter(
          SphinxManager.filters.DeploymentFailed()
        )
        expect(deploymentFailedEvents.length).equals(1)
      })
    })
  }

  it('Proposal', async () => {
    // We'll just test the multi-sig config here.
    const ConfigContract1 = new Contract('{{ ConfigContract1 }}')
    const ExternalContract1 = new Contract(externalContractAddress1, {
      abi: ExternalContractABI,
    })
    const projectTestInfo = multichainTestInfo[1]

    projectTestInfo.userConfig.postDeploy = [
      ConfigContract1.incrementUint(),
      ConfigContract1.incrementUint(),
      ExternalContract1.incrementMyContract2(6, [
        { chains: ['goerli', 'arbitrum-goerli'], args: { _num: 7 } },
      ]),
    ]
    projectTestInfo.userConfig.options.proposers.push(deployerAddress)
    projectTestInfo.userConfig.options.testnets = initialTestnets
    process.env['PROPOSER_PRIVATE_KEY'] = deployerPrivateKey
    await setupThenProposeThenApproveDeploymentThenExecute(
      projectTestInfo,
      initialTestnets,
      emptyCanonicalConfigCallback
    )

    const configContractAddressInProposal = getTargetAddress(
      projectTestInfo.managerAddress,
      'ConfigContract1'
    )

    for (const network of projectTestInfo.userConfig.options.testnets) {
      await assertActionsExecuted(
        network,
        configContractAddressInProposal,
        externalContractAddress1,
        projectTestInfo.managerAddress,
        {
          configContract: 2n,
          externalContract: {
            goerli: 7n,
            'arbitrum-goerli': 7n,
            'optimism-goerli': 6n,
          },
        }
      )
    }
  })
})

const assertActionsExecuted = async (
  network: string,
  configContract1Address: string,
  externalContractAddress: string,
  managerAddress: string,
  vals: {
    configContract: bigint
    externalContract: {
      goerli: bigint
      'arbitrum-goerli': bigint
      'optimism-goerli': bigint
    }
  }
) => {
  const provider = rpcProviders[network]
  const ConfigContract1_Deployed = new ethers.Contract(
    configContract1Address,
    ConfigContractABI,
    provider
  )

  expect(await ConfigContract1_Deployed.uintArg()).equals(vals.configContract)

  const ExternalContract_Deployed = new ethers.Contract(
    externalContractAddress,
    ExternalContractABI,
    provider
  )
  if (network === 'goerli') {
    expect(await ExternalContract_Deployed.number()).equals(
      vals.externalContract.goerli
    )
  } else if (network === 'arbitrum-goerli') {
    expect(await ExternalContract_Deployed.number()).equals(
      vals.externalContract['arbitrum-goerli']
    )
  } else {
    expect(await ExternalContract_Deployed.number()).equals(
      vals.externalContract['optimism-goerli']
    )
  }

  // Check that there were no `CallSkipped` events emitted by the SphinxManager. This ensures that
  // the parsing logic removed any actions that needed to be skipped.
  const SphinxManager = new ethers.Contract(
    managerAddress,
    SphinxManagerABI,
    provider
  )
  const callSkippedEvents = await SphinxManager.queryFilter(
    SphinxManager.filters.CallSkipped()
  )
  expect(callSkippedEvents.length).equals(0)
}

// TODO(docs): this test suite is separated into two main components: tests that vary the constructor args while keeping
// the function calls simple, and tests that _. We've separated it this way because the logic that handles these two
// components is distinct.
