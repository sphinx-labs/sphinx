import { join, resolve } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'

import {
  ProjectDeployment,
  ProposalRequest,
  ProposalRequestLeaf,
  RoleType,
  WEBSITE_URL,
  elementsEqual,
  getAuthLeafSignerInfo,
  getPreview,
  getPreviewString,
  getProjectDeploymentForChain,
  relayIPFSCommit,
  relayProposal,
  signAuthRootMetaTxn,
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
  getBundleInfoArray,
  getSphinxConfigNetworksFromScript as getSphinxConfigNetworksFromScript,
  getSphinxManagerAddressFromScript,
  getUniqueNames,
  makeGetConfigArtifacts,
} from '../../foundry/utils'

export const buildParsedConfigArray = async (
  scriptPath: string,
  proposerAddress: string,
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
      'sphinxCollectProposal(address,string,string)',
      proposerAddress,
      network,
      deploymentInfoPath,
    ]
    if (targetContract) {
      forgeScriptCollectArgs.push('--target-contract', targetContract)
    }

    const managerAddress = await getSphinxManagerAddressFromScript(
      scriptPath,
      rpcUrl,
      targetContract,
      spinner
    )

    // Collect the transactions for the current network. We use the `FOUNDRY_SENDER` environment
    // variable to set the SphinxManager as the `msg.sender` to ensure that it's the caller for all
    // transactions. We need to do this even though we also broadcast from the SphinxManager's
    // address in the script. Specifically, this is necessary if the user is deploying a contract
    // via CREATE2 that uses a linked library. In this scenario, the caller that deploys the library
    // would be Foundry's default sender if we don't set this environment variable. Note that
    // `FOUNDRY_SENDER` has priority over the `--sender` flag and the `DAPP_SENDER` environment
    // variable. Also, passing the environment variable directly into the script overrides the
    // user defining it in their `.env` file.
    // It's worth mentioning that we can't run a single Forge script for all networks using
    // cheatcodes like `vm.createSelectFork`. This is because we use the `FOUNDRY_SENDER`.
    // Specifically, the state of the SphinxManager on the first fork is persisted across all forks
    // when using `FOUNDRY_SENDER`. This is problematic if the SphinxManager doesn't have the same
    // state across networks. This is a Foundry quirk; it may be a bug.
    const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs, {
      FOUNDRY_SENDER: managerAddress,
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
  ipfsData: string[] | undefined
}> => {
  const apiKey = process.env.SPHINX_API_KEY
  if (!apiKey) {
    console.error("You must specify a 'SPHINX_API_KEY' environment variable.")
    process.exit(1)
  }
  const proposerPrivateKey = process.env.PROPOSER_PRIVATE_KEY
  if (!proposerPrivateKey) {
    throw new Error(
      `You must set the 'PROPOSER_PRIVATE_KEY' environment variable to propose a deployment.`
    )
  }
  const proposer = new ethers.Wallet(proposerPrivateKey)

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
    proposer.address,
    isTestnet,
    targetContract,
    spinner
  )

  const { authRoot, bundleInfoArray } = await getBundleInfoArray(
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

  const proposalSimulationData = sphinxIface.encodeFunctionData(
    simulateProposalFragment,
    [isTestnet, authRoot, bundleInfoArray]
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

  const preview = getPreview(bundleInfoArray.map((b) => b.compilerConfig))
  if (confirm) {
    spinner.info(`Skipping preview.`)
  } else {
    const previewString = getPreviewString(preview, true)
    await prompt(previewString)
  }

  dryRun
    ? spinner.start('Dry running proposal...')
    : spinner.start(`Proposing...`)

  const shouldBeEqual = bundleInfoArray.map(({ compilerConfig }) => {
    return {
      newConfig: compilerConfig.newConfig,
      authAddress: compilerConfig.authAddress,
      managerAddress: compilerConfig.managerAddress,
    }
  })
  if (!elementsEqual(shouldBeEqual)) {
    throw new Error(
      `Detected different SphinxConfig values for different chains. This is currently unsupported.` +
        `Please use the same config on all chains.`
    )
  }
  // Since we know that the following fields are the same for each `compilerConfig`, we get their
  // values here.
  const { newConfig, authAddress, managerAddress } =
    bundleInfoArray[0].compilerConfig

  const projectDeployments: Array<ProjectDeployment> = []
  const compilerConfigs: {
    [ipfsHash: string]: string
  } = {}
  const gasEstimates: ProposalRequest['gasEstimates'] = []
  for (const bundleInfoOnChain of bundleInfoArray) {
    const { authLeafs, configUri, compilerConfig, actionBundle, targetBundle } =
      bundleInfoOnChain

    let estimatedGas = 0
    estimatedGas += actionBundle.actions
      .map((a) => Number(a.gas))
      .reduce((a, b) => a + b, 0)
    estimatedGas += targetBundle.targets.length * 200_000
    // Add a constant amount of gas to account for the cost of executing each auth leaf. For
    // context, it costs ~350k gas to execute a Setup leaf that adds a single proposer and manager,
    // using a single owner as the signer. It costs ~100k gas to execute a Proposal leaf.
    estimatedGas += authLeafs.length * 450_000
    gasEstimates.push({
      estimatedGas: estimatedGas.toString(),
      chainId: Number(compilerConfig.chainId),
    })

    const projectDeployment = getProjectDeploymentForChain(
      authLeafs,
      compilerConfig,
      configUri,
      actionBundle,
      targetBundle
    )
    if (projectDeployment) {
      projectDeployments.push(projectDeployment)
    }

    compilerConfigs[configUri] = JSON.stringify(compilerConfig, null, 2)
  }

  const emptyBundle = bundleInfoArray.every((b) => b.authLeafs.length === 0)
  if (emptyBundle) {
    spinner.succeed(
      `Skipping proposal because there is nothing to propose on any chain.`
    )
    return { proposalRequest: undefined, ipfsData: undefined }
  }

  const chainStatus = bundleInfoArray
    .map((b) => ({
      chainId: Number(b.compilerConfig.chainId),
      numLeaves: b.authLeafs.length,
    }))
    .filter((b) => b.numLeaves > 0)

  const proposalRequestLeafs: Array<ProposalRequestLeaf> = []
  for (const { compilerConfig, authLeafs } of bundleInfoArray) {
    for (const { leaf, leafFunctionName, proof } of authLeafs) {
      const { data, chainId, index, to } = leaf
      const { owners, threshold } = newConfig

      const proposers = compilerConfig.initialState.firstProposalOccurred
        ? compilerConfig.initialState.proposers
        : newConfig.proposers

      const { leafThreshold, roleType } = getAuthLeafSignerInfo(
        threshold,
        leafFunctionName
      )

      let signerAddresses: string[]
      if (roleType === RoleType.OWNER) {
        signerAddresses = owners
      } else if (roleType === RoleType.PROPOSER) {
        signerAddresses = proposers
      } else {
        throw new Error(`Invalid role type: ${roleType}. Should never happen.`)
      }

      const metaTxnSignature = await signAuthRootMetaTxn(proposer, authRoot)
      const signers = signerAddresses.map((addr) => {
        const signature =
          addr === proposer.address ? metaTxnSignature : undefined
        return {
          address: addr,
          signature,
          isProposer: proposers.includes(addr),
        }
      })

      proposalRequestLeafs.push({
        chainId: Number(chainId),
        index: Number(index),
        to,
        leafType: leafFunctionName,
        data,
        siblings: proof,
        threshold: Number(leafThreshold),
        signers,
      })
    }
  }

  const managerVersionString = `v${newConfig.version.major}.${newConfig.version.minor}.${newConfig.version.patch}`

  const proposalRequest: ProposalRequest = {
    apiKey,
    orgId: newConfig.orgId,
    isTestnet,
    chainIds: bundleInfoArray.map(({ compilerConfig }) =>
      Number(compilerConfig.chainId)
    ),
    deploymentName: newConfig.projectName,
    owners: newConfig.owners,
    threshold: Number(newConfig.threshold),
    canonicalConfig: '{}', // Deprecated field
    authAddress,
    managerAddress,
    managerVersion: managerVersionString,
    projectDeployments,
    gasEstimates,
    diff: preview,
    tree: {
      root: authRoot,
      chainStatus,
      leaves: proposalRequestLeafs,
    },
  }

  const compilerConfigArray = Object.values(compilerConfigs)
  if (dryRun) {
    spinner.succeed(`Proposal dry run succeeded.`)
  } else {
    await relayProposal(proposalRequest)
    await relayIPFSCommit(apiKey, newConfig.orgId, compilerConfigArray)
    spinner.succeed(
      `Proposal succeeded! Go to ${blue.underline(
        WEBSITE_URL
      )} to approve the deployment.`
    )
  }
  return { proposalRequest, ipfsData: compilerConfigArray }
}
