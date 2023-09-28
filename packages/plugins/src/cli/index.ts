#!/usr/bin/env node

import { join, resolve } from 'path'
import { spawnSync } from 'child_process'
import { readFileSync, existsSync, unlinkSync } from 'fs'

import * as dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ora from 'ora'
import { execAsync, makeParsedConfig } from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import { satisfies } from 'semver'
import { getSphinxManagerAddress } from '@sphinx-labs/core/dist/addresses'
import {
  getDiff,
  getDiffString,
  userConfirmation,
  ChainInfo,
  proposeAbstractTask,
} from '@sphinx-labs/core'
import 'core-js/features/array/at'

import { writeSampleProjectFiles } from '../sample-project'
import { inferSolcVersion, makeGetConfigArtifacts } from '../foundry/utils'
import { getFoundryConfigOptions } from '../foundry/options'
// import { writeDeploymentArtifactsUsingEvents } from '../foundry/artifacts'
import { generateClient } from './typegen/client'
import { decodeChainInfo, decodeChainInfoArray } from '../foundry/structs'

// Load environment variables from .env
dotenv.config()

const rpcOption = 'rpc'
const projectOption = 'project'
const networkOption = 'network'
const confirmOption = 'confirm'
const dryRunOption = 'dry-run'

// TODO(refactor): "SemverVersion" is redundant

const pluginRootPath =
  process.env.DEV_FILE_PATH ?? './node_modules/@sphinx-labs/plugins/'

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
      const { testnets, mainnets } = argv
      const confirm = !!argv[confirmOption]
      const dryRun = !!argv.dryRun

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

      let isTestnet: boolean
      if (testnets && mainnets) {
        console.error('Cannot specify both --testnets and --mainnets')
        process.exit(1)
      } else if (testnets) {
        isTestnet = true
      } else if (mainnets) {
        isTestnet = false
      } else {
        console.error('Must specify either --testnets or --mainnets')
        process.exit(1)
      }

      if (dryRun && confirm) {
        console.error(
          `Cannot specify both --${dryRunOption} and --${confirmOption}. Please choose one.`
        )
        process.exit(1)
      }

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
        const {stdout: TODO} = await execAsync(
          `forge script ${scriptPath} --sig 'propose(bool,string)' ${isTestnet} ${chainInfoPath}`
        )
        console.log(TODO)
      } catch (e) {
        spinner.stop()
        // The `stdout` contains the trace of the error.
        console.log(e.stdout)
        // The `stderr` contains the error message.
        console.log(e.stderr)
        process.exit(1)
      }

      // TODO(docs): this must occur after forge build b/c user may run 'forge clean' then call
      // this task, in which case the Sphinx ABI won't exist yet.
      const sphinxArtifactDir = `${pluginRootPath}out/artifacts`
      const SphinxABI =
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(resolve(`${sphinxArtifactDir}/Sphinx.sol/Sphinx.json`)).abi

      const abiEncodedChainInfoArray: string = readFileSync(
        chainInfoPath,
        'utf8'
      )
      const chainInfoArray: Array<ChainInfo> = decodeChainInfoArray(
        abiEncodedChainInfoArray,
        SphinxABI
      )

      const getConfigArtifacts = makeGetConfigArtifacts(
        artifactFolder,
        buildInfoFolder,
        cachePath
      )

      await proposeAbstractTask(
        chainInfoArray,
        getConfigArtifacts,
        confirm,
        isTestnet,
        dryRun,
        spinner
      )
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
      try {
        spinner.start(`Generating preview...`)
        await execAsync(
          `forge script ${scriptPath} --sig 'preview(string,string)' ${network} ${chainInfoPath} --rpc-url ${forkUrl}`
        )
      } catch (e) {
        spinner.stop()
        // The `stdout` contains the trace of the error.
        console.log(e.stdout)
        // The `stderr` contains the error message.
        console.log(e.stderr)
        process.exit(1)
      }

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
        [
          'script',
          scriptPath,
          '--sig',
          'deploy(string)',
          network,
          '--fork-url',
          forkUrl,
          '--broadcast',
        ],
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
  // The following command displays the help menu when `npx sphinx` is called with an incorrect
  // argument, e.g. `npx sphinx asdf`.
  .command('*', '', ({ argv }) => {
    if (argv['_'].length > 0) {
      console.error(
        `Unknown task: ${argv['_'][0]}. Run 'npx sphinx --help' to see available tasks.`
      )
    } else {
      console.error(`Call 'npx sphinx --help' to see the list of commands.`)
    }
  })
  // If we don't disable this, then the help menu will be displayed upon *any* error that occurs
  // within a task, such as a failing API call, which would be confusing to the user.
  .showHelpOnFail(false)
  .parse()
