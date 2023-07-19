export const sampleTestFileTypeScript = `import '@sphinx/plugins'
import { sphinx, ethers } from 'hardhat'
import { expect } from 'chai'
import { Signer, Contract } from 'ethers'

describe('HelloSphinx', () => {
  const projectName: string = 'MyFirstProject'
  const contractName: string = 'MyContract'
  const signer: Signer = ethers.provider.getSigner()

  let MyFirstContract: Contract
  beforeEach(async () => {
    // You must reset your Sphinx deployments to their initial state here
    await sphinx.reset()

    MyFirstContract = await sphinx.getContract(
      projectName,
      contractName,
      signer
    )
  })

  it('initializes correctly', async () => {
    expect(await MyFirstContract.number()).equals(1)
  })
})
`

export const sampleTestFileJavaScript = `require('@sphinx/plugins')
const { sphinx, ethers } = require('hardhat')
const { expect } = require('chai')
const { Signer, Contract } = require('ethers')

describe('HelloSphinx', () => {
  const projectName = 'MyFirstProject'
  const contractName = 'MyContract'
  const signer = ethers.provider.getSigner()

  let MyFirstContract
  beforeEach(async () => {
    // You must reset your Sphinx deployments to their initial state here
    await sphinx.reset()

    MyFirstContract = await sphinx.getContract(
      projectName,
      contractName,
      signer
    )
  })

  it('initializes correctly', async () => {
    expect(await MyFirstContract.number()).equals(1)
  })
})
`
