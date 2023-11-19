import { ethers } from 'ethers'
import ora from 'ora'

import { SphinxBundles, DeploymentState, DeploymentStatus } from '../actions'
import { getDeploymentEvents, sleep } from '../utils'
import { ParsedConfig } from '../config'

// export const monitorExecution = async (
//   signer: ethers.Signer,
//   parsedConfig: ParsedConfig,
//   bundles: SphinxBundles,
//   deploymentId: string,
//   silent: boolean
// ) => {
//   const spinner = ora({ isSilent: silent })
//   spinner.start('Waiting for executor...')
//   const { managerAddress } = parsedConfig
//   const SphinxManager = getSphinxManager(managerAddress, signer)

//   // Get the deployment state of the deployment ID.
//   let deploymentState: DeploymentState = await SphinxManager.deployments(
//     deploymentId
//   )

//   while (deploymentState.selectedExecutor === ethers.ZeroAddress) {
//     // Wait for one second.
//     await sleep(1000)

//     // Get the current deployment state.
//     deploymentState = await SphinxManager.deployments(deploymentId)
//   }

//   spinner.succeed('Executor has claimed the project.')
//   spinner.start('Executing actions...')

//   const totalNumActions = bundles.actionBundle.actions.length
//   while (
//     deploymentState.status !== DeploymentStatus.COMPLETED &&
//     deploymentState.status !== DeploymentStatus.CANCELED &&
//     deploymentState.status !== DeploymentStatus.FAILED
//   ) {
//     if (Number(deploymentState.actionsExecuted) === totalNumActions) {
//       spinner.start(`All actions have been executed. Completing execution...`)
//     } else {
//       spinner.start(
//         `Number of actions executed: ${Number(
//           deploymentState.actionsExecuted
//         )} out of ${totalNumActions}`
//       )
//     }

//     // Wait for one second.
//     await sleep(1000)

//     // Get the current deployment state.
//     deploymentState = await SphinxManager.deployments(deploymentId)
//   }

//   if (deploymentState.status === DeploymentStatus.COMPLETED) {
//     spinner.succeed(`Finished executing deployment.`)
//     spinner.start(`Retrieving deployment info...`)
//     const deploymentEvents = await getDeploymentEvents(
//       SphinxManager,
//       deploymentId
//     )
//     spinner.succeed('Retrieved deployment info.')
//     return deploymentEvents
//   } else if (deploymentState.status === DeploymentStatus.CANCELED) {
//     spinner.fail(`Deployment was canceled.`)
//     throw new Error(`Deployment was canceled.`)
//   } else if (deploymentState.status === DeploymentStatus.FAILED) {
//     spinner.fail(`Deployment failed.`)
//     throw new Error(`Deployment failed.`)
//   } else {
//     spinner.fail(
//       `Project Deployment ended in an unknown state: ${deploymentState.status}`
//     )
//   }
// }
