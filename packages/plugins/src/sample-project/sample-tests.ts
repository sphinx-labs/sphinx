export const sampleTestFileTypeScript = `import '@chugsplash/plugins'
import { chugsplash, ethers } from 'hardhat'
import { expect } from 'chai'
import { Signer, Contract } from 'ethers'

describe('HelloChugSplash', () => {
  const projectName: string = 'MyFirstProject'
  const contractName: string = 'MyContract'
  const signer: Signer = ethers.provider.getSigner()

  let MyFirstContract: Contract
  beforeEach(async () => {
    // You must reset your ChugSplash deployments to their initial state here
    await chugsplash.reset()

    MyFirstContract = await chugsplash.getContract(
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

export const sampleTestFileJavaScript = `require('@chugsplash/plugins')
const { chugsplash, ethers } = require('hardhat')
const { expect } = require('chai')
const { Signer, Contract } = require('ethers')

describe('HelloChugSplash', () => {
  const projectName = 'MyFirstProject'
  const contractName = 'MyContract'
  const signer = ethers.provider.getSigner()

  let MyFirstContract
  beforeEach(async () => {
    // You must reset your ChugSplash deployments to their initial state here
    await chugsplash.reset()

    MyFirstContract = await chugsplash.getContract(
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
