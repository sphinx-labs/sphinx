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
  isLegacyTransactionsRequiredForNetwork,
  SphinxJsonRpcProvider,
} from '@sphinx-labs/core'
import ora from 'ora'
import { blue, red } from 'chalk'
import { ethers } from 'ethers'
import {
  ConfigArtifacts,
  DeploymentInfo,
  GetConfigArtifacts,
  ParsedConfig,
} from '@sphinx-labs/core/dist/config/types'
import {
  SphinxLeafType,
  SphinxMerkleTree,
  makeSphinxMerkleTree,
} from '@sphinx-labs/contracts'

import { makeParsedConfig, decodeDeploymentInfo } from '../../foundry/decode'
import { getFoundryToml } from '../../foundry/options'
import {
  getSphinxConfigFromScript,
  readInterface,
  compile,
  getInitCodeWithArgsArray,
  writeSystemContracts,
} from '../../foundry/utils'
import { SphinxContext } from '../context'
import { FoundryToml } from '../../foundry/types'
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
  const { testnets, mainnets } = await getSphinxConfigFromScript(
    scriptPath,
    sphinxPluginTypesInterface,
    targetContract,
    spinner
  )

  const systemContractsFilePath = writeSystemContracts(
    sphinxPluginTypesInterface,
    foundryToml.cachePath
  )

  const deploymentInfoPath = join(
    foundryToml.cachePath,
    'sphinx-deployment-info.txt'
  )
  const networkNames = isTestnet ? testnets : mainnets
  const collected: Array<{
    deploymentInfo: DeploymentInfo
    libraries: Array<string>
    forkUrl: string
  }> = []
  for (const networkName of networkNames) {
    const rpcUrl = foundryToml.rpcEndpoints[networkName]
    if (!rpcUrl) {
      console.error(
        red(
          `No RPC endpoint specified in your foundry.toml for the network: ${networkName}.`
        )
      )
      process.exit(1)
    }

    // Remove the existing DeploymentInfo file if it exists. This ensures that we don't accidentally
    // use a file from a previous deployment.
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
      deploymentInfoPath,
      systemContractsFilePath,
    ]

    const provider = new SphinxJsonRpcProvider(rpcUrl)
    if (
      isLegacyTransactionsRequiredForNetwork(
        (await provider.getNetwork()).chainId
      )
    ) {
      forgeScriptCollectArgs.push('--legacy')
    }
    if (targetContract) {
      forgeScriptCollectArgs.push('--target-contract', targetContract)
    }

    // Collect the transactions for the current network.
    const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs)

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
      sphinxPluginTypesInterface
    )

    checkLibraryVersion(deploymentInfo.sphinxLibraryVersion)

    collected.push({
      deploymentInfo,
      libraries: [], // We don't currently support linked libraries.
      forkUrl: rpcUrl,
    })
  }

  spinner?.succeed(`Collected transactions.`)

  spinner?.start(`Building proposal...`)

  const initCodeWithArgsArray = getInitCodeWithArgsArray(
    collected.flatMap(({ deploymentInfo }) => deploymentInfo.accountAccesses)
  )

  const configArtifacts = await getConfigArtifacts(initCodeWithArgsArray)

  const parsedConfigArray = collected.map(({ deploymentInfo, libraries }) =>
    makeParsedConfig(
      deploymentInfo,
      true, // System contracts are deployed.
      configArtifacts,
      libraries
    )
  )

  const isEmpty = parsedConfigArray.every(
    (parsedConfig) => parsedConfig.actionInputs.length === 0
  )
  if (isEmpty) {
    return {
      isEmpty: true,
      parsedConfigArray: undefined,
      configArtifacts: undefined,
    }
  }

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
