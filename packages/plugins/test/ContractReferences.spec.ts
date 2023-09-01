import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import {
  UserConfig,
  ensureSphinxInitialized,
  getSphinxManagerAddress,
  getTargetAddress,
} from '@sphinx-labs/core'

import { deployUsingHardhat } from './helpers'
import { deployerPrivateKey } from './constants'

const { abi: MyContractABI } = hre.artifacts.readArtifactSync('MyContract1')

describe('Create3', () => {
  before(async () => {
    await ensureSphinxInitialized(
      hre.ethers.provider,
      await hre.ethers.provider.getSigner()
    )
  })

  it('Resolves SphinxManager contract reference to its address', async () => {
    const projectName = 'SphinxManagerContractReference'
    const userConfig: UserConfig = {
      projectName,
      contracts: {
        MyContract: {
          contract: 'MyContract1',
          kind: 'immutable',
          constructorArgs: {
            _intArg: 0,
            _uintArg: 0,
            _addressArg: '{{ SphinxManager }}',
            _otherAddressArg: ethers.ZeroAddress,
          },
        },
      },
    }

    const deployerAddress = new ethers.Wallet(deployerPrivateKey).address
    const sphinxManagerAddress = getSphinxManagerAddress(
      deployerAddress,
      projectName
    )

    await deployUsingHardhat(
      userConfig,
      hre.ethers.provider,
      deployerPrivateKey
    )

    const MyContract = new ethers.Contract(
      getTargetAddress(sphinxManagerAddress, 'MyContract'),
      MyContractABI,
      hre.ethers.provider
    )
    expect(await MyContract.addressArg()).to.equal(sphinxManagerAddress)
  })
})
