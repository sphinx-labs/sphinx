#!/usr/bin/env node

import { join, resolve } from 'path'
import { exec, spawnSync } from 'child_process'
import { readFileSync, existsSync, unlinkSync } from 'fs'

import { blue } from 'chalk'
import * as dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ora from 'ora'
import {
  equal,
  execAsync,
  fetchCanonicalConfig,
  hyperlink,
  isSupportedNetworkName,
  makeParsedConfig,
  relayIPFSCommit,
  relayProposal,
} from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import { satisfies } from 'semver'
import { getSphinxManagerAddress } from '@sphinx-labs/core/dist/addresses'
import {
  Contract,
  Wallet,
  keccak256,
  parseEther,
  toBeHex,
  toUtf8Bytes,
} from 'ethers'
import {
  getDiff,
  getDiffString,
  userConfirmation,
  ensureSphinxInitialized,
  UserConfig,
  UserConfigWithOptions,
  RawSphinxAction,
  DeployContractTODO,
  FunctionCallTODO,
  SphinxConfig,
  SemverVersion,
  ParsedConfig,
  SphinxActionType,
  ChainInfo,
  ConfigArtifacts,
  WEBSITE_URL,
  ProposalRequest,
  CanonicalConfig,
  getAuthLeafSignerInfo,
  RoleType,
  ProposalRequestLeaf,
  signAuthRootMetaTxn,
  makeAuthBundle,
  getProjectDeploymentForChain,
  getAuthLeafsForChain,
  getProjectBundleInfo,
  ProjectDeployment,
  AuthLeaf,
  ParsedConfigVariable,
} from '@sphinx-labs/core'
import 'core-js/features/array/at'

import { writeSampleProjectFiles } from '../sample-project'
import {
  inferSolcVersion,
  makeGetConfigArtifacts,
  makeGetProviderFromChainId,
} from '../foundry/utils'
import { getFoundryConfigOptions } from '../foundry/options'
import { createSphinxRuntime } from '../cre'
// import { writeDeploymentArtifactsUsingEvents } from '../foundry/artifacts'
import { generateClient } from './typegen/client'
import { decodeChainInfo, decodeChainInfoArray } from '../foundry/structs'

// Load environment variables from .env
dotenv.config()

const configOption = 'config'
const rpcOption = 'rpc'
const projectOption = 'project'
const privateKeyOption = 'private-key'
const networkOption = 'network'
const confirmOption = 'confirm'
const dryRunOption = 'dry-run'

// TODO(refactor): "SemverVersion" is redundant

const pluginRootPath =
  process.env.DEV_FILE_PATH ?? './node_modules/@sphinx-labs/plugins/'

// TODO(docs): address(uint160(uint256(keccak256('sphinx.actions')) - 1))
const SPHINX_ACTIONS_ADDRESS = '0x56ab627a05e305e206291ee8d40621af4fc22f15'

// Gets a random integer between min and max, inclusive.
// TODO: mv
const getRandomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min
const getAvailablePort = async () => {
  let attempts: number = 0
  while (attempts < 100) {
    const port = getRandomInt(42000, 42999)
    try {
      await execAsync(`anvil --port ${port}`)
      const { stdout: pid } = await execAsync(`lsof -t -i:${port}`)
      await execAsync(`kill $(lsof -t -i:${pid})`)
      return port
    } catch {
      attempts += 1
    }
  }
  throw new Error('Could not find available port')
}

// TODO(refactor): should we call it a "Sphinx Config" anymore? if not, change the language everywhere

yargs(hideBin(process.argv))
  .scriptName('sphinx')
  .command(
    'propose',
    `Propose the latest version of a config file. Signs a proposal meta transaction and relays it to Sphinx's back-end.`, // TODO(docs): update description
    (y) =>
      y
        .usage(
          `Usage: npx sphinx propose <script_path> [--testnets|--mainnets] [--${confirmOption}] [--dry-run]`
        )
        .positional('scriptPath', {
          describe: 'Path to the Forge script file.',
          type: 'string',
        })
        .option('testnets', {
          describe: 'Propose on the testnets specified in the Sphinx config',
          boolean: true,
        })
        .option('mainnets', {
          describe: `Propose on the mainnets specified in the Sphinx config`,
          boolean: true,
        })
        .option(confirmOption, {
          describe:
            'Confirm the proposal without previewing it. Meant to be used in a CI process.',
          boolean: true,
        })
        .option(dryRunOption, {
          describe: `Simulate the proposal without sending it to Sphinx's back-end.`,
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      // const { testnets, mainnets } = argv
      // const confirm = !!argv[confirmOption]
      // const dryRun = !!argv.dryRun
      // if (argv._.length < 2) {
      //   console.error('Must specify a path to a Forge script.')
      //   process.exit(1)
      // }
      // const scriptPath = argv._[1]
      // if (typeof scriptPath !== 'string') {
      //   throw new Error(
      //     'Expected scriptPath to be a string. Should not happen.'
      //   )
      // }
      // let isTestnet: boolean
      // if (testnets && mainnets) {
      //   console.error('Cannot specify both --testnets and --mainnets')
      //   process.exit(1)
      // } else if (testnets) {
      //   isTestnet = true
      // } else if (mainnets) {
      //   isTestnet = false
      // } else {
      //   console.error('Must specify either --testnets or --mainnets')
      //   process.exit(1)
      // }
      // if (dryRun && confirm) {
      //   console.error(
      //     `Cannot specify both --${dryRunOption} and --${confirmOption}. Please choose one.`
      //   )
      //   process.exit(1)
      // }
      // const apiKey = process.env.SPHINX_API_KEY
      // if (!apiKey) {
      //   throw new Error(
      //     "You must specify a 'SPHINX_API_KEY' environment variable."
      //   )
      // }
      // const proposerPrivateKey = process.env.PROPOSER_PRIVATE_KEY
      // if (!proposerPrivateKey) {
      //   throw new Error(
      //     "You must specify a 'PROPOSER_PRIVATE_KEY' environment variable."
      //   )
      // }
      // // TODO(propose): validation
      // // if (
      // //   firstProposalOccurred &&
      // //   !prevConfig.options.proposers.includes(signerAddress)
      // // ) {
      // //   throw new Error(
      // //     `Signer is not currently a proposer on chain ${chainId}. Signer's address: ${signerAddress}\n` +
      // //       `Current proposers: ${prevConfig.options.proposers.map(
      // //         (proposer) => `\n- ${proposer}`
      // //       )}`
      // //   )
      // // }
      // // TODO(propose): check that you can't change the owners and/or threshold of an existing project
      // //     if (
      // //       !parsedConfig.firstProposalOccurred &&
      // //       !newConfig.proposers.includes(signerAddress)
      // //     ) {
      // //       throw new Error(
      // //         `Signer must be a proposer in the config file. Signer's address: ${signerAddress}`
      // //       )
      // //     }
      // // We compile the contracts to make sure we're using the latest versions. This command
      // // displays the compilation process to the user in real time.
      // const { status } = spawnSync(`forge`, ['build'], { stdio: 'inherit' })
      // // Exit the process if compilation fails.
      // if (status !== 0) {
      //   process.exit(1)
      // }
      // // TODO(refactor): redo spinner
      // const spinner = ora()
      // // spinner.start(`Getting project info...`)
      // const {
      //   artifactFolder,
      //   buildInfoFolder,
      //   cachePath,
      //   compilerConfigFolder,
      //   rpcEndpoints,
      // } = await getFoundryConfigOptions()
      // const chainInfoPath = join(cachePath, 'sphinx-chain-info.txt')
      // // TODO(case): there's an error in the script. we should bubble it up.
      // // TODO: this is the simulation. you should do this in every case.
      // try {
      //   // TODO(refactor): probably change this spinner message b/c we run it even if the user skips
      //   // the preview. potentially the same w/ deploy task.
      //   spinner.start(`Generating preview...`)
      //   await execAsync(
      //     `forge script ${scriptPath} --sig 'propose(bool,string)' ${isTestnet} ${chainInfoPath}`
      //   )
      // } catch (e) {
      //   spinner.stop()
      //   // The `stdout` contains the trace of the error.
      //   console.log(e.stdout)
      //   // The `stderr` contains the error message.
      //   console.log(e.stderr)
      //   process.exit(1)
      // }
      // // TODO(docs): this must occur after forge build b/c user may run 'forge clean' then call
      // // this task, in which case the Sphinx ABI won't exist yet.
      // const sphinxArtifactDir = `${pluginRootPath}out/artifacts`
      // const SphinxABI =
      //   // eslint-disable-next-line @typescript-eslint/no-var-requires
      //   require(resolve(`${sphinxArtifactDir}/Sphinx.sol/Sphinx.json`)).abi
      // const abiEncodedChainInfoArray: string = readFileSync(
      //   chainInfoPath,
      //   'utf8'
      // )
      // const chainInfoArray: Array<ChainInfo> = decodeChainInfoArray(
      //   abiEncodedChainInfoArray,
      //   SphinxABI
      // )
      // const getConfigArtifacts = makeGetConfigArtifacts(
      //   artifactFolder,
      //   buildInfoFolder,
      //   cachePath
      // )
      // const TODOarray: Array<{
      //   parsedConfig: ParsedConfig
      //   configArtifacts: ConfigArtifacts
      // }> = []
      // for (const chainInfo of chainInfoArray) {
      //   const configArtifacts = await getConfigArtifacts(chainInfo.actionsTODO)
      //   const parsedConfig = makeParsedConfig(chainInfo, configArtifacts)
      //   TODOarray.push({ parsedConfig, configArtifacts })
      // }
      // const shouldBeEqualTODO = TODOarray.map(({ parsedConfig }) => {
      //   return {
      //     newConfig: parsedConfig.newConfig,
      //     authAddress: parsedConfig.authAddress,
      //     managerAddress: parsedConfig.managerAddress,
      //   }
      // })
      // // TODO: mv
      // const elementsEqual = (ary: Array<ParsedConfigVariable>): boolean => {
      //   return ary.every((e) => equal(e, ary[0]))
      // }
      // if (!elementsEqual(shouldBeEqualTODO)) {
      //   throw new Error(`TODO(docs). This is currently unsupported.`)
      // }
      // // Since we know that the following fields are the same for each `parsedConfig`, we get their
      // // values here.
      // const { newConfig, authAddress, managerAddress } =
      //   TODOarray[0].parsedConfig
      // // TODO(docs)
      // const prevCanonicalConfig = await fetchCanonicalConfig(
      //   newConfig.orgId,
      //   isTestnet,
      //   apiKey,
      //   newConfig.projectName
      // )
      // // TODO(docs):
      // for (const { parsedConfig } of TODOarray) {
      //   if (prevCanonicalConfig.)
      // }
      // if (!confirm) {
      //   const diff = getDiff(TODOarray.map((e) => e.parsedConfig))
      //   const diffString = getDiffString(diff)
      //   spinner.stop()
      //   await userConfirmation(diffString)
      // }
      // const cre = createSphinxRuntime(
      //   'hardhat',
      //   true,
      //   false,
      //   confirm,
      //   compilerConfigFolder,
      //   undefined,
      //   false,
      //   process.stderr
      // )
      // // TODO: rm
      // // PREVIOUSLY PROPOSEABSTRACTTASK:
      // const wallet = new Wallet(proposerPrivateKey)
      // const signerAddress = await wallet.getAddress()
      // // TODO: use fetchCanonicalConfig within the proposal task. probably need to use an env variable. actually probably not. just disregard or don't retrieve actions.initialState().
      // // TODO: i think we need to merge the canonical configs like we do in the develop branch
      // const leafs: Array<AuthLeaf> = []
      // const projectDeployments: Array<ProjectDeployment> = []
      // const compilerConfigs: {
      //   [ipfsHash: string]: string
      // } = {}
      // const gasEstimates: ProposalRequest['gasEstimates'] = []
      // for (const { parsedConfig, configArtifacts } of TODOarray) {
      //   const leafsForChain = await getAuthLeafsForChain(
      //     parsedConfig,
      //     configArtifacts
      //   )
      //   leafs.push(...leafsForChain)
      //   const { compilerConfig, configUri, bundles } =
      //     await getProjectBundleInfo(parsedConfig, configArtifacts)
      //   let estimatedGas = 0
      //   estimatedGas += bundles.actionBundle.actions
      //     .map((a) => a.gas)
      //     .reduce((a, b) => a + b, 0)
      //   estimatedGas += bundles.targetBundle.targets.length * 200_000
      //   // Add a constant amount of gas to account for the cost of executing each auth leaf. For
      //   // context, it costs ~350k gas to execute a Setup leaf that adds a single proposer and manager,
      //   // using a single owner as the signer. It costs ~100k gas to execute a Proposal leaf.
      //   estimatedGas += leafsForChain.length * 450_000
      //   gasEstimates.push({
      //     estimatedGas: estimatedGas.toString(),
      //     chainId: parsedConfig.chainId,
      //   })
      //   const projectDeployment = getProjectDeploymentForChain(
      //     leafs,
      //     parsedConfig,
      //     configUri,
      //     bundles
      //   )
      //   if (projectDeployment) {
      //     projectDeployments.push(projectDeployment)
      //   }
      //   compilerConfigs[configUri] = JSON.stringify(compilerConfig, null, 2)
      // }
      // const diff = getDiff(TODOarray.map((e) => e.parsedConfig))
      // if (leafs.length === 0) {
      //   spinner.succeed(
      //     `Skipping proposal because your Sphinx config file has not changed.`
      //   )
      //   return { proposalRequest: undefined, ipfsData: undefined }
      // }
      // if (!cre.confirm && !dryRun) {
      //   spinner.stop()
      //   // Confirm deployment with the user before proceeding.
      //   await userConfirmation(getDiffString(diff))
      //   spinner.start(`Proposal in progress...`)
      // }
      // const chainIdToNumLeafs: { [chainId: number]: number } = {}
      // for (const leaf of leafs) {
      //   const { chainId } = leaf
      //   if (!chainIdToNumLeafs[chainId]) {
      //     chainIdToNumLeafs[chainId] = 0
      //   }
      //   chainIdToNumLeafs[chainId] += 1
      // }
      // const chainStatus = Object.entries(chainIdToNumLeafs).map(
      //   ([chainId, numLeaves]) => ({
      //     chainId: parseInt(chainId, 10),
      //     numLeaves,
      //   })
      // )
      // const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)
      // // Sign the meta-txn for the auth root, or leave it undefined if we're not relaying the proposal
      // // to the back-end.
      // const metaTxnSignature =
      //   !dryRun && !signMetaTxn
      //     ? undefined
      //     : await signAuthRootMetaTxn(wallet, root)
      // const proposalRequestLeafs: Array<ProposalRequestLeaf> = []
      // for (const { parsedConfig } of TODOarray) {
      //   const bundledLeafsForChain = bundledLeafs.filter(
      //     (l) => l.leaf.chainId === parsedConfig.chainId
      //   )
      //   for (const { leaf, prettyLeaf, proof } of bundledLeafsForChain) {
      //     const { chainId, index, to, leafType } = prettyLeaf
      //     const { data } = leaf
      //     let owners: string[]
      //     let proposers: string[]
      //     let threshold: number
      //     if (parsedConfig.firstProposalOccurred) {
      //       ;({ owners, proposers, threshold } = parsedConfig.prevConfig)
      //     } else {
      //       ;({ owners, proposers, threshold } = newConfig)
      //     }
      //     const { leafThreshold, roleType } = getAuthLeafSignerInfo(
      //       threshold,
      //       leafType
      //     )
      //     let signerAddresses: string[]
      //     if (roleType === RoleType.OWNER) {
      //       signerAddresses = owners
      //     } else if (roleType === RoleType.PROPOSER) {
      //       signerAddresses = proposers
      //     } else {
      //       throw new Error(
      //         `Invalid role type: ${roleType}. Should never happen.`
      //       )
      //     }
      //     const signers = signerAddresses.map((addr) => {
      //       const signature =
      //         addr === signerAddress ? metaTxnSignature : undefined
      //       return { address: addr, signature }
      //     })
      //     proposalRequestLeafs.push({
      //       chainId,
      //       index,
      //       to,
      //       leafType,
      //       data,
      //       siblings: proof,
      //       threshold: leafThreshold,
      //       signers,
      //     })
      //   }
      // }
      // const newChainStates: CanonicalConfig['chainStates'] = {}
      // for (const { parsedConfig } of TODOarray) {
      //   newChainStates[parsedConfig.chainId] = {
      //     firstProposalOccurred: true,
      //     projectCreated: true,
      //   }
      // }
      // const managerVersionString = `v${newConfig.managerVersion.major}.${newConfig.managerVersion.minor}.${newConfig.managerVersion.patch}`
      // const newCanonicalConfig: CanonicalConfig = {
      //   manager: managerAddress,
      //   options: {
      //     orgId: newConfig.orgId,
      //     owners: newConfig.owners,
      //     ownerThreshold: newConfig.threshold,
      //     proposers: newConfig.proposers,
      //     managerVersion: managerVersionString,
      //   },
      //   projectName: newConfig.projectName,
      //   chainStates: newChainStates,
      // }
      // // TODO: mv
      // // We calculate the auth address based on the current owners since this is used to store the
      // // address of the auth contract on any new chains in the DB.
      // // Note that calculating this here and passing in a single value works as long as the address
      // // is the same on all networks, but we may need to change this in the future to support chains
      // // which calculate addresses in different ways. I.e ZKSync Era
      // const proposalRequest: ProposalRequest = {
      //   apiKey,
      //   orgId: newConfig.orgId,
      //   isTestnet,
      //   chainIds: TODOarray.map(({ parsedConfig }) => parsedConfig.chainId),
      //   deploymentName: newCanonicalConfig.projectName,
      //   owners: newCanonicalConfig.options.owners,
      //   threshold: newCanonicalConfig.options.ownerThreshold,
      //   authAddress,
      //   managerAddress,
      //   managerVersion: managerVersionString,
      //   canonicalConfig: JSON.stringify(newCanonicalConfig),
      //   projectDeployments,
      //   gasEstimates,
      //   diff,
      //   tree: {
      //     root,
      //     chainStatus,
      //     leaves: proposalRequestLeafs,
      //   },
      // }
      // const compilerConfigArray = Object.values(compilerConfigs)
      // if (!dryRun) {
      //   const websiteLink = blue(hyperlink('website', WEBSITE_URL))
      //   await relayProposal(proposalRequest)
      //   await relayIPFSCommit(apiKey, newConfig.orgId, compilerConfigArray)
      //   spinner.succeed(
      //     `Proposal succeeded! Go to ${websiteLink} to approve the deployment.`
      //   )
      // } else {
      //   spinner.succeed(`Proposal dry run succeeded!`)
      // }
      // // TODO: this was returned in the proposeAbstractTask
      // // return { proposalRequest, ipfsData: compilerConfigArray }
    }
  )
  .command(
    'init',
    'Initialize a sample project',
    (y) =>
      y
        .usage('Usage: npx sphinx init [--quickstart]')
        .option('quickstart', {
          describe:
            'Initialize the project in a new repository. This writes a new foundry.toml and .env file.',
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const quickstart = argv.quickstart ?? false

      const { stdout } = await execAsync('node -v')
      if (!satisfies(stdout, '>=18.16.0')) {
        console.warn(
          '\x1b[33m%s\x1b[0m', // Yellow text
          `Your Node version is less than v18.16.0. We HIGHLY recommend using v18.16.0 or later because\n` +
            `it runs our Foundry plugin significantly faster. To update your Node version, go to:\n` +
            `https://github.com/nvm-sh/nvm#intro`
        )
      }

      const spinner = ora()

      const forgeConfigOutput = await execAsync('forge config --json')
      const forgeConfig = JSON.parse(forgeConfigOutput.stdout)
      const { src, test, script, solc } = forgeConfig

      const solcVersion = solc ?? (await inferSolcVersion())

      writeSampleProjectFiles(
        src,
        test,
        script,
        quickstart,
        solcVersion,
        'foundry'
      )
      spinner.succeed('Initialized Sphinx project.')
    }
  )
  .command(
    'generate',
    'Generate Sphinx Client contracts for a project',
    (y) => y.usage(`Usage: npx sphinx generate`).hide('version'),
    generateClient
  )
  .command(
    'artifacts',
    'Generate deployment artifacts for a Sphinx config file that was already deployed.',
    (y) =>
      y
        .usage(
          `Usage: npx sphinx artifacts --deployer <address> --${rpcOption} <rpc_url> --${projectOption} <name>`
        )
        .option('deployer', {
          describe: 'Address that deployed the project',
          type: 'string',
        })
        .option(rpcOption, {
          describe: 'RPC URL of the network where the deployment occurred',
          type: 'string',
        })
        .option(projectOption, {
          describe: 'Name of the project that was deployed',
          type: 'string',
        })
        .hide('version'),
    async (argv) => {
      const { deployer: owner, rpc, project } = argv
      if (!owner) {
        console.error('Must specify --deployer')
        process.exit(1)
      }
      if (!rpc) {
        console.error(`Must specify --${rpcOption}`)
        process.exit(1)
      }
      if (!project) {
        console.error(`Must specify --${projectOption}`)
        process.exit(1)
      }

      const spinner = ora()
      spinner.start(`Writing deployment artifacts...`)

      const { deploymentFolder, cachePath } = await getFoundryConfigOptions()

      const provider = new SphinxJsonRpcProvider(rpc)

      const managerAddress = getSphinxManagerAddress(owner, project)

      // TODO(artifacts)
      // await writeDeploymentArtifactsUsingEvents(
      //   provider,
      //   project,
      //   managerAddress,
      //   cachePath,
      //   deploymentFolder,
      //   spinner
      // )
    }
  )
  .command(
    'deploy',
    `Deploy a Sphinx config file using Foundry. Writes deployment artifacts if broadcasting.`, // TODO: update?
    (y) =>
      y
        .usage(
          `Usage: npx sphinx deploy <script_path> [--${networkOption} <network_name> --${confirmOption}]`
        )
        .positional('scriptPath', {
          describe: 'Path to the Forge script file.',
          type: 'string',
        })
        .option(networkOption, {
          describe: 'Name of the network to deploy on.',
          type: 'string',
        })
        .option(confirmOption, {
          describe: 'Confirm the deployment without displaying a preview.',
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      // TODO(case): two contracts in the script file. you'd need to replicate forge's --tc. you also
      // need to do this for proposals.

      const { network } = argv
      const confirm = !!argv[confirmOption]

      if (argv._.length < 2) {
        console.error('Must specify a path to a Forge script.')
        process.exit(1)
      }
      const scriptPath = argv._[1]
      if (typeof scriptPath !== 'string') {
        throw new Error(
          'Expected scriptPath to be a string. Should not happen.'
        )
      }
      if (!network) {
        console.error(
          `You must specify a network via '--network <network_name>'.`
        )
        process.exit(1)
      }

      // First, we compile the contracts to make sure we're using the latest versions. This command
      // displays the compilation process to the user in real time.
      const { status: compilationStatus } = spawnSync(`forge`, ['build'], {
        stdio: 'inherit',
      })
      // Exit the process if compilation fails.
      if (compilationStatus !== 0) {
        process.exit(1)
      }

      const { artifactFolder, buildInfoFolder, cachePath, rpcEndpoints } =
        await getFoundryConfigOptions()

      const forkUrl = rpcEndpoints[network]
      if (!forkUrl) {
        console.error(
          `No RPC endpoint specified in your foundry.toml for the network: ${network}.`
        )
        process.exit(1)
      }

      // TODO(refactor): update spinner
      const spinner = ora()
      // spinner.start('Getting project info...')

      const chainInfoPath = join(cachePath, 'sphinx-chain-info.txt')

      // Delete the chain info if one already exists
      // We do this b/c the file wont be output if there is not broadcast in the users script and we need a clean way to detect that
      if (existsSync(chainInfoPath)) {
        unlinkSync(chainInfoPath)
      }

      // TODO(docs): we run this even if the user is skipping the preview b/c we need the ParsedConfig
      // for the deployment artifacts.

      // TODO(case): there's an error in the script. we should bubble it up.
      // TODO: this is the simulation. you should do this in every case.
      process.env['SPHINX_INTERNAL__PREVIEW_ENABLED'] = 'true'
      process.env['SPHINX_INTERNAL__CHAIN_INFO_PATH'] = chainInfoPath
      try {
        spinner.start(`Generating preview...`)
        await execAsync(`forge script ${scriptPath} --rpc-url ${forkUrl}`)
      } catch (e) {
        spinner.stop()
        // The `stdout` contains the trace of the error.
        console.log(e.stdout)
        // The `stderr` contains the error message.
        console.log(e.stderr)
        process.exit(1)
      }
      delete process.env['SPHINX_INTERNAL__PREVIEW_ENABLED']
      delete process.env['SPHINX_INTERNAL__CHAIN_INFO_PATH']

      // TODO(case): say the user is deploying on the anvil node with --skip-preview. i think we
      // should keep this function minimal. e.g. i don't think we should require them to wrap their
      // `deploy(...)` function with `vm.startBroadcast()`.

      // TODO(docs): this must occur after forge build b/c user may run 'forge clean' then call
      // this task, in which case the Sphinx ABI won't exist yet.
      const sphinxArtifactDir = `${pluginRootPath}out/artifacts`
      const SphinxABI =
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(resolve(`${sphinxArtifactDir}/Sphinx.sol/Sphinx.json`)).abi

      // TODO(case): you should probably make sure that the user only calls `deploy` once
      // in their script. e.g. we may execute incorrect actions if the user does
      // something like `deploy(goerli); deploy(optimism-goerli)`.

      const abiEncodedChainInfo: string = readFileSync(chainInfoPath, 'utf8')
      const chainInfo: ChainInfo = decodeChainInfo(
        abiEncodedChainInfo,
        SphinxABI
      )

      const getConfigArtifacts = makeGetConfigArtifacts(
        artifactFolder,
        buildInfoFolder,
        cachePath
      )
      const configArtifacts = await getConfigArtifacts(chainInfo.actionsTODO)
      const parsedConfig = makeParsedConfig(chainInfo, configArtifacts)

      if (!confirm) {
        const diff = getDiff([parsedConfig])
        const diffString = getDiffString(diff)

        spinner.stop()
        await userConfirmation(diffString)
      }

      const { status } = spawnSync(
        `forge`,
        ['script', scriptPath, '--fork-url', forkUrl, '--broadcast'],
        { stdio: 'inherit' }
      )
      if (status !== 0) {
        process.exit(1)
      }

      // TODO: currently, we don't check if the user has `vm.startBroadcast` in their script. if they don't,
      // and we also don't have an existing 'sphinx-chain-info.txt' file, then i believe this will fail.

      // const containsContractDeployment = parsedConfig.actionsTODO.some(
      //   (e) => !e.skip && e.actionType === SphinxActionType.DEPLOY_CONTRACT
      // )

      // TODO: display addresses to the user

      // TODO: write deployment artifacts
      // if (containsContractDeployment) {
      //   spinner.start(`Writing dwNote that we use --swc because it speeds up the execution of the
      //   // script.
      //   const { stdout } = await execAsync(
      //     `npx ts-node --swc ${userConfigScriptPath} ${config}`
      //   )
      //   const userConfig: UserConfig = JSON.parse(stdout)
      //   await writeDeploymentArtifactsUsingEvents(
      //     provider,
      //     userConfig.projectName,
      //     owner.address,
      //     cachePath,
      //     deploymentFolder,
      //     spinner
      //   )
      // }
    }
  )
  // Display the help menu when `npx sphinx` is called without any arguments.
  .showHelpOnFail(process.argv.length === 2 ? true : false)
  .demandCommand(
    1,
    'To get help for a specific task run: npx sphinx [task] --help'
  )
  .parse()
