import { join, resolve } from 'path'
import { readFileSync, existsSync, unlinkSync } from 'fs'

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
  hyperlink,
  isRawDeployContractActionInput,
  relayIPFSCommit,
  relayProposal,
  signAuthRootMetaTxn,
  spawnAsync,
  userConfirmation,
} from '@sphinx-labs/core'
import ora from 'ora'
import { blue } from 'chalk'
import { ethers } from 'ethers'

import { getCollectedProposal, makeParsedConfig } from '../../foundry/decode'
import { getFoundryConfigOptions } from '../../foundry/options'
import { generateClient } from '../typegen/client'
import { getBundleInfoArray, makeGetConfigArtifacts } from '../../foundry/utils'

/**
 * @notice Calls the `sphinxProposeTask` Solidity function, then converts the output into a format
 * that can be sent to the back-end.
 *
 * @param dryRun If true, the proposal will not be relayed to the back-end.
 * @param targetContract The name of the contract within the script file. Necessary when there are
 * multiple contracts in the specified script.
 */
export const propose = async (
  confirm: boolean,
  isTestnet: boolean,
  dryRun: boolean,
  silent: boolean,
  scriptPath: string,
  targetContract?: string,
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

  // We run the `sphinx generate` command to make sure that the user's contracts and clients are
  // up-to-date. The Solidity compiler is run within this command via `forge build`.
  await generateClient(silent, true)

  const spinner = ora({ isSilent: silent })
  spinner.start(`Collecting transactions...`)

  const { cachePath, broadcastFolder, artifactFolder, buildInfoFolder } =
    await getFoundryConfigOptions()
  const proposalNetworksPath = join(cachePath, 'sphinx-proposal-networks.txt')

  // Delete the proposal networks file if it already exists. This isn't strictly necessary, since an
  // existing file would be overwritten automatically when we call `sphinxProposeTask`, but this
  // ensures that we don't accidentally use outdated networks in the rest of the proposal.
  if (existsSync(proposalNetworksPath)) {
    unlinkSync(proposalNetworksPath)
  }

  const forgeScriptCollectArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxCollectProposal(address,bool,string)',
    proposer.address,
    isTestnet.toString(),
    proposalNetworksPath,
    '--skip-simulation', // TODO(docs): this is necessary in the case that a deployment has already occurred on the network. explain why. also, this skips the on-chain simulation, not the in-process simulation (i.e. step 2 in forge docs, not step 1)
  ]
  if (targetContract) {
    forgeScriptCollectArgs.push('--target-contract', targetContract)
  }

  const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs)

  if (spawnOutput.code !== 0) {
    spinner.stop()
    // The `stdout` contains the trace of the error.
    console.log(spawnOutput.stdout)
    // The `stderr` contains the error message.
    console.log(spawnOutput.stderr)
    process.exit(1)
  }

  const allNetworksStr = readFileSync(proposalNetworksPath, 'utf8')
  const networks = allNetworksStr.split(',')

  // We must load this ABI after running `forge build` to prevent a situation where the user clears
  // their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxCollectorABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${artifactFolder}/SphinxCollector.sol/SphinxCollector.json`
    )).abi

  const collected = getCollectedProposal(
    networks,
    scriptPath,
    broadcastFolder,
    sphinxCollectorABI
  )

  const fullyQualifiedSet = new Set<string>()
  for (const { actionInputs } of collected) {
    for (const actionInput of actionInputs) {
      if (isRawDeployContractActionInput(actionInput)) {
        fullyQualifiedSet.add(actionInput.fullyQualifiedName)
      }
    }
  }
  const getConfigArtifacts = makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    cachePath
  )

  const configArtifacts = await getConfigArtifacts(
    Array.from(fullyQualifiedSet)
  )

  const parsedConfigArray = collected.map((c) =>
    makeParsedConfig(c.deploymentInfo, c.actionInputs, configArtifacts)
  )
  const { authRoot, bundleInfoArray } = await getBundleInfoArray(
    configArtifacts,
    parsedConfigArray
  )

  spinner.succeed(`Collected transactions.`)
  spinner.start(`Running simulation...`)

  const sphinxABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(`${artifactFolder}/Sphinx.sol/Sphinx.json`)).abi
  const sphinxIface = new ethers.Interface(sphinxABI)
  const deployTaskFragment = sphinxIface.fragments
    .filter(ethers.Fragment.isFunction)
    .find((fragment) => fragment.name === 'sphinxSimulateProposal')
  if (!deployTaskFragment) {
    throw new Error(
      `'sphinxSimulateProposal' not found in ABI. Should never happen.`
    )
  }

  const proposalSimulationData = sphinxIface.encodeFunctionData(
    deployTaskFragment,
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
    const websiteLink = blue(hyperlink('website', WEBSITE_URL))
    await relayProposal(proposalRequest)
    await relayIPFSCommit(apiKey, newConfig.orgId, compilerConfigArray)
    spinner.succeed(
      `Proposal succeeded! Go to ${websiteLink} to approve the deployment.`
    )
  }
  return { proposalRequest, ipfsData: compilerConfigArray }
}
