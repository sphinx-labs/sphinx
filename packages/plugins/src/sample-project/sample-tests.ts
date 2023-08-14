export const sampleTestFileTypeScript = `import '@sphinx-labs/plugins'
import { sphinx, ethers } from 'hardhat'
import { expect } from 'chai'
import { Signer, Contract } from 'ethers'

describe('HelloSphinx', () => {
  const projectName: string = 'MyProject'
  const signer: Signer = ethers.provider.getSigner()

  let FirstContract: Contract
  let SecondContract: Contract
  beforeEach(async () => {
    // Resets the contracts to their initial state.
    await sphinx.reset(ethers.provider)

    // Gets the deployed contracts.
    FirstContract = await sphinx.getContract(
      projectName,
      "MyFirstContract",
      signer
    )
    SecondContract = await sphinx.getContract(
      projectName,
      "MySecondContract",
      signer
    )
  })

  it('initializes first constructor', async () => {
    expect(await FirstContract.myNumber()).equals(1)
    expect(await FirstContract.myAddress()).equals(FirstContract.address)
  })

  it('initializes second constructor', async () => {
    expect(await SecondContract.myNumber()).equals(2)
    expect(await SecondContract.myAddress()).equals(SecondContract.address)
  })

  it('increments first number', async () => {
    await FirstContract.increment()
    expect(await FirstContract.myNumber()).equals(2)
  })

  it('increments second number', async () => {
    await SecondContract.increment()
    expect(await SecondContract.myNumber()).equals(3)
  })
})
`

export const sampleTestFileJavaScript = `require('@sphinx-labs/plugins')
const { sphinx, ethers } = require('hardhat')
const { expect } = require('chai')
const { Signer, Contract } = require('ethers')

describe('HelloSphinx', () => {
  const projectName = 'MyProject'
  const signer = ethers.provider.getSigner()

  let FirstContract
  let SecondContract
  beforeEach(async () => {
    // Reset the contracts to their initial state.
    await sphinx.reset(ethers.provider)

    // Get the deployed contracts.
    FirstContract = await sphinx.getContract(
      projectName,
      "MyFirstContract",
      signer
    )
    SecondContract = await sphinx.getContract(
      projectName,
      "MySecondContract",
      signer
    )
  })

  it('initializes first constructor', async () => {
    expect(await FirstContract.myNumber()).equals(1)
    expect(await FirstContract.myAddress()).equals(FirstContract.address)
  })

  it('initializes second constructor', async () => {
    expect(await SecondContract.myNumber()).equals(2)
    expect(await SecondContract.myAddress()).equals(SecondContract.address)
  })

  it('increments first number', async () => {
    await FirstContract.increment()
    expect(await FirstContract.myNumber()).equals(2)
  })

  it('increments second number', async () => {
    await SecondContract.increment()
    expect(await SecondContract.myNumber()).equals(3)
  })
})
`
