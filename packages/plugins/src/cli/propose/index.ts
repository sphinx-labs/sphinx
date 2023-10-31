import { basename, join, resolve } from 'path'
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
  hyperlink,
  relayIPFSCommit,
  relayProposal,
  signAuthRootMetaTxn,
  spawnAsync,
  userConfirmation,
} from '@sphinx-labs/core'
import ora from 'ora'
import { blue } from 'chalk'
import { ethers } from 'ethers'
import {
  ConfigArtifacts,
  ParsedConfig,
  RawActionInput,
} from '@sphinx-labs/core/dist/config/types'

import {
  decodeDeploymentInfoArray,
  readActionInputsOnSingleChain,
  makeParsedConfig,
  parseFoundryDryRun,
} from '../../foundry/decode'
import { getFoundryConfigOptions } from '../../foundry/options'
import {
  getBundleInfoArray,
  getSphinxManagerAddressFromScript,
  getUniqueNames,
  makeGetConfigArtifacts,
} from '../../foundry/utils'
import { FoundryDryRun } from '../../foundry/types'

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

  const deploymentInfoArrayPath = join(
    foundryToml.cachePath,
    'deployment-info-array.txt'
  )

  // Remove the file if it exists. This ensures that we don't accidentally use an outdated file.
  if (existsSync(deploymentInfoArrayPath)) {
    unlinkSync(deploymentInfoArrayPath)
  }

  const forgeScriptCollectArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxCollectProposal(address,bool,string)',
    proposerAddress,
    isTestnet.toString(),
    deploymentInfoArrayPath,
  ]
  if (targetContract) {
    forgeScriptCollectArgs.push('--target-contract', targetContract)
  }

  const managerAddress = await getSphinxManagerAddressFromScript(
    scriptPath,
    undefined,
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
    spinner?.stop()
    // The `stdout` contains the trace of the error.
    console.log(spawnOutput.stdout)
    // The `stderr` contains the error message.
    console.log(spawnOutput.stderr)
    process.exit(1)
  }

  // We must load any ABIs after running `forge build` to prevent a situation where the user clears
  // their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxPluginTypesABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${foundryToml.artifactFolder}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
    )).abi

  const abiEncodedDeploymentInfo = readFileSync(
    deploymentInfoArrayPath,
    'utf-8'
  )
  const deploymentInfoArray = decodeDeploymentInfoArray(
    abiEncodedDeploymentInfo,
    sphinxPluginTypesABI
  )

  const actionInputArray: Array<Array<RawActionInput>> = []
  if (deploymentInfoArray.length === 1) {
    const actionInputs = readActionInputsOnSingleChain(
      deploymentInfoArray[0],
      scriptPath,
      foundryToml.broadcastFolder,
      'sphinxCollectProposal'
    )
    actionInputArray.push(actionInputs)
  } else {
    // For multi-chain deployments, the format of the dry run file is:
    // <broadcast_folder>/multi/dry-run/<script_filename>-latest/<solidity_function>.json
    const dryRunPath = join(
      foundryToml.broadcastFolder,
      'multi',
      'dry-run',
      `${basename(scriptPath)}-latest`,
      'sphinxCollectProposal.json'
    )

    const multichainDryRun: Array<FoundryDryRun> = JSON.parse(
      readFileSync(dryRunPath, 'utf8')
    ).deployments

    if (multichainDryRun.length !== deploymentInfoArray.length) {
      throw new Error(
        `Length mismatch between the DeploymentInfo array and the Foundry dry run. Should never happen.`
      )
    }

    multichainDryRun.forEach((dryRun, i) =>
      actionInputArray.push(
        parseFoundryDryRun(deploymentInfoArray[i], dryRun, dryRunPath)
      )
    )
  }

  const { uniqueFullyQualifiedNames, uniqueContractNames } = getUniqueNames(
    actionInputArray,
    deploymentInfoArray
  )

  const getConfigArtifacts = makeGetConfigArtifacts(
    foundryToml.artifactFolder,
    foundryToml.buildInfoFolder,
    foundryToml.cachePath
  )

  const configArtifacts = await getConfigArtifacts(
    uniqueFullyQualifiedNames,
    uniqueContractNames
  )

  const parsedConfigArray = deploymentInfoArray.map((deploymentInfo, i) =>
    makeParsedConfig(
      deploymentInfo,
      actionInputArray[i],
      configArtifacts,
      true,
      spinner
    )
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

  // First, we compile to make sure the user's contracts are up to date.
  const forgeBuildArgs = silent ? ['build', '--silent'] : ['build']
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
    const websiteLink = blue(hyperlink('website', WEBSITE_URL))
    await relayProposal(proposalRequest)
    await relayIPFSCommit(apiKey, newConfig.orgId, compilerConfigArray)
    spinner.succeed(
      `Proposal succeeded! Go to ${websiteLink} to approve the deployment.`
    )
  }
  return { proposalRequest, ipfsData: compilerConfigArray }
}
