import { readFileSync } from 'fs'
import { join, sep } from 'path'

import { writeDeploymentArtifacts } from '@sphinx/core/dist/actions/artifacts'
import { DeploymentState } from '@sphinx/core/dist/actions/types'
import { getSphinxManagerAddress } from '@sphinx/core/dist/addresses'
import { CompilerConfig, ConfigArtifacts } from '@sphinx/core/dist/config/types'
import {
  getDeploymentEvents,
  getNetworkDirName,
  getNetworkType,
  getSphinxManagerReadOnly,
  resolveNetwork,
} from '@sphinx/core/dist/utils'
import { providers } from 'ethers/lib/ethers'
import { Ora } from 'ora'

import 'core-js/features/array/at'

export const writeDeploymentArtifactsUsingEvents = async (
  provider: providers.JsonRpcProvider,
  projectName: string,
  ownerAddress: string,
  cachePath: string,
  deploymentFolder: string,
  spinner: Ora
) => {
  const managerAddress = getSphinxManagerAddress(ownerAddress, projectName)
  const Manager = getSphinxManagerReadOnly(managerAddress, provider)

  const deploymentCompletedEvent = (
    await Manager.queryFilter(Manager.filters.SphinxDeploymentCompleted())
  ).at(-1)

  if (!deploymentCompletedEvent) {
    console.error(`No deployment found. Should never happen.`)
    process.exit(1)
  }

  if (!deploymentCompletedEvent.args) {
    console.error(`No event args. Should never happen.`)
    process.exit(1)
  }

  const deploymentId = deploymentCompletedEvent.args.deploymentId

  const deployment: DeploymentState = await Manager.deployments(deploymentId)

  const ipfsHash = deployment.configUri.replace('ipfs://', '')
  const compilerConfig: CompilerConfig = JSON.parse(
    readFileSync(`.compiler-configs/${ipfsHash}.json`).toString()
  )

  const networkType = await getNetworkType(provider)
  const { networkName, chainId } = await resolveNetwork(provider, networkType)
  const networkDirName = getNetworkDirName(networkName, networkType, chainId)

  const configArtifacts: ConfigArtifacts = JSON.parse(
    readFileSync(`${cachePath}/configArtifacts/${ipfsHash}.json`).toString()
  )

  await writeDeploymentArtifacts(
    provider,
    compilerConfig,
    await getDeploymentEvents(Manager, deploymentId),
    networkDirName,
    deploymentFolder,
    configArtifacts
  )

  const deploymentArtifactsPath = join(deploymentFolder, networkDirName, sep)
  spinner.succeed(`Wrote deployment artifacts to: ${deploymentArtifactsPath}`)
}
