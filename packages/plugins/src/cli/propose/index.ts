import { join, relative } from 'path'
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
  isLegacyTransactionsRequiredForNetwork,
  SphinxJsonRpcProvider,
  isFile,
  MAX_UINT64,
  makeDeploymentConfig,
  DEFAULT_CALL_DEPTH,
  syncSphinxLock,
} from '@sphinx-labs/core'
import ora from 'ora'
import { blue } from 'chalk'
import { ethers } from 'ethers'
import {
  BuildInfos,
  ConfigArtifacts,
  DeploymentInfo,
  GetConfigArtifacts,
  NetworkConfig,
} from '@sphinx-labs/core/dist/config/types'
import {
  SphinxLeafType,
  SphinxMerkleTree,
  makeSphinxMerkleTree,
} from '@sphinx-labs/contracts'

import { makeNetworkConfig, decodeDeploymentInfo } from '../../foundry/decode'
import { getFoundryToml } from '../../foundry/options'
import {
  getSphinxConfigFromScript,
  readInterface,
  compile,
  getInitCodeWithArgsArray,
  assertValidVersions,
  validateProposalNetworks,
  parseScriptFunctionCalldata,
  assertContractSizeLimitNotExceeded,
} from '../../foundry/utils'
import { SphinxContext } from '../context'
import { FoundryToml } from '../../foundry/types'
import { BuildNetworkConfigArray } from '../types'
import { SPHINX_PLUGINS_VERSION } from '../version'

/**
 * @param isDryRun If true, the proposal will not be relayed to the back-end.
 * @param targetContract The name of the contract within the script file. Necessary when there are
 * multiple contracts in the specified script.
 */
export interface ProposeArgs {
  confirm: boolean
  networks: Array<string>
  isDryRun: boolean
  silent: boolean
  scriptPath: string
  sphinxContext: SphinxContext
  targetContract?: string
  sig?: Array<string>
}

export const buildNetworkConfigArray: BuildNetworkConfigArray = async (
  scriptPath: string,
  scriptFunctionCalldata: string,
  safeAddress: string,
  rpcUrls: Array<string>,
  sphinxPluginTypesInterface: ethers.Interface,
  foundryToml: FoundryToml,
  projectRoot: string,
  getConfigArtifacts: GetConfigArtifacts,
  sphinxContext: SphinxContext,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<{
  networkConfigArrayWithRpcUrls?: Array<{
    networkConfig: NetworkConfig
    rpcUrl: string
  }>
  configArtifacts?: ConfigArtifacts
  buildInfos?: BuildInfos
  isEmpty: boolean
}> => {
  const deploymentInfoPath = join(
    foundryToml.cachePath,
    'sphinx-deployment-info.txt'
  )
  const collected: Array<{
    deploymentInfo: DeploymentInfo
    libraries: Array<string>
    rpcUrl: string
  }> = []
  for (const rpcUrl of rpcUrls) {
    // Remove the existing DeploymentInfo file if it exists. This ensures that we don't accidentally
    // use a file from a previous deployment.
    if (existsSync(deploymentInfoPath)) {
      unlinkSync(deploymentInfoPath)
    }

    const provider = new SphinxJsonRpcProvider(rpcUrl)
    const blockNumber = await provider.getBlockNumber()

    const forgeScriptCollectArgs = [
      'script',
      scriptPath,
      '--rpc-url',
      rpcUrl,
      '--sig',
      'sphinxCollectProposal(bytes,string,uint64)',
      scriptFunctionCalldata,
      deploymentInfoPath,
      '--always-use-create-2-factory',
      DEFAULT_CALL_DEPTH,
    ]

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
    const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs, {
      // Set the block gas limit to the max amount allowed by Foundry. This overrides lower block
      // gas limits specified in the user's `foundry.toml`, which can cause the script to run out of
      // gas. We use the `FOUNDRY_BLOCK_GAS_LIMIT` environment variable because it has a higher
      // priority than `DAPP_BLOCK_GAS_LIMIT`.
      FOUNDRY_BLOCK_GAS_LIMIT: MAX_UINT64.toString(),
      // We specify build info to be false so that calling the script does not cause the users entire
      // project to be rebuilt if they have `build_info=true` defined in their foundry.toml file.
      // We do need the build info, but that is generated when we compile at the beginning of the script.
      FOUNDRY_BUILD_INFO: 'false',
    })

    if (spawnOutput.code !== 0) {
      spinner?.stop()
      // The `stdout` contains the trace of the error.
      console.log(spawnOutput.stdout)
      // The `stderr` contains the error message.
      console.log(spawnOutput.stderr)
      process.exit(1)
    }

    const serializedDeploymentInfo = readFileSync(deploymentInfoPath, 'utf-8')
    const deploymentInfo = decodeDeploymentInfo(
      serializedDeploymentInfo,
      sphinxPluginTypesInterface,
      blockNumber
    )

    collected.push({
      deploymentInfo,
      libraries: [], // We don't currently support linked libraries.
      rpcUrl,
    })
  }

  spinner?.succeed(`Collected transactions.`)

  spinner?.start(`Building proposal...`)

  const initCodeWithArgsArray = getInitCodeWithArgsArray(
    collected.flatMap(({ deploymentInfo }) => deploymentInfo.accountAccesses)
  )

  const { configArtifacts, buildInfos } = await getConfigArtifacts(
    initCodeWithArgsArray
  )

  collected.forEach(({ deploymentInfo }) =>
    assertContractSizeLimitNotExceeded(
      deploymentInfo.accountAccesses,
      configArtifacts
    )
  )

  await sphinxContext.assertNoLinkedLibraries(
    scriptPath,
    foundryToml.cachePath,
    foundryToml.artifactFolder,
    projectRoot,
    targetContract
  )

  const networkConfigArrayWithRpcUrls = collected.map(
    ({ deploymentInfo, libraries, rpcUrl }) => {
      return {
        rpcUrl,
        networkConfig: makeNetworkConfig(
          deploymentInfo,
          true, // System contracts are deployed.
          configArtifacts,
          libraries
        ),
      }
    }
  )

  const isEmpty = networkConfigArrayWithRpcUrls.every(
    ({ networkConfig }) => networkConfig.actionInputs.length === 0
  )
  if (isEmpty) {
    return {
      isEmpty: true,
      networkConfigArrayWithRpcUrls: undefined,
      configArtifacts: undefined,
    }
  }

  return {
    networkConfigArrayWithRpcUrls,
    configArtifacts,
    buildInfos,
    isEmpty: false,
  }
}

export const propose = async (
  args: ProposeArgs
): Promise<{
  proposalRequest?: ProposalRequest
  deploymentConfigData?: string
  configArtifacts?: ConfigArtifacts
  networkConfigArray?: Array<NetworkConfig>
  merkleTree?: SphinxMerkleTree
}> => {
  const { confirm, networks, isDryRun, silent, sphinxContext, targetContract } =
    args
  const sig = args.sig === undefined ? ['run()'] : args.sig

  const projectRoot = process.cwd()

  // Normalize the script path to be in the format "path/to/file.sol". This isn't strictly
  // necessary, but we're less likely to introduce a bug if it's always in the same format.
  const scriptPath = relative(projectRoot, args.scriptPath)

  if (!isFile(scriptPath)) {
    throw new Error(
      `File does not exist at: ${scriptPath}\n` +
        `Please make sure this is a valid file path.`
    )
  }

  const apiKey = process.env.SPHINX_API_KEY
  if (!apiKey) {
    console.error("You must specify a 'SPHINX_API_KEY' environment variable.")
    process.exit(1)
  }

  /**
   * Run the compiler. It's necessary to do this before we read any contract interfaces.
   * We request the build info here which we need to build info to generate the compiler
   * config.
   *
   * We do not force recompile here because the user may have a custom compilation pipeline
   * that yields additional artifacts which the standard forge compiler does not.
   */
  compile(
    silent,
    false, // Do not force recompile
    true // Generate build info
  )

  const scriptFunctionCalldata = await parseScriptFunctionCalldata(sig)

  const spinner = ora({ isSilent: silent })
  spinner.start(`Validating networks...`)

  // Check that the Sphinx dependencies are installed. This check should occur before we call into
  // the user's Forge script to collect transactions, get config variables, etc, since a version
  // mismatch could cause these calls to fail unexpectedly.
  await assertValidVersions(scriptPath, targetContract)

  const foundryToml = await getFoundryToml()

  // We must load any ABIs after compiling the contracts to prevent a situation where the user
  // clears their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxPluginTypesInterface = readInterface(
    foundryToml.artifactFolder,
    'SphinxPluginTypes'
  )

  // We must synchronize the sphinx.lock file before calling into the users script because they
  // may be using a project which was just created, and doesn't exist in the lock file on their
  // machine yet.
  await syncSphinxLock(undefined, apiKey)

  const { safeAddress, testnets, mainnets } = await getSphinxConfigFromScript(
    scriptPath,
    sphinxPluginTypesInterface,
    targetContract,
    spinner
  )

  const { rpcUrls, isTestnet } = await validateProposalNetworks(
    networks,
    testnets,
    mainnets,
    foundryToml.rpcEndpoints
  )

  spinner.succeed(`Validated networks.`)
  spinner.start(`Collecting transactions...`)

  const getConfigArtifacts = sphinxContext.makeGetConfigArtifacts(
    foundryToml.artifactFolder,
    foundryToml.buildInfoFolder,
    projectRoot,
    foundryToml.cachePath
  )

  const {
    networkConfigArrayWithRpcUrls,
    configArtifacts,
    isEmpty,
    buildInfos,
  } = await sphinxContext.buildNetworkConfigArray(
    scriptPath,
    scriptFunctionCalldata,
    safeAddress,
    rpcUrls,
    sphinxPluginTypesInterface,
    foundryToml,
    projectRoot,
    getConfigArtifacts,
    sphinxContext,
    targetContract,
    spinner
  )

  if (isEmpty) {
    spinner.succeed(
      `Skipping proposal because there is nothing to execute on any chain.`
    )
    return {}
  }

  // Narrow the TypeScript type of the NetworkConfig and ConfigArtifacts.
  if (!networkConfigArrayWithRpcUrls || !configArtifacts || !buildInfos) {
    throw new Error(
      `NetworkConfig, ConfigArtifacts, or BuildInfos not defined. Should never happen.`
    )
  }

  const networkConfigArray = networkConfigArrayWithRpcUrls.map(
    ({ networkConfig }) => networkConfig
  )
  const deploymentData = makeDeploymentData(networkConfigArray)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  spinner.succeed(`Built proposal.`)
  spinner.start(`Running simulation...`)

  const deploymentConfig = makeDeploymentConfig(
    networkConfigArray,
    configArtifacts,
    buildInfos,
    merkleTree
  )

  spinner.succeed(`Simulation succeeded.`)
  const preview = getPreview(networkConfigArray, merkleTree.root)
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

  const shouldBeEqual = networkConfigArray.map((networkConfig) => {
    return {
      newConfig: networkConfig.newConfig,
      safeAddress: networkConfig.safeAddress,
      moduleAddress: networkConfig.moduleAddress,
      safeInitData: networkConfig.safeInitData,
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
  const { newConfig, moduleAddress } = networkConfigArray[0]

  const projectDeployments: Array<ProjectDeployment> = []
  const chainStatus: Array<{
    chainId: number
    numLeaves: number
  }> = []
  const chainIds: Array<number> = []
  for (const networkConfig of networkConfigArray) {
    // We skip chains that don't have any transactions to execute to simplify Sphinx's backend
    // logic. From the perspective of the backend, these networks don't serve any purpose in the
    // `ProposalRequest`.
    if (networkConfig.actionInputs.length === 0) {
      continue
    }

    const projectDeployment = getProjectDeploymentForChain(
      merkleTree,
      networkConfig
    )
    if (projectDeployment) {
      projectDeployments.push(projectDeployment)
    }

    chainStatus.push({
      chainId: Number(networkConfig.chainId),
      numLeaves: networkConfig.actionInputs.length + 1,
    })
    chainIds.push(Number(networkConfig.chainId))
  }

  const proposalRequest: ProposalRequest = {
    apiKey,
    orgId: newConfig.orgId,
    isTestnet,
    chainIds,
    projectName: newConfig.projectName,
    safeAddress,
    moduleAddress,
    projectDeployments,
    diff: preview,
    compilerConfigId: undefined,
    deploymentConfigId: undefined,
    sphinxPluginVersion: SPHINX_PLUGINS_VERSION,
    tree: {
      root: merkleTree.root,
      chainStatus,
    },
  }

  const deploymentConfigData = JSON.stringify(deploymentConfig, null, 2)

  if (isDryRun) {
    spinner.succeed(`Proposal dry run succeeded.`)
  } else {
    const deploymentConfigId = await sphinxContext.storeDeploymentConfig(
      apiKey,
      newConfig.orgId,
      deploymentConfigData
    )
    proposalRequest.deploymentConfigId = deploymentConfigId
    proposalRequest.compilerConfigId = deploymentConfigId

    await sphinxContext.relayProposal(proposalRequest)
    spinner.succeed(
      `Proposal succeeded! Go to ${blue.underline(
        WEBSITE_URL
      )} to approve the deployment.`
    )
  }
  return {
    proposalRequest,
    deploymentConfigData,
    configArtifacts,
    networkConfigArray,
    merkleTree,
  }
}

const getProjectDeploymentForChain = (
  merkleTree: SphinxMerkleTree,
  networkConfig: NetworkConfig
): ProjectDeployment | undefined => {
  const { newConfig, initialState, chainId } = networkConfig

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
