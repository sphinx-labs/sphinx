import { join, resolve } from 'path'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'

// TODO: the existing proposal simulation does two things:
// 1. provide a helpful error to the user if the simulation fails? (maybe. try
//    `RevertDuringSimulation`.)
//

// TODO(test): test that arbitrum includes the ~600k-1M buffer. this should be a unit test on the
// relevant function.

// TODO(test): hardhat says that you need an archive node to fork mainnet. try running the propose
// command with a public RPC url. preferably, you can output a helpful error message if one isn't
// already thrown by default. note that different rpc providers may throw different errors, so try
// using a non-standard public rpc endpoint.

// TODO(docs): arbitrum's `estimateGas` includes the L1 gas.

// TODO(test): in Large.s.sol, perform a ton of SSTOREs in the constructor of MyLargeContract.sol.

// TODO(test): manually check that our hardhat.config.js is the closest in the file system to the
// propose/index.ts file (i think). essentially, make sure that a different hardhat.config can't be
// used instead by the user's machine.

// TODO: "Btw this is pretty unrelated, but I noticed the findMaxBatchSize function (both in
// Solidity and Typescript), relies on using the gas values in the merkle tree leaves which don't
// include the overhead of actually executing the leaves"

import {
  ProjectDeployment,
  ProposalRequest,
  SphinxJsonRpcProvider,
  WEBSITE_URL,
  elementsEqual,
  ensureSphinxAndGnosisSafeDeployed,
  getPreview,
  getPreviewString,
  getReadableActions,
  makeDeploymentData,
  relayIPFSCommit,
  relayProposal,
  spawnAsync,
  getParsedConfigWithCompilerInputs,
  userConfirmation,
  getNetworkNameForChainId,
} from '@sphinx-labs/core'
import ora from 'ora'
import { blue, red } from 'chalk'
import { ethers } from 'ethers'
import {
  CompilerConfig,
  ConfigArtifacts,
  DeploymentInfo,
  ParsedConfig,
  RawActionInput,
} from '@sphinx-labs/core/dist/config/types'
import {
  SphinxLeafType,
  SphinxMerkleTree,
  SphinxModuleABI,
  getManagedServiceAddress,
  makeSphinxMerkleTree,
} from '@sphinx-labs/contracts'

import {
  makeParsedConfig,
  decodeDeploymentInfo,
  convertFoundryDryRunToActionInputs,
} from '../../foundry/decode'
import { getFoundryToml } from '../../foundry/options'
import {
  getSphinxConfigNetworksFromScript,
  getSphinxLeafGasEstimates,
  getSphinxSafeAddressFromScript,
  getUniqueNames,
  makeGetConfigArtifacts,
  getFoundrySingleChainDryRunPath,
  readFoundryMultiChainDryRun,
  readFoundrySingleChainDryRun,
  getGasEstimatesOnNetworks,
} from '../../foundry/utils'
import {
  SimulateDeploymentTaskArgs,
  simulateDeploymentTask,
} from '../../../src/tasks'

export const buildParsedConfigArray = async (
  scriptPath: string,
  isTestnet: boolean,
  sphinxPluginTypesInterface: ethers.Interface,
  targetContract?: string,
  spinner?: ora.Ora
): Promise<{
  parsedConfigArray?: Array<ParsedConfig>
  configArtifacts?: ConfigArtifacts
  isEmpty: boolean
}> => {
  const projectRoot = process.cwd()
  const foundryToml = await getFoundryToml()

  const getConfigArtifacts = makeGetConfigArtifacts(
    foundryToml.artifactFolder,
    foundryToml.buildInfoFolder,
    projectRoot,
    foundryToml.cachePath
  )

  const { testnets, mainnets } = await getSphinxConfigNetworksFromScript(
    scriptPath,
    targetContract,
    spinner
  )

  const deploymentInfoPath = join(
    foundryToml.cachePath,
    'sphinx-deployment-info.txt'
  )
  const networkNames = isTestnet ? testnets : mainnets
  const collected: Array<{
    deploymentInfo: DeploymentInfo
    actionInputs: Array<RawActionInput>
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

    const provider = new SphinxJsonRpcProvider(rpcUrl)
    await ensureSphinxAndGnosisSafeDeployed(provider)

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
      networkName,
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
    const dateBeforeForgeScript = new Date()
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
      sphinxPluginTypesInterface
    )

    const collectionDryRunPath = getFoundrySingleChainDryRunPath(
      foundryToml.broadcastFolder,
      scriptPath,
      deploymentInfo.chainId,
      `sphinxCollectProposal`
    )
    const collectionDryRun = readFoundrySingleChainDryRun(
      foundryToml.broadcastFolder,
      scriptPath,
      deploymentInfo.chainId,
      `sphinxCollectProposal`,
      dateBeforeForgeScript
    )

    // Check if the dry run file exists. If it doesn't, this must mean that there weren't any
    // transactions broadcasted in the user's script for this network. We return an empty array in
    // this case.
    const actionInputs = collectionDryRun
      ? convertFoundryDryRunToActionInputs(
          deploymentInfo,
          collectionDryRun,
          collectionDryRunPath
        )
      : []

    collected.push({ deploymentInfo, actionInputs })
  }

  spinner?.succeed(`Collected transactions.`)

  const isEmpty = collected.every(
    ({ actionInputs }) => actionInputs.length === 0
  )
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
    networkNames,
    sphinxPluginTypesInterface,
    collected,
    targetContract,
    spinner
  )

  spinner?.succeed(`Estimated gas.`)
  spinner?.start(`Building proposal...`)

  const { uniqueFullyQualifiedNames, uniqueContractNames } = getUniqueNames(
    collected.map(({ actionInputs }) => actionInputs),
    collected.map(({ deploymentInfo }) => deploymentInfo)
  )

  const configArtifacts = await getConfigArtifacts(
    uniqueFullyQualifiedNames,
    uniqueContractNames
  )
  const parsedConfigArray = collected.map(
    ({ actionInputs, deploymentInfo }, i) =>
      makeParsedConfig(
        deploymentInfo,
        actionInputs,
        gasEstimatesArray[i],
        configArtifacts
      )
  )

  return {
    parsedConfigArray,
    configArtifacts,
    isEmpty: false,
  }
}

/**
 * @notice Calls the `sphinxProposeTask` Solidity function, then converts the output into a format
 * that can be sent to the back-end.
 *
 * @param isDryRun If true, the proposal will not be relayed to the back-end.
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
  isDryRun: boolean,
  silent: boolean,
  scriptPath: string,
  targetContract?: string,
  skipForceRecompile: boolean = true, // TODO(end): undo
  prompt: (q: string) => Promise<void> = userConfirmation
): Promise<{
  proposalRequest?: ProposalRequest
  ipfsData?: string
  configArtifacts?: ConfigArtifacts
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

  const foundryToml = await getFoundryToml()

  // We must load any ABIs after running `forge build` to prevent a situation where the user clears
  // their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxPluginTypesABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${foundryToml.artifactFolder}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
    )).abi
  const sphinxPluginTypesInterface = new ethers.Interface(sphinxPluginTypesABI)

  const { parsedConfigArray, configArtifacts, isEmpty } =
    await buildParsedConfigArray(
      scriptPath,
      isTestnet,
      sphinxPluginTypesInterface,
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

  const simulationInputsFragment = sphinxPluginTypesInterface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'proposalSimulationInputsType')
  const merkleTreeFragment = sphinxPluginTypesInterface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'sphinxMerkleTreeType')
  if (!simulationInputsFragment || !merkleTreeFragment) {
    throw new Error(`Could not find fragment in ABI. Should never happen.`)
  }

  const coder = ethers.AbiCoder.defaultAbiCoder()

  const { configUri, compilerConfigs } =
    await getParsedConfigWithCompilerInputs(
      parsedConfigArray,
      false,
      configArtifacts
    )

  const deploymentData = makeDeploymentData(configUri, compilerConfigs)
  const merkleTree = makeSphinxMerkleTree(deploymentData)

  spinner.succeed(`Built proposal.`)
  spinner.start(`Running simulation...`)

  // Get an array of chain IDs that contain at least one Merkle leaf.
  const uniqueLeafChainIdsBigInt = Array.from(
    new Set(merkleTree.leavesWithProofs.map(({ leaf }) => leaf.chainId))
  )
  const uniqueLeafChainIds = uniqueLeafChainIdsBigInt.map((chainId) =>
    chainId.toString()
  )
  // Get an array of network names that contain at least one Merkle leaf.
  const uniqueLeafNetworkNames = uniqueLeafChainIdsBigInt.map(
    getNetworkNameForChainId
  )

  const humanReadableActions = parsedConfigArray.map((e) =>
    getReadableActions(e.actionInputs)
  )

  const gasEstimates: ProposalRequest['gasEstimates'] = []
  for (const compilerConfig of compilerConfigs) {
    const networkName = getNetworkNameForChainId(BigInt(compilerConfig.chainId))
    const rpcUrl = foundryToml.rpcEndpoints[networkName]

    if (!rpcUrl) {
      console.error(
        red(
          `No RPC endpoint specified in your foundry.toml for the network: ${networkName}.`
        )
      )
      process.exit(1)
    }

    // TODO: we don't want to require('hardhat') for each network.
    const initialHardhatConfigEnvVar = process.env['HARDHAT_CONFIG']
    process.env['HARDHAT_CONFIG'] = join('dist', 'hardhat.config.js')
    process.env['SPHINX_INTERNAL__FORK_URL'] = rpcUrl
    process.env['SPHINX_INTERNAL__CHAIN_ID'] = compilerConfig.chainId
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const hre = require('hardhat')

    const taskParams: SimulateDeploymentTaskArgs = {
      parsedConfig: compilerConfig,
      merkleTree,
      config: join('dist', 'hardhat.config.js'),
    }
    // TODO(later): if this works, you may need to do the DEV_FILE_PATH thing.
    const receipts: Awaited<ReturnType<typeof simulateDeploymentTask>> =
      await hre.run('sphinxSimulateDeployment', taskParams)

    process.env['HARDHAT_CONFIG'] = initialHardhatConfigEnvVar
    delete process.env['SPHINX_INTERNAL__FORK_URL']
    delete process.env['SPHINX_INTERNAL__CHAIN_ID']

    const provider = new SphinxJsonRpcProvider(rpcUrl)
    gasEstimates.push({
      chainId: Number(compilerConfig.chainId),
      // TODO(docs): explain 1.3x
      estimatedGas: await getEstimatedGas(receipts, provider),
    })
  }

  // TODO: rm?
  // // ABI encode the inputs to the proposal simulation function.
  // const encodedSimulationInputs = coder.encode(
  //   simulationInputsFragment.outputs,
  //   [merkleTree, humanReadableActions]
  // )
  // // Write the ABI encoded data to the file system. We'll read it in the Forge script that simulates
  // // the proposal. We do this instead of passing in the data as a parameter to the Forge script
  // // because it's possible to hit Node's `spawn` input size limit if the data is large. This is
  // // particularly a concern for the Merkle tree, which likely contains contract init code.
  // const simulationInputsFilePath = join(
  //   foundryToml.cachePath,
  //   'sphinx-proposal-simulation-inputs.txt'
  // )
  // writeFileSync(simulationInputsFilePath, encodedSimulationInputs)

  // const proposalSimulationArgs = [
  //   'script',
  //   scriptPath,
  //   '--sig',
  //   'sphinxSimulateProposal(string[],string)',
  //   `[${uniqueLeafNetworkNames.join(',')}]`,
  //   simulationInputsFilePath,
  //   // Set the gas estimate multiplier to be 30%. This is Foundry's default multiplier, but we
  //   // hard-code it just in case Foundry changes the default value in the future. In practice, this
  //   // tends to produce a gas estimate multiplier that's around 35% to 55% higher than the actual
  //   // gas used instead of 30%.
  //   '--gas-estimate-multiplier',
  //   '130',
  // ]
  // if (targetContract) {
  //   proposalSimulationArgs.push('--target-contract', targetContract)
  // }

  // const dateBeforeForgeScript = new Date()
  // const { stdout, stderr, code } = await spawnAsync(
  //   'forge',
  //   proposalSimulationArgs
  // )
  // if (code !== 0) {
  //   spinner.stop()
  //   // The `stdout` contains the trace of the error.
  //   console.log(stdout)
  //   // The `stderr` contains the error message.
  //   console.log(stderr)
  //   process.exit(1)
  // }

  // const dryRun =
  //   uniqueLeafChainIds.length > 1
  //     ? readFoundryMultiChainDryRun(
  //         foundryToml.broadcastFolder,
  //         scriptPath,
  //         `sphinxSimulateProposal`,
  //         dateBeforeForgeScript
  //       )
  //     : readFoundrySingleChainDryRun(
  //         foundryToml.broadcastFolder,
  //         scriptPath,
  //         uniqueLeafChainIds[0],
  //         `sphinxSimulateProposal`,
  //         dateBeforeForgeScript
  //       )

  // if (!dryRun) {
  //   // This should never happen because the presence of Merkle leaves should always mean that a
  //   // broadcast will occur.
  //   throw new Error(`Could not read Foundry dry run file. Should never happen.`)
  // }

  // const gasEstimates = getGasEstimatesOnNetworks(
  //   dryRun,
  //   uniqueLeafChainIds,
  //   getManagedServiceAddress()
  // )

  spinner.succeed(`Simulation succeeded.`)

  const preview = getPreview(compilerConfigs)
  if (confirm) {
    spinner.info(`Skipping preview.`)
  } else {
    const previewString = getPreviewString(preview, true)
    await prompt(previewString)
  }

  isDryRun
    ? spinner.start('Finishing dry run...')
    : spinner.start(`Proposing...`)

  const shouldBeEqual = compilerConfigs.map((compilerConfig) => {
    return {
      newConfig: compilerConfig.newConfig,
      safeAddress: compilerConfig.safeAddress,
      moduleAddress: compilerConfig.moduleAddress,
      safeInitData: compilerConfig.safeInitData,
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
    compilerConfigs[0]

  const projectDeployments: Array<ProjectDeployment> = []
  const chainStatus: Array<{
    chainId: number
    numLeaves: number
  }> = []
  const chainIds: Array<number> = []
  for (const compilerConfig of compilerConfigs) {
    // We skip chains that don't have any transactions to execute to simplify Sphinx's backend
    // logic. From the perspective of the backend, these networks don't serve any purpose in the
    // `ProposalRequest`.
    if (compilerConfig.actionInputs.length === 0) {
      continue
    }

    const projectDeployment = getProjectDeploymentForChain(
      configUri,
      merkleTree,
      compilerConfig
    )
    if (projectDeployment) {
      projectDeployments.push(projectDeployment)
    }

    chainStatus.push({
      chainId: Number(compilerConfig.chainId),
      numLeaves: compilerConfig.actionInputs.length + 1,
    })
    chainIds.push(Number(compilerConfig.chainId))
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
    tree: {
      root: merkleTree.root,
      chainStatus,
    },
  }

  const ipfsData = JSON.stringify(compilerConfigs, null, 2)
  if (isDryRun) {
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
  return { proposalRequest, ipfsData, configArtifacts }
}

const getProjectDeploymentForChain = (
  configUri: string,
  merkleTree: SphinxMerkleTree,
  compilerConfig: CompilerConfig
): ProjectDeployment | undefined => {
  const { newConfig, initialState, chainId } = compilerConfig

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
    configUri,
  }
}

/**
 * Estimates the gas used by a deployment on a single network. Includes a buffer of 30% to account
 * for variations between the local simulation and the production environment. Also adjusts the
 * minimum gas limit on networks like Arbitrum to include the L1 gas fee, which isn't captured on
 * forks.
 */
const getEstimatedGas = async (
  receipts: Array<ethers.TransactionReceipt>,
  provider: SphinxJsonRpcProvider
): Promise<string> => {
  // Estimate the minimum gas limit. On Ethereum, this will be 21k. (Technically, since
  // `eth_estimateGas` generally overestimates the gas used, it will be slightly greater than 21k.
  // It was 21001 during development). On Arbitrum and perhaps other L2s, the minimum gas limit will
  // be closer to one million. This is because each transaction includes the L1 gas used. The local
  // simulation that produced the transaction receipts doesn't capture this difference. For example,
  // the minimum gas limit on an Arbitrum fork is 21k instead of roughly one million. We account for
  // this difference by adding `estimatedMinGasLimit - 21_000` to each receipt. This provides a more
  // accurate estimate on networks like Arbitrum.
  const estimatedMinGasLimit = await provider.estimateGas({
    to: ethers.ZeroAddress,
    data: '0x',
  })
  const adjustedGasLimit = Number(estimatedMinGasLimit) - 21_000

  const estimatedGas = receipts
    .map((receipt) => receipt.gasUsed)
    .map(Number)
    .map((gasUsed) => Math.round(gasUsed * 1.3))
    // TODO(docs): we do this after multiplying by 1.3 because the estimated min gas limit already
    // includes a ~1.35x buffer due to the fact that eth_estimateGas overestimates the gas. (include
    // quote from json rpc docs).
    .map((gasWithBuffer) => {
      const totalGas = gasWithBuffer + adjustedGasLimit
      // TODO(docs): abundance of caution.
      if (totalGas < 0) {
        throw new Error('Gas used is less than 0. Should never happen.')
      }
      return totalGas
    })
    .reduce((a, b) => a + b)

  return estimatedGas.toString()
}

// TODO: come up with test cases.
