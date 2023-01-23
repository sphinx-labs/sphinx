import { ethers } from 'ethers'

export const getFinalDeploymentTxnHash = async (
  ChugSplashManager: ethers.Contract,
  bundleId: string
): Promise<string> => {
  const [finalDeploymentEvent] = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.ChugSplashBundleCompleted(bundleId)
  )
  return finalDeploymentEvent.transactionHash
}
