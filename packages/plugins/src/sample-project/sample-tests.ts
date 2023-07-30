export const sampleTestFileTypeScript = `import '@sphinx/plugins'
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
      "ContractOne",
      signer
    )
    SecondContract = await sphinx.getContract(
      projectName,
      "ContractTwo",
      signer
    )
  })

  it('initializes first constructor', async () => {
    expect(await FirstContract.number()).equals(1)
    expect(await FirstContract.contractOne()).equals(FirstContract.address)
  })

  it('initializes second constructor', async () => {
    expect(await SecondContract.number()).equals(2)
    expect(await SecondContract.contractOne()).equals(FirstContract.address)
  })

  it('increments first number', async () => {
    await FirstContract.increment()
    expect(await FirstContract.number()).equals(2)
  })

  it('increments second number', async () => {
    await SecondContract.increment()
    expect(await SecondContract.number()).equals(3)
  })
})
`

export const sampleTestFileJavaScript = `require('@sphinx/plugins')
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
      "ContractOne",
      signer
    )
    SecondContract = await sphinx.getContract(
      projectName,
      "ContractTwo",
      signer
    )
  })

  it('initializes first constructor', async () => {
    expect(await FirstContract.number()).equals(1)
    expect(await FirstContract.contractOne()).equals(FirstContract.address)
  })

  it('initializes second constructor', async () => {
    expect(await SecondContract.number()).equals(2)
    expect(await SecondContract.contractOne()).equals(FirstContract.address)
  })

  it('increments first number', async () => {
    await FirstContract.increment()
    expect(await FirstContract.number()).equals(2)
  })

  it('increments second number', async () => {
    await SecondContract.increment()
    expect(await SecondContract.number()).equals(3)
  })
})
`
