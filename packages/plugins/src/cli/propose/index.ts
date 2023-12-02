import { join, resolve } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'

import {
  ProjectDeployment,
  ProposalRequest,
  WEBSITE_URL,
  elementsEqual,
  getMerkleTreeInfo,
  getPreview,
  getPreviewString,
  getProjectDeploymentForChain,
  getReadableActions,
  relayIPFSCommit,
  relayProposal,
  spawnAsync,
  userConfirmation,
} from '@sphinx-labs/core'
import ora from 'ora'
import { blue, red } from 'chalk'
import { ethers } from 'ethers'
import {
  ConfigArtifacts,
  DeploymentInfo,
  ParsedConfig,
  RawActionInput,
} from '@sphinx-labs/core/dist/config/types'

import {
  readActionInputsOnSingleChain,
  makeParsedConfig,
  decodeDeploymentInfo,
} from '../../foundry/decode'
import { getFoundryConfigOptions } from '../../foundry/options'
import {
  getSphinxConfigNetworksFromScript as getSphinxConfigNetworksFromScript,
  getSphinxSafeAddressFromScript,
  getUniqueNames,
  makeGetConfigArtifacts,
} from '../../foundry/utils'

export const buildParsedConfigArray = async (
  scriptPath: string,
  isTestnet: boolean,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<{
  parsedConfigArray: Array<ParsedConfig>
  configArtifacts: ConfigArtifacts
}> => {
  const foundryToml = await getFoundryConfigOptions()

  const getConfigArtifacts = makeGetConfigArtifacts(
    foundryToml.artifactFolder,
    foundryToml.buildInfoFolder,
    foundryToml.cachePath
  )

  // We must load any ABIs after running `forge build` to prevent a situation where the user clears
  // their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxPluginTypesABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${foundryToml.artifactFolder}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
    )).abi

  const deploymentInfoPath = join(foundryToml.cachePath, 'deployment-info.txt')

  const { testnets, mainnets } = await getSphinxConfigNetworksFromScript(
    scriptPath,
    targetContract,
    spinner
  )

  const networks = isTestnet ? testnets : mainnets

  const actionInputArray: Array<Array<RawActionInput>> = []
  const deploymentInfoArray: Array<DeploymentInfo> = []
  for (const network of networks) {
    const rpcUrl = foundryToml.rpcEndpoints[network]
    if (!rpcUrl) {
      console.error(
        red(
          `No RPC endpoint specified in your foundry.toml for the network: ${network}.`
        )
      )
      process.exit(1)
    }
    // Remove the file if it exists. This ensures that we don't accidentally use an outdated file.
    if (existsSync(deploymentInfoPath)) {
      unlinkSync(deploymentInfoPath)
    }

    const forgeScriptCollectArgs = [
      'script',
      scriptPath,
      '--rpc-url',
      rpcUrl,
      '--sig',
      'sphinxCollectProposal(string,string)',
      network,
      deploymentInfoPath,
    ]
    if (targetContract) {
      forgeScriptCollectArgs.push('--target-contract', targetContract)
    }

    const safeAddress = await getSphinxSafeAddressFromScript(
      scriptPath,
      rpcUrl,
      targetContract,
      spinner
    )

    // TODO - remove all references to `SphinxManager` or `SphinxAuth` in comments

    // Collect the transactions for the current network. We use the `FOUNDRY_SENDER` environment
    // variable to set the users Safe as the `msg.sender` to ensure that it's the caller for all
    // transactions. We need to do this even though we also broadcast from the Safe's
    // address in the script. Specifically, this is necessary if the user is deploying a contract
    // via CREATE2 that uses a linked library. In this scenario, the caller that deploys the library
    // would be Foundry's default sender if we don't set this environment variable. Note that
    // `FOUNDRY_SENDER` has priority over the `--sender` flag and the `DAPP_SENDER` environment
    // variable. Also, passing the environment variable directly into the script overrides the
    // user defining it in their `.env` file.
    // It's worth mentioning that we can't run a single Forge script for all networks using
    // cheatcodes like `vm.createSelectFork`. This is because we use the `FOUNDRY_SENDER`.
    // Specifically, the state of the Safe on the first fork is persisted across all forks
    // when using `FOUNDRY_SENDER`. This is problematic if the Safe doesn't have the same
    // state across networks. This is a Foundry quirk; it may be a bug.
    const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs, {
      FOUNDRY_SENDER: safeAddress,
    })

    if (spawnOutput.code !== 0) {
      spinner?.stop()
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
      foundryToml.broadcastFolder,
      'sphinxCollectProposal'
    )

    deploymentInfoArray.push(deploymentInfo)
    actionInputArray.push(actionInputs)
  }

  const { uniqueFullyQualifiedNames, uniqueContractNames } = getUniqueNames(
    actionInputArray,
    deploymentInfoArray
  )

  const configArtifacts = await getConfigArtifacts(
    uniqueFullyQualifiedNames,
    uniqueContractNames
  )
  const parsedConfigArray = deploymentInfoArray.map((deploymentInfo, i) =>
    makeParsedConfig(deploymentInfo, actionInputArray[i], configArtifacts, true)
  )

  return { parsedConfigArray, configArtifacts }
}

/**
 * @notice Calls the `sphinxProposeTask` Solidity function, then converts the output into a format
 * that can be sent to the back-end.
 *
 * @param dryRun If true, the proposal will not be relayed to the back-end.
 * @param targetContract The name of the contract within the script file. Necessary when there are
 * multiple contracts in the specified script.
 * @param skipForceRecompile Force re-compile the contracts. By default, we force re-compile. This
 * ensures that we're using the correct artifacts for the proposal. This is mostly out of an
 * abundance of caution, since using the incorrect contract artifact will prevent us from verifying
 * the contract on Etherscan and providing a deployment artifact for the contract.
 */
export const propose = async (
  confirm: boolean,
  isTestnet: boolean,
  dryRun: boolean,
  silent: boolean,
  scriptPath: string,
  targetContract?: string,
  skipForceRecompile: boolean = false,
  prompt: (q: string) => Promise<void> = userConfirmation
): Promise<{
  proposalRequest: ProposalRequest | undefined
  ipfsData: string | undefined
}> => {
  const apiKey = process.env.SPHINX_API_KEY
  if (!apiKey) {
    console.error("You must specify a 'SPHINX_API_KEY' environment variable.")
    process.exit(1)
  }

  // Compile to make sure the user's contracts are up to date.
  const forgeBuildArgs = silent ? ['build', '--silent'] : ['build']
  // Force re-compile the contracts unless it's explicitly been disabled. This ensures that we're
  // using the correct artifacts for proposals. This is mostly out of an abundance of caution, since
  // using an incorrect contract artifact will prevent us from creating the contract's deployment
  // and verifying it on Etherscan.
  if (!skipForceRecompile) {
    forgeBuildArgs.push('--force')
  }

  const { status: compilationStatus } = spawnSync(`forge`, forgeBuildArgs, {
    stdio: 'inherit',
  })
  // Exit the process if compilation fails.
  if (compilationStatus !== 0) {
    process.exit(1)
  }

  const spinner = ora({ isSilent: silent })
  spinner.start(`Collecting transactions...`)

  const foundryToml = await getFoundryConfigOptions()

  const { parsedConfigArray, configArtifacts } = await buildParsedConfigArray(
    scriptPath,
    isTestnet,
    targetContract,
    spinner
  )

  const { root, merkleTreeInfo, configUri } = await getMerkleTreeInfo(
    configArtifacts,
    parsedConfigArray
  )

  spinner.succeed(`Collected transactions.`)
  spinner.start(`Running simulation...`)

  const sphinxABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(`${foundryToml.artifactFolder}/Sphinx.sol/Sphinx.json`)).abi
  const sphinxIface = new ethers.Interface(sphinxABI)
  const simulateProposalFragment = sphinxIface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'sphinxSimulateProposal')
  if (!simulateProposalFragment) {
    throw new Error(
      `'sphinxSimulateProposal' not found in ABI. Should never happen.`
    )
  }

  const humanReadableActions: Array<
    {
      reason: string
      actionIndex: string
    }[]
  > = []
  for (const config of parsedConfigArray) {
    humanReadableActions.push(getReadableActions(config.actionInputs))
  }

  const proposalSimulationData = sphinxIface.encodeFunctionData(
    simulateProposalFragment,
    [isTestnet, root, merkleTreeInfo.merkleTree, humanReadableActions]
  )

  const proposalSimulationArgs = [
    'script',
    scriptPath,
    '--sig',
    proposalSimulationData,
  ]
  if (targetContract) {
    proposalSimulationArgs.push('--target-contract', targetContract)
  }

  const { stdout, stderr, code } = await spawnAsync(
    'forge',
    proposalSimulationArgs
  )
  if (code !== 0) {
    spinner.stop()
    // The `stdout` contains the trace of the error.
    console.log(stdout)
    // The `stderr` contains the error message.
    console.log(stderr)
    process.exit(1)
  }

  spinner.succeed(`Simulation succeeded.`)

  const preview = getPreview(merkleTreeInfo.compilerConfigs)
  if (confirm) {
    spinner.info(`Skipping preview.`)
  } else {
    const previewString = getPreviewString(preview, true)
    await prompt(previewString)
  }

  dryRun
    ? spinner.start('Dry running proposal...')
    : spinner.start(`Proposing...`)

  const shouldBeEqual = merkleTreeInfo.compilerConfigs.map((compilerConfig) => {
    return {
      newConfig: compilerConfig.newConfig,
      safeAddress: compilerConfig.safeAddress,
      moduleAddress: compilerConfig.moduleAddress,
      safeInitData: compilerConfig.safeInitData,
      safeInitSaltNonce: compilerConfig.safeInitSaltNonce,
    }
  })
  if (!elementsEqual(shouldBeEqual)) {
    throw new Error(
      `Detected different Safe or SphinxModule addresses for different chains. This is currently unsupported.` +
        `Please use the same Safe and SphinxModule on all chains.`
    )
  }
  // Since we know that the following fields are the same for each `compilerConfig`, we get their
  // values here.
  const {
    newConfig,
    safeAddress,
    moduleAddress,
    safeInitData,
    safeInitSaltNonce,
  } = merkleTreeInfo.compilerConfigs[0]

  const projectDeployments: Array<ProjectDeployment> = []
  // const compilerConfigs: {
  //   [ipfsHash: string]: string
  // } = {}
  const gasEstimates: ProposalRequest['gasEstimates'] = []
  for (const compilerConfig of merkleTreeInfo.compilerConfigs) {
    const { actionInputs } = compilerConfig

    const {} = merkleTreeInfo.compilerConfigs

    merkleTreeInfo.merkleTree.leavesWithProofs

    let estimatedGas = 0
    estimatedGas += actionInputs
      .map((a) => Number(a.gas))
      .reduce((a, b) => a + b, 0)

    // TODO - Get a more accurate estimate, or use the actual gas cost from the simulation.
    // Add a constant amount of gas to account for the overhead of the `execute` function
    estimatedGas += actionInputs.length * 200_000

    // Add a constant amount of gas to account for the cost of executing the `approve` function
    estimatedGas += 200_000

    gasEstimates.push({
      estimatedGas: estimatedGas.toString(),
      chainId: Number(compilerConfig.chainId),
    })

    const projectDeployment = getProjectDeploymentForChain(
      configUri,
      merkleTreeInfo.merkleTree,
      compilerConfig
    )
    if (projectDeployment) {
      projectDeployments.push(projectDeployment)
    }
  }

  const emptyBundle = merkleTreeInfo.merkleTree.leavesWithProofs.length === 0
  if (emptyBundle) {
    spinner.succeed(
      `Skipping proposal because there is nothing to propose on any chain.`
    )
    return { proposalRequest: undefined, ipfsData: undefined }
  }

  const chainStatus = merkleTreeInfo.compilerConfigs
    .map((compilerConfig) => ({
      chainId: Number(compilerConfig.chainId),
      numLeaves: compilerConfig.actionInputs.length + 1,
    }))
    .filter((b) => b.numLeaves > 0)

  const proposalRequest: ProposalRequest = {
    apiKey,
    orgId: newConfig.orgId,
    isTestnet,
    chainIds: merkleTreeInfo.compilerConfigs.map((compilerConfig) =>
      Number(compilerConfig.chainId)
    ),
    deploymentName: newConfig.projectName,
    owners: newConfig.owners,
    threshold: Number(newConfig.threshold),
    safeAddress,
    moduleAddress,
    safeInitData,
    safeInitSaltNonce,
    projectDeployments,
    gasEstimates,
    diff: preview,
    tree: {
      root: merkleTreeInfo.merkleTree.root,
      chainStatus,
    },
  }

  const ipfsData = JSON.stringify(merkleTreeInfo.compilerConfigs, null, 2)
  if (dryRun) {
    spinner.succeed(`Proposal dry run succeeded.`)
  } else {
    await relayProposal(proposalRequest)
    await relayIPFSCommit(apiKey, newConfig.orgId, [ipfsData])
    spinner.succeed(
      `Proposal succeeded! Go to ${blue.underline(
        WEBSITE_URL
      )} to approve the deployment.`
    )
  }
  return { proposalRequest, ipfsData }
}
