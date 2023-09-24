import { readFileSync } from 'fs'
import { join, sep } from 'path'

import { Ora } from 'ora'
import { writeDeploymentArtifacts } from '@sphinx-labs/core/dist/actions/artifacts'
import { DeploymentState } from '@sphinx-labs/core/dist/actions/types'
import { getSphinxManagerAddress } from '@sphinx-labs/core/dist/addresses'
import {
  CompilerConfig,
  ConfigArtifacts,
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

// TODO(artifacts)
// export const writeDeploymentArtifactsUsingEvents = async (
//   provider: SphinxJsonRpcProvider,
//   projectName: string,
//   ownerAddress: string,
//   cachePath: string,
//   deploymentFolder: string,
//   spinner: Ora
// ) => {
//   const managerAddress = getSphinxManagerAddress(ownerAddress, projectName)
//   const Manager = getSphinxManagerReadOnly(managerAddress, provider)

//   const eventFilter = Manager.filters.SphinxDeploymentCompleted()
//   const latestBlock = await provider.getBlockNumber()
//   const startingBlock = latestBlock - 1999 > 0 ? latestBlock - 1999 : 0
//   const deploymentCompletedEvent = (
//     await Manager.queryFilter(eventFilter, startingBlock, latestBlock)
//   ).at(-1)

//   if (!deploymentCompletedEvent) {
//     console.error(`No deployment found. Should never happen.`)
//     process.exit(1)
//   }

//   if (!isEventLog(deploymentCompletedEvent)) {
//     console.error(`No event args. Should never happen.`)
//     process.exit(1)
//   }

//   const deploymentId = deploymentCompletedEvent.args.deploymentId

//   const deployment: DeploymentState = await Manager.deployments(deploymentId)

//   const ipfsHash = deployment.configUri.replace('ipfs://', '')
//   const compilerConfig: CompilerConfig = JSON.parse(
//     readFileSync(`.compiler-configs/${ipfsHash}.json`).toString()
//   )

//   const networkType = await isLiveNetwork(provider)
//   const { networkName, chainId } = await resolveNetwork(
//     await provider.getNetwork(),
//     networkType
//   )
//   const networkDirName = getNetworkDirName(networkName, networkType, chainId)

//   const configArtifacts: ConfigArtifacts = JSON.parse(
//     readFileSync(`${cachePath}/configArtifacts/${ipfsHash}.json`).toString()
//   )

//   await writeDeploymentArtifacts(
//     provider,
//     compilerConfig,
//     await getDeploymentEvents(Manager, deploymentId),
//     networkDirName,
//     deploymentFolder,
//     configArtifacts
//   )

//   const deploymentArtifactsPath = join(deploymentFolder, networkDirName, sep)
//   spinner.succeed(`Wrote deployment artifacts to: ${deploymentArtifactsPath}`)
// }
