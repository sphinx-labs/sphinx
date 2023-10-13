import { join, resolve } from 'path'
import { spawnSync } from 'child_process'
import { readFileSync, existsSync, unlinkSync } from 'fs'

import ora from 'ora'
import {
  displayDeploymentTable,
  makeParsedConfig,
  spawnAsync,
} from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import {
  getPreview,
  getPreviewString,
  userConfirmation,
  SphinxActionType,
  getEtherscanEndpointForNetwork,
  SUPPORTED_NETWORKS,
  ConfigArtifacts,
  ParsedConfig,
} from '@sphinx-labs/core'
import 'core-js/features/array/at'

import { red } from 'chalk'

// TODO: instead of running `forge build` at the beginning of the deploy and propose commands,
// should we run `sphinx generate`?

import { makeGetConfigArtifacts } from '../foundry/utils'
import { getFoundryConfigOptions } from '../foundry/options'
import { decodeDeploymentInfo } from '../foundry/decode'
import { writeDeploymentArtifactsUsingEvents } from '../foundry/artifacts'

export const deploy = async (
  scriptPath: string,
  network: string,
  skipPreview: boolean,
  // silent: boolean, // TODO: add this field to the `deploy` call everywhere
  targetContract?: string,
  verify?: boolean,
  prompt: (q: string) => Promise<void> = userConfirmation
): Promise<{
  deployedParsedConfig?: ParsedConfig
  previewParsedConfig?: ParsedConfig
}> => {
  // First, we compile the contracts to make sure we're using the latest versions. This command
  // displays the compilation process to the user in real time.
  const { status: compilationStatus } = spawnSync(`forge`, ['build'], {
    stdio: 'inherit',
  })
  // Exit the process if compilation fails.
  if (compilationStatus !== 0) {
    process.exit(1)
  }

  const {
    artifactFolder,
    buildInfoFolder,
    cachePath,
    rpcEndpoints,
    deploymentFolder,
    etherscan,
  } = await getFoundryConfigOptions()

  // If the verification flag is specified, then make sure there is an etherscan configuration for the target network
  if (verify) {
    if (!etherscan || !etherscan[network]) {
      const endpoint = getEtherscanEndpointForNetwork(network)
      console.error(
        red(
          `No etherscan configuration detected for ${network}. Please configure it in your foundry.toml file:\n` +
            `[etherscan]\n` +
            `${network} = { key = "<your api key>", url = "${endpoint.urls.apiURL}", chain = ${SUPPORTED_NETWORKS[network]} }`
        )
      )
      process.exit(1)
    }
  }

  // We must load this ABI after running `forge build` to prevent a situation where the user
  // clears their artifacts then calls this task, in which case the `SphinxPluginTypes` artifact
  // won't exist yet.
  const SphinxPluginTypesABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${artifactFolder}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
    )).abi

  const getConfigArtifacts = makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    cachePath
  )

  const forkUrl = rpcEndpoints[network]
  if (!forkUrl) {
    console.error(
      red(
        `No RPC endpoint specified in your foundry.toml for the network: ${network}.`
      )
    )
    process.exit(1)
  }

  const deploymentInfoPath = join(cachePath, 'sphinx-chain-info.txt')

  const spinner = ora()
  let previewParsedConfig: ParsedConfig | undefined
  let previewConfigArtifacts: ConfigArtifacts | undefined
  if (skipPreview) {
    spinner.info(`Skipping preview.`)
  } else {
    spinner.start(`Generating preview...`)

    // Delete the deployment info if one already exists. This isn't strictly necessary, but it
    // ensures that we don't accidentally display an outdated preview to the user.
    if (existsSync(deploymentInfoPath)) {
      unlinkSync(deploymentInfoPath)
    }

    const forgeScriptPreviewArgs = [
      'script',
      scriptPath,
      '--sig',
      'sphinxDeployTask(string,string)',
      network,
      deploymentInfoPath,
      '--rpc-url',
      forkUrl,
    ]
    if (targetContract) {
      forgeScriptPreviewArgs.push('--target-contract', targetContract)
    }

    const { stdout, stderr, code } = await spawnAsync(
      'forge',
      forgeScriptPreviewArgs
    )
    if (code !== 0) {
      spinner.stop()
      // The `stdout` contains the trace of the error.
      console.log(stdout)
      // The `stderr` contains the error message.
      console.log(stderr)
      process.exit(1)
    }

    const encodedPreviewDeploymentInfo = readFileSync(
      deploymentInfoPath,
      'utf8'
    )
    const previewDeploymentInfo = decodeDeploymentInfo(
      encodedPreviewDeploymentInfo,
      SphinxPluginTypesABI
    )
    previewConfigArtifacts = await getConfigArtifacts(
      previewDeploymentInfo.actionInputs.map(
        (actionInput) => actionInput.fullyQualifiedName
      )
    )
    previewParsedConfig = makeParsedConfig(
      previewDeploymentInfo,
      previewConfigArtifacts
    )

    const preview = getPreview([previewParsedConfig])

    const emptyDeployment = previewParsedConfig.actionInputs.every(
      (action) => action.skip
    )

    spinner.stop()
    if (emptyDeployment) {
      const previewString = getPreviewString(preview, false)
      console.log(previewString)
      return { previewParsedConfig }
    } else {
      const previewString = getPreviewString(preview, true)
      await prompt(previewString)
    }
  }

  // Delete the deployment info if one already exists. This isn't strictly necessary, but it ensures
  // that we use the most recent deployment info when writing the deployment artifacts.
  if (existsSync(deploymentInfoPath)) {
    unlinkSync(deploymentInfoPath)
  }

  const forgeScriptDeployArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxDeployTask(string,string)',
    network,
    deploymentInfoPath,
    '--fork-url',
    forkUrl,
    '--broadcast',
  ]
  if (verify) {
    forgeScriptDeployArgs.push('--verify')
  }
  if (targetContract) {
    forgeScriptDeployArgs.push('--target-contract', targetContract)
  }

  const { status } = spawnSync(`forge`, forgeScriptDeployArgs, {
    stdio: 'inherit',
  })
  if (status !== 0) {
    process.exit(1)
  }

  spinner.start(`Writing deployment artifacts...`)

  const encodedDeploymentInfo = readFileSync(deploymentInfoPath, 'utf8')
  const deploymentInfo = decodeDeploymentInfo(
    encodedDeploymentInfo,
    SphinxPluginTypesABI
  )
  const configArtifacts = previewConfigArtifacts
    ? previewConfigArtifacts
    : await getConfigArtifacts(
        deploymentInfo.actionInputs.map(
          (actionInput) => actionInput.fullyQualifiedName
        )
      )
  const parsedConfig = makeParsedConfig(deploymentInfo, configArtifacts)

  const containsDeployment = parsedConfig.actionInputs.some(
    (action) =>
      action.actionType === SphinxActionType.DEPLOY_CONTRACT.toString() &&
      !action.skip
  )

  if (containsDeployment) {
    const provider = new SphinxJsonRpcProvider(forkUrl)
    const deploymentArtifactPath = await writeDeploymentArtifactsUsingEvents(
      provider,
      parsedConfig,
      configArtifacts,
      deploymentFolder
    )
    spinner.succeed(`Wrote deployment artifacts to: ${deploymentArtifactPath}`)
  } else {
    spinner.succeed(`No deployment artifacts to write.`)
  }

  displayDeploymentTable(parsedConfig)

  return {
    deployedParsedConfig: parsedConfig,
    previewParsedConfig,
  }
}
