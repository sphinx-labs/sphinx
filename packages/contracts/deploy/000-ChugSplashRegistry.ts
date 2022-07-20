/* Imports: External */
import { DeployFunction } from 'hardhat-deploy/dist/types'

const deployFn: DeployFunction = async (hre) => {
  const { deployer } = await hre.getNamedAccounts()

  const { deploy } = await hre.deployments.deterministic('ChugSplashRegistry', {
    salt: hre.ethers.utils.solidityKeccak256(
      ['string'],
      ['ChugSplashRegistry']
    ),
    from: deployer,
    args: [],
    log: true,
  })

  await deploy()
}

deployFn.tags = ['ChugSplashRegistry']

export default deployFn
