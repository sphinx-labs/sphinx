import { join, resolve } from 'path'
import { readFileSync, existsSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'

import {
  AuthLeaf,
  DeploymentInfo,
  ConfigArtifacts,
  ParsedConfig,
  ProjectDeployment,
  ProposalRequest,
  ProposalRequestLeaf,
  RoleType,
  WEBSITE_URL,
  elementsEqual,
  execAsync,
  getAuthLeafSignerInfo,
  getAuthLeafsForChain,
  getDiff,
  getDiffString,
  getProjectBundleInfo,
  getProjectDeploymentForChain,
  hyperlink,
  makeAuthBundle,
  makeParsedConfig,
  relayIPFSCommit,
  relayProposal,
  signAuthRootMetaTxn,
  userConfirmation,
} from '@sphinx-labs/core'
import { ethers } from 'ethers'
import ora from 'ora'
import { blue } from 'chalk'

import { decodeDeploymentInfoArray } from '../../foundry/decode'
import { getFoundryConfigOptions } from '../../foundry/options'
import { makeGetConfigArtifacts } from '../../foundry/utils'

const pluginRootPath =
  process.env.DEV_FILE_PATH ?? './node_modules/@sphinx-labs/plugins/'

/**
 * @param dryRun If true, the proposal will not be relayed to the back-end.
 * @param targetContract The name of the contract within the script file. Necessary when there are
 * multiple contracts in the specified script.
 */
export const propose = async (
  confirm: boolean,
  isTestnet: boolean,
  dryRun: boolean,
  scriptPath: string,
  targetContract?: string
): Promise<{
  proposalRequest: ProposalRequest | undefined
  ipfsData: string[] | undefined
}> => {
  const apiKey = process.env.SPHINX_API_KEY
  if (!apiKey) {
    throw new Error("You must specify a 'SPHINX_API_KEY' environment variable.")
  }
  const proposerPrivateKey = process.env.PROPOSER_PRIVATE_KEY
  if (!proposerPrivateKey) {
    // This should never happen because we check that the proposer private key exists in the
    // Solidity proposal code, which occurs before this. We check it here to narrow the
    // TypeScript type of `proposerPrivateKey` to `string` instead of `string | undefined`.
    throw new Error('Could not find proposer private key. Should never happen.')
  }

  // We compile the contracts to make sure we're using the latest versions. This command
  // displays the compilation process to the user in real time.
  const { status } = spawnSync(`forge`, ['build'], { stdio: 'inherit' })
  // Exit the process if compilation fails.
  if (status !== 0) {
    process.exit(1)
  }

  const spinner = ora()
  spinner.start(`Running simulation...`)

  const sphinxArtifactDir = `${pluginRootPath}out/artifacts`
  const SphinxPluginTypesABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${sphinxArtifactDir}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
    )).abi

  const { artifactFolder, buildInfoFolder, cachePath } =
    await getFoundryConfigOptions()
  const deploymentInfoPath = join(cachePath, 'sphinx-chain-info.txt')

  const getConfigArtifacts = makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    cachePath
  )

  // Delete the deployment info if one already exists. This isn't strictly necessary, but it ensures
  // that we don't accidentally display an outdated preview to the user.
  if (existsSync(deploymentInfoPath)) {
    unlinkSync(deploymentInfoPath)
  }

  const forgeScriptArgs = [
    'script',
    scriptPath,
    '--sig',
    "'sphinxProposeTask(bool,string)'",
    isTestnet,
    deploymentInfoPath,
  ]
  if (targetContract) {
    forgeScriptArgs.push('--target-contract', targetContract)
  }

  try {
    await execAsync(`forge ${forgeScriptArgs.join(' ')}`)
  } catch (e) {
    spinner.stop()
    // The `stdout` contains the trace of the error.
    console.log(e.stdout)
    // The `stderr` contains the error message.
    console.log(e.stderr)
    process.exit(1)
  }

  spinner.succeed(`Finished simulation.`)
  spinner.start(`Parsing simulation results...`)

  const abiEncodedDeploymentInfoArray: string = readFileSync(
    deploymentInfoPath,
    'utf8'
  )

  const deploymentInfoArray = decodeDeploymentInfoArray(
    abiEncodedDeploymentInfoArray,
    SphinxPluginTypesABI
  )

  const parsedConfigsWithArtifacts: Array<{
    parsedConfig: ParsedConfig
    configArtifacts: ConfigArtifacts
  }> = []
  for (const deploymentInfo of deploymentInfoArray) {
    const configArtifacts = await getConfigArtifacts(
      deploymentInfo.actionInputs
    )
    const parsedConfig = makeParsedConfig(deploymentInfo, configArtifacts)
    parsedConfigsWithArtifacts.push({ parsedConfig, configArtifacts })
  }

  const diff = getDiff(parsedConfigsWithArtifacts.map((e) => e.parsedConfig))
  if (confirm) {
    spinner.succeed(`Parsed simulation results.`)
  } else {
    const diffString = getDiffString(diff)
    spinner.stop()
    await userConfirmation(diffString)
  }

  spinner.start(`Running proposal...`)

  const shouldBeEqual = parsedConfigsWithArtifacts.map(({ parsedConfig }) => {
    return {
      newConfig: parsedConfig.newConfig,
      authAddress: parsedConfig.authAddress,
      managerAddress: parsedConfig.managerAddress,
    }
  })
  if (!elementsEqual(shouldBeEqual)) {
    throw new Error(`TODO(docs). This is currently unsupported.`)
  }
  // Since we know that the following fields are the same for each `parsedConfig`, we get their
  // values here.
  const { newConfig, authAddress, managerAddress } =
    parsedConfigsWithArtifacts[0].parsedConfig

  const wallet = new ethers.Wallet(proposerPrivateKey)
  const signerAddress = await wallet.getAddress()

  const leafs: Array<AuthLeaf> = []
  const projectDeployments: Array<ProjectDeployment> = []
  const compilerConfigs: {
    [ipfsHash: string]: string
  } = {}
  const gasEstimates: ProposalRequest['gasEstimates'] = []
  for (const { parsedConfig, configArtifacts } of parsedConfigsWithArtifacts) {
    const leafsForChain = await getAuthLeafsForChain(
      parsedConfig,
      configArtifacts
    )
    leafs.push(...leafsForChain)

    const { compilerConfig, configUri, bundles } = await getProjectBundleInfo(
      parsedConfig,
      configArtifacts
    )

    let estimatedGas = 0
    estimatedGas += bundles.actionBundle.actions
      .map((a) => a.gas)
      .reduce((a, b) => a + b, 0)
    estimatedGas += bundles.targetBundle.targets.length * 200_000
    // Add a constant amount of gas to account for the cost of executing each auth leaf. For
    // context, it costs ~350k gas to execute a Setup leaf that adds a single proposer and manager,
    // using a single owner as the signer. It costs ~100k gas to execute a Proposal leaf.
    estimatedGas += leafsForChain.length * 450_000
    gasEstimates.push({
      estimatedGas: estimatedGas.toString(),
      chainId: Number(parsedConfig.chainId),
    })

    const projectDeployment = getProjectDeploymentForChain(
      leafs,
      parsedConfig,
      configUri,
      bundles
    )
    if (projectDeployment) {
      projectDeployments.push(projectDeployment)
    }

    compilerConfigs[configUri] = JSON.stringify(compilerConfig, null, 2)
  }

  if (leafs.length === 0) {
    spinner.succeed(
      `Skipping proposal because your Sphinx config file has not changed.`
    )
    return { proposalRequest: undefined, ipfsData: undefined }
  }

  const chainIdToNumLeafs: { [chainId: number]: number } = {}
  for (const leaf of leafs) {
    const { chainId } = leaf
    if (!chainIdToNumLeafs[Number(chainId)]) {
      chainIdToNumLeafs[Number(chainId)] = 0
    }
    chainIdToNumLeafs[Number(chainId)] += 1
  }
  const chainStatus = Object.entries(chainIdToNumLeafs).map(
    ([chainId, numLeaves]) => ({
      chainId: parseInt(chainId, 10),
      numLeaves,
    })
  )

  const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)

  // Sign the meta-txn for the auth root, or leave it undefined if we're doing a dry run.
  const metaTxnSignature = dryRun
    ? await signAuthRootMetaTxn(wallet, root)
    : undefined

  const proposalRequestLeafs: Array<ProposalRequestLeaf> = []
  for (const { parsedConfig } of parsedConfigsWithArtifacts) {
    const bundledLeafsForChain = bundledLeafs.filter(
      (l) => l.leaf.chainId === parsedConfig.chainId
    )
    for (const { leaf, prettyLeaf, proof } of bundledLeafsForChain) {
      const { chainId, index, to, functionName } = prettyLeaf
      const { data } = leaf
      const { owners, threshold } = newConfig

      // TODO(docs)
      const proposers = parsedConfig.initialState.firstProposalOccurred
        ? parsedConfig.initialState.proposers
        : newConfig.proposers

      const { leafThreshold, roleType } = getAuthLeafSignerInfo(
        threshold,
        functionName
      )

      let signerAddresses: string[]
      if (roleType === RoleType.OWNER) {
        signerAddresses = owners
      } else if (roleType === RoleType.PROPOSER) {
        signerAddresses = proposers
      } else {
        throw new Error(`Invalid role type: ${roleType}. Should never happen.`)
      }

      const signers = signerAddresses.map((addr) => {
        const signature = addr === signerAddress ? metaTxnSignature : undefined
        return {
          address: addr,
          signature,
          isProposer: proposers.includes(addr),
        }
      })

      proposalRequestLeafs.push({
        chainId: Number(chainId),
        index,
        to,
        leafType: functionName,
        data,
        siblings: proof,
        threshold: Number(leafThreshold),
        signers,
      })
    }
  }

  const managerVersionString = `v${newConfig.version.major}.${newConfig.version.minor}.${newConfig.version.patch}`

  // TODO(docs): mv
  // We calculate the auth address based on the current owners since this is used to store the
  // address of the auth contract on any new chains in the DB.
  // Note that calculating this here and passing in a single value works as long as the address
  // is the same on all networks, but we may need to change this in the future to support chains
  // which calculate addresses in different ways. I.e ZKSync Era
  const proposalRequest: ProposalRequest = {
    apiKey,
    orgId: newConfig.orgId,
    isTestnet,
    chainIds: parsedConfigsWithArtifacts.map(({ parsedConfig }) =>
      Number(parsedConfig.chainId)
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
    diff,
    tree: {
      root,
      chainStatus,
      leaves: proposalRequestLeafs,
    },
  }

  const compilerConfigArray = Object.values(compilerConfigs)
  if (!dryRun) {
    const websiteLink = blue(hyperlink('website', WEBSITE_URL))
    await relayProposal(proposalRequest)
    await relayIPFSCommit(apiKey, newConfig.orgId, compilerConfigArray)
    spinner.succeed(
      `Proposal succeeded! Go to ${websiteLink} to approve the deployment.`
    )
  } else {
    spinner.succeed(`Proposal dry run succeeded!`)
  }
  return { proposalRequest, ipfsData: compilerConfigArray }
}
