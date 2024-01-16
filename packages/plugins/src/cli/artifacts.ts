import {
  ExecutionMode,
  fetchDeploymentArtifacts,
  writeDeploymentArtifacts,
} from '@sphinx-labs/core'
import ora from 'ora'

import { FetchArtifactsArgs } from './types'

export const fetchRemoteArtifacts = async (args: FetchArtifactsArgs) => {
  const { apiKey, orgId, projectName, silent } = args

  const spinner = ora({ isSilent: silent })
  spinner.start(`Fetching artifacts...`)
  const deploymentArtifacts = await fetchDeploymentArtifacts(
    apiKey,
    orgId,
    projectName
  )

  spinner.succeed(`Fetched artifacts.`)
  spinner.start(`Writing artifacts...`)

  writeDeploymentArtifacts(
    projectName,
    ExecutionMode.Platform,
    deploymentArtifacts
  )

  spinner.succeed(`Wrote artifacts.`)
}
