import { join, resolve } from 'path'
import { readFileSync, existsSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'

import {
  AuthLeaf,
  DeploymentInfo,
  ConfigArtifacts,
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

  const { cachePath } = await getFoundryConfigOptions()
  const bundleInfoPath = join(cachePath, 'sphinx-bundle-info.txt')

  // Delete the deployment info if one already exists. This isn't strictly necessary, but it ensures
  // that we don't accidentally display an outdated preview to the user.
  if (existsSync(bundleInfoPath)) {
    unlinkSync(bundleInfoPath)
  }

  const forgeScriptArgs = [
    'script',
    scriptPath,
    '--sig',
    "'sphinxProposeTask(bool,string)'",
    isTestnet,
    bundleInfoPath,
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

  // TODO: you need to include the leafFunctionName in the solidity bundledauthleaf

  const abiEncodedBundleInfo = readFileSync(bundleInfoPath, 'utf8')
  // TODO:
  // type BundleInfo {
  //   string authRoot;
  //   chains: BundleInfoOnChain {
  //     string networkName;
  //     string configUri;
  //     BundledAuthLeaf[] authLeafs;
  //     SphinxActionBundle actionBundle;
  //     SphinxTargetBundle targetBundle;
  //     HumanReadableAction[] humanReadableActions;
  //     CompilerConfig compilerConfig
  //   }
  // }

  const bundleInfo = decodeBundleInfo(
    abiEncodedBundleInfo,
    SphinxPluginTypesABI
  )

  const diff = getDiff(bundleInfo.chains.map((c) => c.compilerConfig))
  if (confirm) {
    spinner.succeed(`Parsed simulation results.`)
  } else {
    const diffString = getDiffString(diff)
    spinner.stop()
    await userConfirmation(diffString)
  }

  spinner.start(`Running proposal...`)

  const shouldBeEqual = bundleInfo.chains.map(({ compilerConfig }) => {
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
    bundleInfo.chains[0].compilerConfig

  const wallet = new ethers.Wallet(proposerPrivateKey)
  const signerAddress = await wallet.getAddress()

  const projectDeployments: Array<ProjectDeployment> = []
  const compilerConfigs: {
    [ipfsHash: string]: string
  } = {}
  const gasEstimates: ProposalRequest['gasEstimates'] = []
  for (const bundleInfoOnChain of bundleInfo.chains) {
    const { authLeafs, configUri, compilerConfig, actionBundle, targetBundle } =
      bundleInfoOnChain

    let estimatedGas = 0
    estimatedGas += actionBundle.actions
      .map((a) => a.gas)
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

  const emptyBundle = bundleInfo.chains.every((c) => c.authLeafs.length === 0)
  if (emptyBundle.length === 0) {
    spinner.succeed(
      `Skipping proposal because there is nothing to propose on any chain.`
    )
    return { proposalRequest: undefined, ipfsData: undefined }
  }

  const chainStatus = bundleInfo.chains.map((c) => ({
    chainId: Number(c.compilerConfig.chainId),
    numLeaves: c.authLeafs.length,
  }))

  // Sign the meta-txn for the auth root, or leave it undefined if we're doing a dry run.
  const metaTxnSignature = dryRun
    ? await signAuthRootMetaTxn(wallet, bundleInfo.authRoot)
    : undefined

  const proposalRequestLeafs: Array<ProposalRequestLeaf> = []
  for (const { compilerConfig, authLeafs } of bundleInfo.chains) {
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
    chainIds: bundleInfo.chains.map(({ compilerConfig }) =>
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
    diff,
    tree: {
      root: bundleInfo.authRoot,
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
