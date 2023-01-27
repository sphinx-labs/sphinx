import hre from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'

const main = async () => {
  const signer = hre.ethers.provider.getSigner()

  const factory = await hre.ethers.getContractFactory('HelloChugSplash')
  const proxy = await hre.upgrades.deployProxy(factory, [], {
    kind: 'uups',
    unsafeAllow: ['missing-public-upgradeto'],
  })

  const newImpl = await factory.deploy()
  await hre.upgrades.upgradeProxy(proxy, factory, {
    unsafeAllow: ['missing-public-upgradeto'],
  })
}

main()
