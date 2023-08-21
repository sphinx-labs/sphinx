export const sampleTestFileTypeScript = `import '@sphinx-labs/plugins'
import { sphinx, ethers } from 'hardhat'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

describe('HelloSphinx', async () => {
  const projectName: string = 'MyProject'
  const signer: HardhatEthersSigner = await ethers.provider.getSigner()

  let FirstContract: Contract
  let SecondContract: Contract
  beforeEach(async () => {
    // Resets the contracts to their initial state.
    await sphinx.reset(ethers.provider)

    // Gets the deployed contracts.
    FirstContract = await sphinx.getContract(
      projectName,
      'MyFirstContract',
      signer
    )
    SecondContract = await sphinx.getContract(
      projectName,
      'MySecondContract',
      signer
    )
  })

  it('initializes first constructor', async () => {
    expect(await FirstContract.myNumber()).equals(1n)
    expect(await FirstContract.myAddress()).equals(
      await FirstContract.getAddress()
    )
  })

  it('initializes second constructor', async () => {
    expect(await SecondContract.myNumber()).equals(2n)
    expect(await SecondContract.myAddress()).equals(
      await SecondContract.getAddress()
    )
  })

  it('increments first number', async () => {
    await FirstContract.increment()
    expect(await FirstContract.myNumber()).equals(2n)
  })

  it('increments second number', async () => {
    await SecondContract.increment()
    expect(await SecondContract.myNumber()).equals(3n)
  })
})
`

export const sampleTestFileJavaScript = `require('@sphinx-labs/plugins')
const { sphinx, ethers } = require('hardhat')
const { expect } = require('chai')

describe('HelloSphinx', async () => {
  const projectName = 'MyProject'
  const signer = await ethers.provider.getSigner()

  let FirstContract
  let SecondContract
  beforeEach(async () => {
    // Reset the contracts to their initial state.
    await sphinx.reset(ethers.provider)

    // Gets the deployed contracts.
    FirstContract = await sphinx.getContract(
      projectName,
      'MyFirstContract',
      signer
    )
    SecondContract = await sphinx.getContract(
      projectName,
      'MySecondContract',
      signer
    )
  })

  it('initializes first constructor', async () => {
    expect(await FirstContract.myNumber()).equals(1n)
    expect(await FirstContract.myAddress()).equals(
      await FirstContract.getAddress()
    )
  })

  it('initializes second constructor', async () => {
    expect(await SecondContract.myNumber()).equals(2n)
    expect(await SecondContract.myAddress()).equals(
      await SecondContract.getAddress()
    )
  })

  it('increments first number', async () => {
    await FirstContract.increment()
    expect(await FirstContract.myNumber()).equals(2n)
  })

  it('increments second number', async () => {
    await SecondContract.increment()
    expect(await SecondContract.myNumber()).equals(3n)
  })
})
`
