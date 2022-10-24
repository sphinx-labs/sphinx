/* Imports: External */
import { DeployFunction } from 'hardhat-deploy/dist/types'
import { utils } from 'ethers'

const executorBondAmount = utils.parseEther('0.1')
const executionLockTime = 15 * 60 // 15 minutes
const ownerBondAmount = utils.parseEther('0.1')

const deployFn: DeployFunction = async (hre) => {
  const { deployer } = await hre.getNamedAccounts()

  const { deploy } = await hre.deployments.deterministic(
    'ChugSplashBootLoader',
    {
      salt: hre.ethers.utils.solidityKeccak256(
        ['string'],
        ['ChugSplashBootLoader']
      ),
      from: deployer,
      args: [deployer, executorBondAmount, executionLockTime, ownerBondAmount],
      log: true,
    }
  )
  await deploy()
}

deployFn.tags = ['ChugSplashBootLoader']

export default deployFn
