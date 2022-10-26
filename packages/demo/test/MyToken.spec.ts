import { expect } from 'chai'
import { ethers } from 'hardhat'

describe('test', () => {
  let signer
  before(async () => {
    signer = await ethers.getSigner()
  })

  beforeEach(async () => {
    await chugsplash.reset()
  })

  let MyToken
  beforeEach(async () => {
    const x = 2
    const y = x + 2
    const factory = await ethers.getContractFactory('MyToken')
    const token = await factory.deploy(0)
    const artifact = await hre.artifacts.readArtifact('MyToken')
    const deployedCode = await signer.provider.getCode(token.address)

    let artifactStr = ''
    let deployedStr = ''
    for (let i = 0; i < deployedCode.length; i++) {
      const artifactChar = artifact.deployedBytecode.charAt(i)
      const deployedChar = deployedCode.charAt(i)

      if (artifactChar !== deployedChar) {
        artifactStr = artifactStr.concat(artifactChar)
        deployedStr = deployedStr.concat(deployedChar)
      }
    }
    console.log('art: ', artifactStr)
    console.log('dep: ', deployedStr)

    MyToken = await chugsplash.getContract('MyToken')
    await MyToken.mint(signer.address, 100)
  })

  it('works', async () => {
    expect(await MyToken.balanceOf(signer.address)).deep.equals(
      ethers.BigNumber.from(100)
    )
  })

  it('works again', async () => {
    expect(await MyToken.balanceOf(signer.address)).deep.equals(
      ethers.BigNumber.from(100)
    )
  })

  it('works again again', async () => {
    await MyToken.mint(signer.address, 50)

    expect(await MyToken.balanceOf(signer.address)).deep.equals(
      ethers.BigNumber.from(150)
    )
  })
})
