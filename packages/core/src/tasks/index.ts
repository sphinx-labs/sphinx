import process from 'process'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import ora from 'ora'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'
import { blue } from 'chalk'

import {
  SphinxInput,
  CanonicalConfig,
  ConfigArtifacts,
  CompilerConfig,
  ParsedConfig,
  GetConfigArtifacts,
  ChainInfo,
} from '../config/types'
import {
  relayProposal,
  relayIPFSCommit,
  userConfirmation,
  hyperlink,
  elementsEqual,
  makeParsedConfig,
} from '../utils'
import { getMinimumCompilerInput } from '../languages'
import { WEBSITE_URL } from '../constants'
import {
  SphinxBundles,
  ProposalRequestLeaf,
  RoleType,
  getAuthLeafSignerInfo,
  makeAuthBundle,
  makeBundlesFromConfig,
  ProposalRequest,
  AuthLeaf,
  getProjectDeploymentForChain,
  getAuthLeafsForChain,
  ProjectDeployment,
  HumanReadableActions,
} from '../actions'
import { signAuthRootMetaTxn } from '../metatxs'
import { getDiff, getDiffString } from '../diff'

// Load environment variables from .env
dotenv.config()

/**
 * @param getCanonicalConfig A function that returns the canonical config. By default, this function
 * will fetch the canonical config from the back-end. However, it can be overridden to return a
 * different canonical config. This is useful for testing.
 * @param dryRun If true, the proposal will not be relayed to the back-end.
 */
export const proposeAbstractTask = async (
  chainInfoArray: Array<ChainInfo>,
  getConfigArtifacts: GetConfigArtifacts,
  confirm: boolean,
  isTestnet: boolean,
  dryRun: boolean,
  spinner: ora.Ora = ora({ isSilent: true })
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

      let owners: string[]
      let proposers: string[]
      let threshold: bigint
      if (parsedConfig.prevConfig.firstProposalOccurred) {
        ;({ owners, proposers, threshold } = parsedConfig.prevConfig)
      } else {
        ;({ owners, proposers, threshold } = newConfig)
      }

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

// TODO: c/f configArtifacts[ and replace referenceName with FQN

export const sphinxCommitAbstractSubtask = async (
  parsedConfig: ParsedConfig,
  commitToIpfs: boolean,
  configArtifacts: ConfigArtifacts,
  ipfsUrl?: string
): Promise<{
  configUri: string
  compilerConfig: CompilerConfig
}> => {
  const sphinxInputs: Array<SphinxInput> = []

  const notSkipped = parsedConfig.actionsTODO.filter((a) => !a.skip)

  for (const actionTODO of notSkipped) {
    const { fullyQualifiedName } = actionTODO
    const { buildInfo } = configArtifacts[fullyQualifiedName]

    const prevSphinxInput = sphinxInputs.find(
      (input) => input.solcLongVersion === buildInfo.solcLongVersion
    )

    // Split the contract's fully qualified name
    const [sourceName, contractName] = fullyQualifiedName.split(':')

    const { language, settings, sources } = getMinimumCompilerInput(
      buildInfo.input,
      buildInfo.output.contracts,
      sourceName,
      contractName
    )

    if (prevSphinxInput === undefined) {
      const sphinxInput: SphinxInput = {
        solcVersion: buildInfo.solcVersion,
        solcLongVersion: buildInfo.solcLongVersion,
        id: buildInfo.id,
        input: {
          language,
          settings,
          sources,
        },
      }
      sphinxInputs.push(sphinxInput)
    } else {
      prevSphinxInput.input.sources = {
        ...prevSphinxInput.input.sources,
        ...sources,
      }
    }
  }

  const compilerConfig: CompilerConfig = {
    ...parsedConfig,
    inputs: sphinxInputs,
  }

  const ipfsData = JSON.stringify(compilerConfig, null, 2)

  let ipfsHash
  if (!commitToIpfs) {
    // Get the IPFS hash without publishing anything on IPFS.
    ipfsHash = await Hash.of(ipfsData)
  } else if (ipfsUrl) {
    const ipfs = create({
      url: ipfsUrl,
    })
    ipfsHash = (await ipfs.add(ipfsData)).path
  } else if (process.env.IPFS_PROJECT_ID && process.env.IPFS_API_KEY_SECRET) {
    const projectCredentials = `${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_API_KEY_SECRET}`
    const ipfs = create({
      host: 'ipfs.infura.io',
      port: 5001,
      protocol: 'https',
      headers: {
        authorization: `Basic ${Buffer.from(projectCredentials).toString(
          'base64'
        )}`,
      },
    })
    ipfsHash = (await ipfs.add(ipfsData)).path
  } else {
    throw new Error(
      `To commit to IPFS, you must first setup an IPFS project with
Infura: https://app.infura.io/. Once you've done this, copy and paste the following
variables into your .env file:

IPFS_PROJECT_ID: ...
IPFS_API_KEY_SECRET: ...
        `
    )
  }

  const configUri = `ipfs://${ipfsHash}`

  return { configUri, compilerConfig }
}

// TODO: see if Foundry can automatically verify the contracts. It's unlikely because we
// deploy them in a non-standard way, but it's possible. If foundry can do it, we should just
// never pass in the `etherscanApiKey`. if foundry can't do it, we should  retrieve the api key
// via `execAsync(forge config --json)` and pass it in here

export const getProjectBundleInfo = async (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts
): Promise<{
  configUri: string
  compilerConfig: CompilerConfig
  bundles: SphinxBundles
  humanReadableActions: HumanReadableActions
}> => {
  const { configUri, compilerConfig } = await sphinxCommitAbstractSubtask(
    parsedConfig,
    false,
    configArtifacts
  )

  const { bundles, humanReadableActions } = makeBundlesFromConfig(
    parsedConfig,
    configArtifacts
  )

  return { configUri, compilerConfig, bundles, humanReadableActions }
}
