import { basename, join, resolve } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'

import {
  displayDeploymentTable,
  isLiveNetwork,
  remove0x,
  spawnAsync,
} from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import {
  getPreview,
  getPreviewString,
  userConfirmation,
  getEtherscanEndpointForNetwork,
  SUPPORTED_NETWORKS,
  ParsedConfig,
  SphinxPreview,
} from '@sphinx-labs/core'
import { red } from 'chalk'
import ora from 'ora'
import { ethers } from 'ethers'

import {
  getBundleInfoArray,
  getSphinxManagerAddressFromScript,
  getUniqueNames,
  makeGetConfigArtifacts,
} from '../foundry/utils'
import { getFoundryConfigOptions } from '../foundry/options'
import {
  decodeDeploymentInfo,
  readActionInputsOnSingleChain,
  makeParsedConfig,
} from '../foundry/decode'
import { FoundryBroadcast } from '../foundry/types'
import { writeDeploymentArtifacts } from '../foundry/artifacts'

export const deploy = async (
  scriptPath: string,
  network: string,
  skipPreview: boolean,
  silent: boolean,
  targetContract?: string,
  verify?: boolean,
  skipForceRecompile: boolean = false,
  prompt: (q: string) => Promise<void> = userConfirmation
): Promise<{
  parsedConfig: ParsedConfig
  preview?: ReturnType<typeof getPreview>
}> => {
  const {
    artifactFolder,
    buildInfoFolder,
    cachePath,
    rpcEndpoints,
    deploymentFolder,
    etherscan,
    broadcastFolder,
  } = await getFoundryConfigOptions()

  const forkUrl = rpcEndpoints[network]
  if (!forkUrl) {
    console.error(
      red(
        `No RPC endpoint specified in your foundry.toml for the network: ${network}.`
      )
    )
    process.exit(1)
  }

  const chainId = SUPPORTED_NETWORKS[network]
  if (chainId === undefined) {
    throw new Error(
      `Network name ${network} is not supported. You must use a supported network: \n${Object.keys(
        SUPPORTED_NETWORKS
      ).join('\n')}`
    )
  }

  // If the verification flag is specified, then make sure there is an etherscan configuration for the target network
  if (verify) {
    if (!etherscan || !etherscan[network]) {
      const endpoint = getEtherscanEndpointForNetwork(chainId)
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

  const provider = new SphinxJsonRpcProvider(forkUrl)
  // Force re-compile the contracts if this step hasn't been disabled and if we're on a live
  // network. This ensures that we're using the correct artifacts for the deployment. This is mostly
  // out of an abundance of caution, since using the incorrect contract artifact will prevent us
  // from writing the deployment artifact.
  if (!skipForceRecompile && (await isLiveNetwork(provider))) {
    const forgeCleanArgs = silent ? ['clean', '--silent'] : ['clean']
    const { status: cleanStatus } = spawnSync(`forge`, forgeCleanArgs, {
      stdio: 'inherit',
    })
    // Exit the process if the clean fails.
    if (cleanStatus !== 0) {
      process.exit(1)
    }
  }

  // Compile to make sure the user's contracts are up to date.
  const forgeBuildArgs = silent ? ['build', '--silent'] : ['build']
  const { status: compilationStatus } = spawnSync(`forge`, forgeBuildArgs, {
    stdio: 'inherit',
  })
  // Exit the process if compilation fails.
  if (compilationStatus !== 0) {
    process.exit(1)
  }

  // We must load any ABIs after running `forge build` to prevent a situation where the user clears
  // their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxPluginTypesABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${artifactFolder}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
    )).abi

  const getConfigArtifacts = makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    cachePath
  )

  const spinner = ora({ isSilent: silent })
  spinner.start(`Collecting transactions...`)

  const deploymentInfoPath = join(cachePath, 'deployment-info.txt')

  // Remove the existing DeploymentInfo file if it exists. This ensures that we don't accidentally
  // use an outdated file.
  if (existsSync(deploymentInfoPath)) {
    unlinkSync(deploymentInfoPath)
  }

  const forgeScriptCollectArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxCollectDeployment(string,string)',
    network,
    deploymentInfoPath,
    '--rpc-url',
    forkUrl,
  ]
  if (targetContract) {
    forgeScriptCollectArgs.push('--target-contract', targetContract)
  }

  const managerAddress = await getSphinxManagerAddressFromScript(
    scriptPath,
    forkUrl,
    targetContract,
    spinner
  )

  // Collect the transactions. We use the `FOUNDRY_SENDER` environment variable to set the
  // SphinxManager as the `msg.sender` to ensure that it's the caller for all transactions. We need
  // to do this even though we also broadcast from the SphinxManager's address in the script.
  // Specifically, this is necessary if the user is deploying a contract via CREATE2 that uses a
  // linked library. In this scenario, the caller that deploys the library would be Foundry's
  // default sender if we don't set this environment variable. Note that `FOUNDRY_SENDER` has
  // priority over the `--sender` flag and the `DAPP_SENDER` environment variable.
  const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs, {
    FOUNDRY_SENDER: managerAddress,
  })

  if (spawnOutput.code !== 0) {
    spinner.stop()
    // The `stdout` contains the trace of the error.
    console.log(spawnOutput.stdout)
    // The `stderr` contains the error message.
    console.log(spawnOutput.stderr)
    process.exit(1)
  }

  const abiEncodedDeploymentInfo = readFileSync(deploymentInfoPath, 'utf-8')
  const deploymentInfo = decodeDeploymentInfo(
    abiEncodedDeploymentInfo,
    sphinxPluginTypesABI
  )

  const actionInputs = readActionInputsOnSingleChain(
    deploymentInfo,
    scriptPath,
    broadcastFolder,
    'sphinxCollectDeployment'
  )

  const { uniqueFullyQualifiedNames, uniqueContractNames } = getUniqueNames(
    [actionInputs],
    [deploymentInfo]
  )

  const configArtifacts = await getConfigArtifacts(
    uniqueFullyQualifiedNames,
    uniqueContractNames
  )
  const parsedConfig = makeParsedConfig(
    deploymentInfo,
    actionInputs,
    configArtifacts,
    // On Anvil nodes, we must set `remoteExecution` to `true` because we use the remote execution
    // flow in this case (e.g. we call `manager.claimDeployment` in Solidity).
    !deploymentInfo.isLiveNetwork
  )

  spinner.succeed(`Collected transactions.`)

  let preview: SphinxPreview | undefined
  if (skipPreview) {
    spinner.info(`Skipping preview.`)
  } else {
    preview = getPreview([parsedConfig])

    const emptyDeployment = parsedConfig.actionInputs.every(
      (action) => action.skip
    )

    spinner.stop()
    if (emptyDeployment) {
      if (!silent) {
        spinner.info(`Nothing to deploy exiting early.`)
      }
      return { parsedConfig, preview }
    } else {
      const previewString = getPreviewString(preview, true)
      await prompt(previewString)
    }
  }

  const { authRoot, bundleInfoArray } = await getBundleInfoArray(
    configArtifacts,
    [parsedConfig]
  )
  if (bundleInfoArray.length !== 1) {
    throw new Error(
      `Bundle info array has incorrect length. Should never happen`
    )
  }
  const bundleInfo = bundleInfoArray[0]

  const sphinxABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(`${artifactFolder}/Sphinx.sol/Sphinx.json`)).abi
  const sphinxIface = new ethers.Interface(sphinxABI)
  const deployTaskFragment = sphinxIface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'sphinxDeployTask')
  if (!deployTaskFragment) {
    throw new Error(`'sphinxDeployTask' not found in ABI. Should never happen.`)
  }

  const deployTaskData = sphinxIface.encodeFunctionData(deployTaskFragment, [
    network,
    authRoot,
    bundleInfo,
  ])

  const forgeScriptDeployArgs = [
    'script',
    scriptPath,
    '--sig',
    deployTaskData,
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

  spinner.start(`Deploying...`)

  const { code, stdout, stderr } = await spawnAsync(
    'forge',
    forgeScriptDeployArgs
  )

  spinner.stop()
  if (code !== 0) {
    // The `stdout` contains the trace of the error.
    console.log(stdout)
    // The `stderr` contains the error message.
    console.log(stderr)
    process.exit(1)
  } else if (!silent) {
    console.log(stdout)
  }

  spinner.start(`Writing contract deployment artifacts...`)

  const containsDeployment = parsedConfig.actionInputs.some(
    (e) => Object.keys(e.contracts).length > 0
  )

  if (containsDeployment) {
    const broadcastFilePath = join(
      broadcastFolder,
      basename(scriptPath),
      chainId.toString(),
      `${remove0x(deployTaskFragment.selector)}-latest.json`
    )

    const broadcast: FoundryBroadcast = JSON.parse(
      readFileSync(broadcastFilePath, 'utf-8')
    )

    const deploymentArtifactPath = await writeDeploymentArtifacts(
      provider,
      parsedConfig,
      bundleInfo.actionBundle.actions,
      broadcast,
      deploymentFolder,
      configArtifacts
    )
    spinner.succeed(
      `Wrote contract deployment artifacts to: ${deploymentArtifactPath}`
    )
  } else {
    spinner.succeed(`No contract deployment artifacts to write.`)
  }

  if (!silent) {
    displayDeploymentTable(parsedConfig)
  }

  return { parsedConfig, preview }
}
