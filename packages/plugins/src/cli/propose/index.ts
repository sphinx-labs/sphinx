import { join } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'

import {
  ProjectDeployment,
  ProposalRequest,
  WEBSITE_URL,
  elementsEqual,
  getPreview,
  getPreviewString,
  makeDeploymentData,
  spawnAsync,
  getParsedConfigWithCompilerInputs,
  getNetworkNameForChainId,
} from '@sphinx-labs/core'
import ora from 'ora'
import { blue, red } from 'chalk'
import { ethers } from 'ethers'
import {
  ConfigArtifacts,
  DeploymentInfo,
  GetConfigArtifacts,
  ParsedConfig,
  RawActionInput,
} from '@sphinx-labs/core/dist/config/types'
import {
  SphinxLeafType,
  SphinxMerkleTree,
  makeSphinxMerkleTree,
} from '@sphinx-labs/contracts'

import {
  makeParsedConfig,
  decodeDeploymentInfo,
  convertFoundryDryRunToActionInputs,
  decodeDeploymentInfoArray,
} from '../../foundry/decode'
import { getFoundryToml } from '../../foundry/options'
import {
  getSphinxConfigFromScript,
  getSphinxLeafGasEstimates,
  getFoundrySingleChainDryRunPath,
  readFoundrySingleChainDryRun,
  readInterface,
  compile,
  getInitCodeWithArgsArray,
  readFoundryMultiChainDryRun,
  getFoundryMultiChainDryRunPath,
} from '../../foundry/utils'
import { SphinxContext } from '../context'
import { FoundrySingleChainDryRun, FoundryToml } from '../../foundry/types'
import { BuildParsedConfigArray } from '../types'
import { checkLibraryVersion } from '../utils'

/**
 * @param isDryRun If true, the proposal will not be relayed to the back-end.
 * @param targetContract The name of the contract within the script file. Necessary when there are
 * multiple contracts in the specified script.
 */
export interface ProposeArgs {
  confirm: boolean
  isTestnet: boolean
  isDryRun: boolean
  silent: boolean
  scriptPath: string
  sphinxContext: SphinxContext
  targetContract?: string
}

export const buildParsedConfigArray: BuildParsedConfigArray = async (
  scriptPath: string,
  isTestnet: boolean,
  sphinxPluginTypesInterface: ethers.Interface,
  foundryToml: FoundryToml,
  getConfigArtifacts: GetConfigArtifacts,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<{
  parsedConfigArray?: Array<ParsedConfig>
  configArtifacts?: ConfigArtifacts
  isEmpty: boolean
}> => {
  const { testnets, mainnets, safeAddress } = await getSphinxConfigFromScript(
    scriptPath,
    sphinxPluginTypesInterface,
    targetContract,
    spinner
  )

  const deploymentInfoArrayPath = join(
    foundryToml.cachePath,
    'sphinx-deployment-info.txt'
  )
  const networkNames = isTestnet ? testnets : mainnets

  // Remove the existing DeploymentInfo file if it exists. This ensures that we don't accidentally
  // use a file from a previous deployment.
  if (existsSync(deploymentInfoArrayPath)) {
    unlinkSync(deploymentInfoArrayPath)
  }

  const forgeScriptCollectArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxCollectProposal(string[],string)',
    `[${networkNames.join(',')}]`,
    deploymentInfoArrayPath,
  ]
  if (targetContract) {
    forgeScriptCollectArgs.push('--target-contract', targetContract)
  }

  // Collect the transactions for all networks.
  const dateBeforeForgeScript = new Date()
  const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs)

  if (spawnOutput.code !== 0) {
    spinner?.stop()
    // The `stdout` contains the trace of the error.
    console.log(spawnOutput.stdout)
    // The `stderr` contains the error message.
    console.log(spawnOutput.stderr)
    process.exit(1)
  }
  const abiEncodedDeploymentInfoArray = readFileSync(
    deploymentInfoArrayPath,
    'utf-8'
  )
  const deploymentInfoArray = decodeDeploymentInfoArray(
    abiEncodedDeploymentInfoArray,
    sphinxPluginTypesInterface
  )

  const functionName = `sphinxCollectProposal`
  const multichainDryRun =
    networkNames.length > 1
      ? readFoundryMultiChainDryRun(
          foundryToml.broadcastFolder,
          scriptPath,
          functionName,
          dateBeforeForgeScript
        )
      : undefined

      // TODO(later-later): refactor this into its own function?
  const collected: Array<{
    deploymentInfo: DeploymentInfo
    actionInputs: Array<RawActionInput>
    libraries: Array<string>
    forkUrl: string
  }> = []
  for (const deploymentInfo of deploymentInfoArray) {
    checkLibraryVersion(deploymentInfo.sphinxLibraryVersion)

    const networkName = getNetworkNameForChainId(BigInt(deploymentInfo.chainId))
    const rpcUrl = foundryToml.rpcEndpoints[networkName]
    if (!rpcUrl) {
      throw new Error(
        `No RPC endpoint specified in your foundry.toml for the network: ${networkName}.`
      )
    }

    let dryRunWithPath: {dryRun: FoundrySingleChainDryRun, dryRunPath: string } | undefined
    if (multichainDryRun) {

      const dryRun = multichainDryRun.deployments.find(
        (currentDryRun) =>
          currentDryRun.chain.toString() === deploymentInfo.chainId
      )
      if (dryRun) {
        dryRunWithPath = {
          dryRun,
          dryRunPath: getFoundryMultiChainDryRunPath(foundryToml.broadcastFolder, scriptPath, functionName)
        }
      }
    }

    if (!dryRunWithPath) {
      const dryRun = readFoundrySingleChainDryRun(
        foundryToml.broadcastFolder,
        scriptPath,
        deploymentInfo.chainId,
        functionName,
        dateBeforeForgeScript
      )
      if (dryRun) {
        dryRunWithPath = {
          dryRun,
          dryRunPath: getFoundrySingleChainDryRunPath(
            foundryToml.broadcastFolder,
            scriptPath,
            deploymentInfo.chainId,
            functionName
          )
        }
      }
    }

    let actionInputs: Array<RawActionInput> = []
    let libraries: Array<string> = []
    if (dryRunWithPath) {
      const { dryRun, dryRunPath } = dryRunWithPath

      actionInputs = convertFoundryDryRunToActionInputs(
        deploymentInfo,
        dryRun,
        dryRunPath
      )
      libraries = dryRun.libraries
    }

    collected.push({ deploymentInfo, actionInputs, libraries, forkUrl: rpcUrl })
  }

  spinner?.succeed(`Collected transactions.`)

  const isEmpty =
    collected.length === 0 ||
    collected.every(({ actionInputs }) => actionInputs.length === 0)
  if (isEmpty) {
    return {
      isEmpty: true,
      parsedConfigArray: undefined,
      configArtifacts: undefined,
    }
  }

  spinner?.start(`Estimating gas...`)

  const gasEstimatesArray = await getSphinxLeafGasEstimates(
    scriptPath,
    foundryToml,
    sphinxPluginTypesInterface,
    collected,
    targetContract,
    spinner
  )

  spinner?.succeed(`Estimated gas.`)
  spinner?.start(`Building proposal...`)

  const initCodeWithArgsArray = getInitCodeWithArgsArray(
    collected.flatMap(({ actionInputs }) => actionInputs)
  )

  const configArtifacts = await getConfigArtifacts(initCodeWithArgsArray)

  const parsedConfigArray = collected.map(
    ({ actionInputs, deploymentInfo, libraries }, i) =>
      makeParsedConfig(
        deploymentInfo,
        actionInputs,
        gasEstimatesArray[i],
        true, // System contracts are deployed.
        configArtifacts,
        libraries
      )
  )

  return {
    parsedConfigArray,
    configArtifacts,
    isEmpty: false,
  }
}

export const propose = async (
  args: ProposeArgs
): Promise<{
  proposalRequest?: ProposalRequest
  canonicalConfigData?: string
  configArtifacts?: ConfigArtifacts
  parsedConfigArray?: Array<ParsedConfig>
  merkleTree?: SphinxMerkleTree
}> => {
  const {
    confirm,
    isTestnet,
    isDryRun,
    silent,
    scriptPath,
    sphinxContext,
    targetContract,
  } = args

  const apiKey = process.env.SPHINX_API_KEY
  if (!apiKey) {
    console.error("You must specify a 'SPHINX_API_KEY' environment variable.")
    process.exit(1)
  }

  const projectRoot = process.cwd()

  // Run the compiler. It's necessary to do this before we read any contract interfaces.
  compile(
    silent,
    false // Do not force re-compile.
  )

  const spinner = ora({ isSilent: silent })
  spinner.start(`Collecting transactions...`)

  const foundryToml = await getFoundryToml()

  // We must load any ABIs after compiling the contracts to prevent a situation where the user
  // clears their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxPluginTypesInterface = readInterface(
    foundryToml.artifactFolder,
    'SphinxPluginTypes'
  )

  const getConfigArtifacts = sphinxContext.makeGetConfigArtifacts(
    foundryToml.artifactFolder,
    foundryToml.buildInfoFolder,
    projectRoot,
    foundryToml.cachePath
  )

  const { parsedConfigArray, configArtifacts, isEmpty } =
    await sphinxContext.buildParsedConfigArray(
      scriptPath,
      isTestnet,
      sphinxPluginTypesInterface,
      foundryToml,
      getConfigArtifacts,
      targetContract,
      spinner
    )

  if (isEmpty) {
    spinner.succeed(
      `Skipping proposal because there is nothing to execute on any chain.`
    )
    return {}
  }

  // Narrow the TypeScript type of the ParsedConfig and ConfigArtifacts.
  if (!parsedConfigArray || !configArtifacts) {
    throw new Error(
      `ParsedConfig or ConfigArtifacts not defined. Should never happen.`
    )
  }

  const deploymentData = makeDeploymentData(parsedConfigArray)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  spinner.succeed(`Built proposal.`)
  spinner.start(`Running simulation...`)

  const gasEstimatesPromises = parsedConfigArray
    .filter((parsedConfig) => parsedConfig.actionInputs.length > 0)
    .map((parsedConfig) =>
      sphinxContext.getNetworkGasEstimate(
        parsedConfigArray,
        parsedConfig.chainId,
        foundryToml
      )
    )
  const gasEstimates = await Promise.all(gasEstimatesPromises)

  spinner.succeed(`Simulation succeeded.`)
  const preview = getPreview(parsedConfigArray)
  if (confirm || isDryRun) {
    if (!silent) {
      const previewString = getPreviewString(preview, false)
      console.log(previewString)
    }
  } else {
    const previewString = getPreviewString(preview, true)
    await sphinxContext.prompt(previewString)
  }

  isDryRun
    ? spinner.start('Finishing dry run...')
    : spinner.start(`Proposing...`)

  const shouldBeEqual = parsedConfigArray.map((parsedConfig) => {
    return {
      newConfig: parsedConfig.newConfig,
      safeAddress: parsedConfig.safeAddress,
      moduleAddress: parsedConfig.moduleAddress,
      safeInitData: parsedConfig.safeInitData,
    }
  })
  if (!elementsEqual(shouldBeEqual)) {
    throw new Error(
      `Detected different Safe or SphinxModule addresses for different chains. This is currently unsupported.` +
        `Please use the same Safe and SphinxModule on all chains.`
    )
  }

  // Since we know that the following fields are the same for each network, we get their values
  // here.
  const { newConfig, safeAddress, moduleAddress, safeInitData } =
    parsedConfigArray[0]

  const projectDeployments: Array<ProjectDeployment> = []
  const chainStatus: Array<{
    chainId: number
    numLeaves: number
  }> = []
  const chainIds: Array<number> = []
  for (const parsedConfig of parsedConfigArray) {
    // We skip chains that don't have any transactions to execute to simplify Sphinx's backend
    // logic. From the perspective of the backend, these networks don't serve any purpose in the
    // `ProposalRequest`.
    if (parsedConfig.actionInputs.length === 0) {
      continue
    }

    const projectDeployment = getProjectDeploymentForChain(
      merkleTree,
      parsedConfig
    )
    if (projectDeployment) {
      projectDeployments.push(projectDeployment)
    }

    chainStatus.push({
      chainId: Number(parsedConfig.chainId),
      numLeaves: parsedConfig.actionInputs.length + 1,
    })
    chainIds.push(Number(parsedConfig.chainId))
  }

  const proposalRequest: ProposalRequest = {
    apiKey,
    orgId: newConfig.orgId,
    isTestnet,
    chainIds,
    deploymentName: newConfig.projectName,
    owners: newConfig.owners,
    threshold: Number(newConfig.threshold),
    safeAddress,
    moduleAddress,
    safeInitData,
    safeInitSaltNonce: newConfig.saltNonce,
    projectDeployments,
    gasEstimates,
    diff: preview,
    compilerConfigId: undefined,
    tree: {
      root: merkleTree.root,
      chainStatus,
    },
  }

  const compilerConfigs = getParsedConfigWithCompilerInputs(
    parsedConfigArray,
    configArtifacts
  )
  const canonicalConfigData = JSON.stringify(compilerConfigs, null, 2)

  if (isDryRun) {
    spinner.succeed(`Proposal dry run succeeded.`)
  } else {
    const compilerConfigId = await sphinxContext.storeCanonicalConfig(
      apiKey,
      newConfig.orgId,
      [canonicalConfigData]
    )
    proposalRequest.compilerConfigId = compilerConfigId

    await sphinxContext.relayProposal(proposalRequest)
    spinner.succeed(
      `Proposal succeeded! Go to ${blue.underline(
        WEBSITE_URL
      )} to approve the deployment.`
    )
  }
  return {
    proposalRequest,
    canonicalConfigData,
    configArtifacts,
    parsedConfigArray,
    merkleTree,
  }
}

const getProjectDeploymentForChain = (
  merkleTree: SphinxMerkleTree,
  parsedConfig: ParsedConfig
): ProjectDeployment | undefined => {
  const { newConfig, initialState, chainId } = parsedConfig

  const approvalLeaves = merkleTree.leavesWithProofs.filter(
    (l) =>
      l.leaf.leafType === SphinxLeafType.APPROVE &&
      l.leaf.chainId === BigInt(chainId)
  )

  if (approvalLeaves.length === 0) {
    return undefined
  } else if (approvalLeaves.length > 1) {
    throw new Error(
      `Found multiple approval leaves for chain ${chainId}. Should never happen.`
    )
  }

  const deploymentId = merkleTree.root

  return {
    chainId: Number(chainId),
    deploymentId,
    name: newConfig.projectName,
    isExecuting: initialState.isExecuting,
  }
}
