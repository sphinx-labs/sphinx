import { ethers } from 'ethers'
import ora from 'ora'
import yesno from 'yesno'

import { trackProposed } from '../analytics'
import { ParsedChugSplashConfig, verifyBundle } from '../config'
import { Integration } from '../constants'
import { ArtifactPaths } from '../languages'
import { resolveNetworkName } from '../messages'
import { chugsplashCommitAbstractSubtask } from '../tasks'
import {
  checkIsUpgrade,
  getProjectOwnerAddress,
  isProposer,
  checkValidUpgrade,
  getChugSplashManager,
  getGasPriceOverrides,
  computeBundleId,
} from '../utils'
import { ChugSplashActionBundle } from './types'

export const proposeChugSplashBundle = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  parsedConfig: ParsedChugSplashConfig,
  bundle: ChugSplashActionBundle,
  configUri: string,
  remoteExecution: boolean,
  ipfsUrl: string,
  configPath: string,
  spinner: ora.Ora = ora({ isSilent: true }),
  confirm: boolean,
  artifactPaths: ArtifactPaths,
  buildInfoFolder: string,
  artifactFolder: string,
  canonicalConfigPath: string,
  silent: boolean,
  integration: Integration
) => {
  const signerAddress = await signer.getAddress()
  const projectName = parsedConfig.options.projectName

  spinner.start(`Checking if the caller is a proposer...`)

  // Throw an error if the caller isn't the project owner or a proposer.
  if (
    signerAddress !== (await getProjectOwnerAddress(signer, projectName)) &&
    !(await isProposer(provider, projectName, signerAddress))
  ) {
    throw new Error(
      `Caller is not a proposer or the project owner. Caller's address: ${signerAddress}`
    )
  }

  spinner.succeed(`Caller is a proposer.`)

  // Determine if the deployment is an upgrade
  spinner.start(
    `Checking if ${projectName} is a fresh deployment or upgrade...`
  )
  const upgradeReferenceName = await checkIsUpgrade(provider, parsedConfig)
  if (upgradeReferenceName) {
    // Check if upgrade is valid
    await checkValidUpgrade(provider, parsedConfig, configPath)

    spinner.succeed(`${projectName} is an upgrade.`)

    if (!confirm) {
      // Confirm upgrade with user
      const userConfirmed = await yesno({
        question: `Prior deployment(s) detected for project ${projectName}, would you like to perform an upgrade? (y/n)`,
      })
      if (!userConfirmed) {
        throw new Error(
          `User denied upgrade. The reference name ${upgradeReferenceName} inside ${projectName} was already used
  in a previous deployment for this project. To perform a fresh deployment of a new project, you must change the project name to
  something other than ${projectName}. If you wish to deploy a new contract within this project you must change the
  reference name to something other than ${upgradeReferenceName}.`
        )
      }
    }
  } else {
    spinner.succeed(`${projectName} is not an upgrade.`)
  }

  spinner.start(`Proposing ${projectName}...`)

  const ChugSplashManager = getChugSplashManager(signer, projectName)

  if (remoteExecution) {
    await chugsplashCommitAbstractSubtask(
      provider,
      signer,
      parsedConfig,
      ipfsUrl,
      true,
      artifactPaths,
      buildInfoFolder,
      canonicalConfigPath,
      integration,
      spinner
    )
    // Verify that the bundle has been committed to IPFS with the correct bundle hash.
    await verifyBundle({
      configUri,
      bundleId: computeBundleId(bundle.root, bundle.actions.length, configUri),
      ipfsUrl,
      artifactPaths,
      integration,
    })
  }
  // Propose the bundle.
  await (
    await ChugSplashManager.proposeChugSplashBundle(
      bundle.root,
      bundle.actions.length,
      configUri,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  const networkName = await resolveNetworkName(provider, integration)
  await trackProposed(
    await getProjectOwnerAddress(signer, projectName),
    projectName,
    networkName,
    integration
  )

  spinner.succeed(`Proposed ${projectName}.`)
}
