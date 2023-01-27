import { ethers } from 'ethers'

/**
 * Grabs the transaction hash of the transaction that completed the given bundle.
 *
 * @param ChugSplashManager ChugSplashManager contract instance.
 * @param bundleId ID of the bundle to look up.
 * @returns Transaction hash of the transaction that completed the bundle.
 */
export const getBundleCompletionTxnHash = async (
  ChugSplashManager: ethers.Contract,
  bundleId: string
): Promise<string> => {
  const events = await ChugSplashManager.queryFilter(
    ChugSplashManager.filters.ChugSplashBundleCompleted(bundleId)
  )

  // Might happen if we're asking for the event too quickly after completing the bundle.
  if (events.length === 0) {
    throw new Error(
      `no ChugSplashBundleCompleted event found for bundle ${bundleId}`
    )
  }

  // Shouldn't happen.
  if (events.length > 1) {
    throw new Error(
      `multiple ChugSplashBundleCompleted events found for bundle ${bundleId}`
    )
  }

  return events[0].transactionHash
}
