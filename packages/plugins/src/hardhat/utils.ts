import { getChainId } from '@eth-optimism/core-utils'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

export const isRemoteExecution = async (
  hre: HardhatRuntimeEnvironment
): Promise<boolean> => {
  return process.env.FORCE_REMOTE_EXECUTION === 'true'
    ? true
    : (await getChainId(hre.ethers.provider)) !==
        hre.config.networks.hardhat.chainId
}
