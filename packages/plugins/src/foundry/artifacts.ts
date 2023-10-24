import { join, sep } from 'path'

import { writeDeploymentArtifacts } from '@sphinx-labs/core/dist/actions/artifacts'
import {
  ConfigArtifacts,
  DeploymentInfo,
  ParsedConfig,
} from '@sphinx-labs/core/dist/config/types'
import {
  getDeploymentEvents,
  getNetworkDirName,
  getSphinxManagerReadOnly,
  isEventLog,
  isLiveNetwork,
  resolveNetwork,
} from '@sphinx-labs/core/dist/utils'
import 'core-js/features/array/at'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'

export const writeDeploymentArtifactsUsingEvents = async (
  provider: SphinxJsonRpcProvider,
  deploymentInfo: DeploymentInfo,
  configArtifacts: ConfigArtifacts,
  deploymentFolder: string
): Promise<string> => {
  const SphinxManager = getSphinxManagerReadOnly(
    deploymentInfo.managerAddress,
    provider
  )

  const eventFilter = SphinxManager.filters.SphinxDeploymentCompleted()
  const latestBlock = await provider.getBlockNumber()
  const startingBlock = latestBlock - 1999 > 0 ? latestBlock - 1999 : 0
  const deploymentCompletedEvent = (
    await SphinxManager.queryFilter(eventFilter, startingBlock, latestBlock)
  ).at(-1)

  if (!deploymentCompletedEvent) {
    console.error(`No deployment found. Should never happen.`)
    process.exit(1)
  }

  if (!isEventLog(deploymentCompletedEvent)) {
    console.error(`No event args. Should never happen.`)
    process.exit(1)
  }

  const deploymentId = deploymentCompletedEvent.args.deploymentId

  const isLiveNetwork_ = await isLiveNetwork(provider)
  const { networkName, chainId } = await resolveNetwork(
    await provider.getNetwork(),
    isLiveNetwork_
  )
  const networkDirName = getNetworkDirName(networkName, isLiveNetwork_, chainId)

  await writeDeploymentArtifacts(
    provider,
    deploymentInfo,
    await getDeploymentEvents(SphinxManager, deploymentId),
    networkDirName,
    deploymentFolder,
    configArtifacts
  )

  const deploymentArtifactsPath = join(deploymentFolder, networkDirName, sep)
  return deploymentArtifactsPath
}
