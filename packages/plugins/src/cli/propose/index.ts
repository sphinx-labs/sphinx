import { join, resolve } from 'path'
import { readFileSync } from 'fs'
import { spawnSync } from 'child_process'

import {
  AuthLeaf,
  CanonicalConfig,
  ChainInfo,
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

import { decodeChainInfoArray } from '../../foundry/structs'
import { getFoundryConfigOptions } from '../../foundry/options'
import { makeGetConfigArtifacts } from '../../foundry/utils'

const pluginRootPath =
  process.env.DEV_FILE_PATH ?? './node_modules/@sphinx-labs/plugins/'

/**
 * @param getCanonicalConfig A function that returns the canonical config. By default, this function
 * will fetch the canonical config from the back-end. However, it can be overridden to return a
 * different canonical config. This is useful for testing.
 * @param dryRun If true, the proposal will not be relayed to the back-end.
 */
export const propose = async (
  confirm: boolean,
  isTestnet: boolean,
  dryRun: boolean,
  scriptPath: string
): Promise<{
  proposalRequest: ProposalRequest | undefined
  ipfsData: string[] | undefined
}> => {
  // We compile the contracts to make sure we're using the latest versions. This command
  // displays the compilation process to the user in real time.
  const { status } = spawnSync(`forge`, ['build'], { stdio: 'inherit' })
  // Exit the process if compilation fails.
  if (status !== 0) {
    process.exit(1)
  }

  // TODO(refactor): redo spinner
  const spinner = ora()
  // spinner.start(`Getting project info...`)

  const { artifactFolder, buildInfoFolder, cachePath } =
    await getFoundryConfigOptions()

  const chainInfoPath = join(cachePath, 'sphinx-chain-info.txt')
  // TODO(case): there's an error in the script. we should bubble it up.
  // TODO: this is the simulation. you should do this in every case.
  try {
    // TODO(refactor): probably change this spinner message b/c we run it even if the user skips
    // the preview. potentially the same w/ deploy task.
    spinner.start(`Generating preview...`)
    await execAsync(
      `forge script ${scriptPath} --sig 'propose(bool,string)' ${isTestnet} ${chainInfoPath}`
    )
  } catch (e) {
    spinner.stop()
    // The `stdout` contains the trace of the error.
    console.log(e.stdout)
    // The `stderr` contains the error message.
    console.log(e.stderr)
    process.exit(1)
  }

  const getConfigArtifacts = makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    cachePath
  )

  // TODO(docs): this must occur after forge build b/c user may run 'forge clean' then call
  // this task, in which case the Sphinx ABI won't exist yet.
  const sphinxArtifactDir = `${pluginRootPath}out/artifacts`
  const SphinxABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(`${sphinxArtifactDir}/Sphinx.sol/Sphinx.json`)).abi

  const abiEncodedChainInfoArray: string = readFileSync(chainInfoPath, 'utf8')
  const chainInfoArray: Array<ChainInfo> = decodeChainInfoArray(
    abiEncodedChainInfoArray,
    SphinxABI
  )

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

  const TODOarray: Array<{
    parsedConfig: ParsedConfig
    configArtifacts: ConfigArtifacts
  }> = []
  for (const chainInfo of chainInfoArray) {
    const configArtifacts = await getConfigArtifacts(chainInfo.actionsTODO)
    const parsedConfig = makeParsedConfig(chainInfo, configArtifacts)
    TODOarray.push({ parsedConfig, configArtifacts })
  }

  const diff = getDiff(TODOarray.map((e) => e.parsedConfig))
  if (!confirm) {
    const diffString = getDiffString(diff)
    spinner.stop()
    await userConfirmation(diffString)
  }

  const shouldBeEqualTODO = TODOarray.map(({ parsedConfig }) => {
    return {
      newConfig: parsedConfig.newConfig,
      authAddress: parsedConfig.authAddress,
      managerAddress: parsedConfig.managerAddress,
    }
  })
  if (!elementsEqual(shouldBeEqualTODO)) {
    throw new Error(`TODO(docs). This is currently unsupported.`)
  }
  // Since we know that the following fields are the same for each `parsedConfig`, we get their
  // values here.
  const { newConfig, authAddress, managerAddress } = TODOarray[0].parsedConfig

  const wallet = new ethers.Wallet(proposerPrivateKey)
  const signerAddress = await wallet.getAddress()

  const leafs: Array<AuthLeaf> = []
  const projectDeployments: Array<ProjectDeployment> = []
  const compilerConfigs: {
    [ipfsHash: string]: string
  } = {}
  const gasEstimates: ProposalRequest['gasEstimates'] = []
  for (const { parsedConfig, configArtifacts } of TODOarray) {
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
  for (const { parsedConfig } of TODOarray) {
    const bundledLeafsForChain = bundledLeafs.filter(
      (l) => l.leaf.chainId === parsedConfig.chainId
    )
    for (const { leaf, prettyLeaf, proof } of bundledLeafsForChain) {
      const { chainId, index, to, functionName } = prettyLeaf
      const { data } = leaf
      const { owners, threshold } = newConfig

      // TODO(docs)
      const proposers = parsedConfig.prevConfig.firstProposalOccurred
        ? parsedConfig.prevConfig.proposers
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
        return { address: addr, signature }
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

  const newChainStates: CanonicalConfig['chainStates'] = {}
  for (const { parsedConfig } of TODOarray) {
    newChainStates[Number(parsedConfig.chainId)] = {
      firstProposalOccurred: true,
      projectCreated: true,
    }
  }

  const managerVersionString = `v${newConfig.version.major}.${newConfig.version.minor}.${newConfig.version.patch}`

  // TODO: mv
  // We calculate the auth address based on the current owners since this is used to store the
  // address of the auth contract on any new chains in the DB.
  // Note that calculating this here and passing in a single value works as long as the address
  // is the same on all networks, but we may need to change this in the future to support chains
  // which calculate addresses in different ways. I.e ZKSync Era
  const proposalRequest: ProposalRequest = {
    apiKey,
    orgId: newConfig.orgId,
    isTestnet,
    chainIds: TODOarray.map(({ parsedConfig }) => Number(parsedConfig.chainId)),
    deploymentName: newConfig.projectName,
    owners: newConfig.owners,
    threshold: Number(newConfig.threshold),
    canonicalConfig: '{}', // TODO(docs): deprecated field
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
