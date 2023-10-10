#!/usr/bin/env node

import { join, resolve } from 'path'
import { spawnSync } from 'child_process'
import { readFileSync, existsSync, unlinkSync } from 'fs'

import * as dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ora from 'ora'
import {
  displayDeploymentTable,
  execAsync,
  makeParsedConfig,
  spawnAsync,
} from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import { satisfies } from 'semver'
import {
  getPreview,
  getPreviewString,
  userConfirmation,
  SphinxActionType,
  getEtherscanEndpointForNetwork,
  SUPPORTED_NETWORKS,
} from '@sphinx-labs/core'
import 'core-js/features/array/at'

import { red } from 'chalk'

import { writeSampleProjectFiles } from '../sample-project'
import { inferSolcVersion, makeGetConfigArtifacts } from '../foundry/utils'
import { getFoundryConfigOptions } from '../foundry/options'
import { generateClient } from './typegen/client'
import { decodeDeploymentInfo } from '../foundry/decode'
import { propose } from './propose'
import { writeDeploymentArtifactsUsingEvents } from '../foundry/artifacts'

// Load environment variables from .env
dotenv.config()

const networkOption = 'network'
const confirmOption = 'confirm'
const dryRunOption = 'dry-run'
const targetContractOption = 'target-contract'
const verifyOption = 'verify'

// TODO(md): should we call it a "Sphinx Config" anymore? if not, change the language everywhere

yargs(hideBin(process.argv))
  .scriptName('sphinx')
  .command(
    'propose',
    `Propose a deployment. Signs a proposal meta transaction and relays it to Sphinx's back-end, unless dry run is enabled.`,
    (y) =>
      y
        .usage(
          `Usage: npx sphinx propose <script_path> [--testnets|--mainnets] [OPTIONS]`
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
        .option(targetContractOption, {
          describe:
            'The name of the contract within the script file. Necessary when there are multiple contracts in the specified script.',
          type: 'string',
          alias: 'tc',
        })
        .hide('version'),
    async (argv) => {
      const { testnets, mainnets, targetContract } = argv
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

      await propose(confirm, isTestnet, dryRun, scriptPath, targetContract)
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

      const spinner = ora()
      spinner.start(`Initializing sample project...`)

      const { src, test, script, solc } = await getFoundryConfigOptions()

      const solcVersion = solc ?? (await inferSolcVersion())

      writeSampleProjectFiles(src, test, script, quickstart, solcVersion)
      spinner.succeed('Initialized sample project.')
    }
  )
  .command(
    'generate',
    'Generate Sphinx Client contracts for a project',
    (y) => y.usage(`Usage: npx sphinx generate`).hide('version'),
    generateClient
  )
  .command(
    'deploy',
    `Executes the user's 'deploy' function on the given network. Displays a preview before the deployment, and writes artifacts after.`,
    (y) =>
      y
        .usage(
          `Usage: npx sphinx deploy <script_path> --network <network_name> [OPTIONS]`
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
        .option(targetContractOption, {
          describe:
            'The name of the contract within the script file. Necessary when there are multiple contracts in the specified script.',
          type: 'string',
          alias: 'tc',
        })
        .option(verifyOption, {
          describe: 'Whether to verify the deployment on Etherscan.',
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const { network, targetContract, verify } = argv
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

      const {
        artifactFolder,
        buildInfoFolder,
        cachePath,
        rpcEndpoints,
        deploymentFolder,
        etherscan,
      } = await getFoundryConfigOptions()

      // If the verification flag is specified, then make sure there is an etherscan configuration for the target network
      if (verify) {
        if (!etherscan || !etherscan[network]) {
          const endpoint = getEtherscanEndpointForNetwork(network)
          console.error(
            red(
              `No etherscan configuration detected for ${network}. Please configure it in your foundry.toml file:\n` +
                `[etherscan]\n` +
                `${network} = { key = "<your api key>", url = "${endpoint.urls.apiURL}", chain = ${SUPPORTED_NETWORKS[network]} }`
            )
          )
          process.exit(1)
        }
      }

      // We must load this ABI after running `forge build` to prevent a situation where the user
      // clears their artifacts then calls this task, in which case the `SphinxPluginTypes` artifact
      // won't exist yet.
      const SphinxPluginTypesABI =
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(resolve(
          `${artifactFolder}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
        )).abi

      const getConfigArtifacts = makeGetConfigArtifacts(
        artifactFolder,
        buildInfoFolder,
        cachePath
      )

      const forkUrl = rpcEndpoints[network]
      if (!forkUrl) {
        console.error(
          red(
            `No RPC endpoint specified in your foundry.toml for the network: ${network}.`
          )
        )
        process.exit(1)
      }

      const deploymentInfoPath = join(cachePath, 'sphinx-chain-info.txt')

      const spinner = ora()
      if (confirm) {
        spinner.info(`Skipping preview.`)
      } else {
        spinner.start(`Generating preview...`)

        // Delete the deployment info if one already exists. This isn't strictly necessary, but it
        // ensures that we don't accidentally display an outdated preview to the user.
        if (existsSync(deploymentInfoPath)) {
          unlinkSync(deploymentInfoPath)
        }

        const forgeScriptPreviewArgs = [
          'script',
          scriptPath,
          '--sig',
          "'sphinxDeployTask(string,string)'",
          network,
          deploymentInfoPath,
          '--rpc-url',
          forkUrl,
        ]
        if (targetContract) {
          forgeScriptPreviewArgs.push('--target-contract', targetContract)
        }

        const { stdout, stderr, code } = await spawnAsync(
          'forge',
          forgeScriptPreviewArgs
        )
        if (code !== 0) {
          spinner.stop()
          // The `stdout` contains the trace of the error.
          console.log(stdout)
          // The `stderr` contains the error message.
          console.log(stderr)
          process.exit(1)
        }

        const encodedPreviewDeploymentInfo = readFileSync(
          deploymentInfoPath,
          'utf8'
        )
        const previewDeploymentInfo = decodeDeploymentInfo(
          encodedPreviewDeploymentInfo,
          SphinxPluginTypesABI
        )
        const previewConfigArtifacts = await getConfigArtifacts(
          previewDeploymentInfo.actionInputs
        )
        const previewParsedConfig = makeParsedConfig(
          previewDeploymentInfo,
          previewConfigArtifacts
        )

        const preview = getPreview([previewParsedConfig])
        const previewString = getPreviewString(preview)

        spinner.stop()
        await userConfirmation(previewString)
      }

      // Delete the deployment info if one already exists. This isn't strictly necessary, but it
      // ensures that we use the correct deployment info when writing the deployment artifacts.
      if (existsSync(deploymentInfoPath)) {
        unlinkSync(deploymentInfoPath)
      }

      const forgeScriptDeployArgs = [
        'script',
        scriptPath,
        '--sig',
        'sphinxDeployTask(string,string)',
        network,
        deploymentInfoPath,
        '--fork-url',
        forkUrl,
        '--broadcast',
      ]
      if (verify) {
        forgeScriptDeployArgs.push('--verify')
      }
      if (targetContract) {
        forgeScriptDeployArgs.push('--target-contract', targetContract)
      }

      const { status } = spawnSync(`forge`, forgeScriptDeployArgs, {
        stdio: 'inherit',
      })
      if (status !== 0) {
        process.exit(1)
      }

      spinner.start(`Writing deployment artifacts...`)

      const encodedDeploymentInfo = readFileSync(deploymentInfoPath, 'utf8')
      const deploymentInfo = decodeDeploymentInfo(
        encodedDeploymentInfo,
        SphinxPluginTypesABI
      )
      const configArtifacts = await getConfigArtifacts(
        deploymentInfo.actionInputs
      )
      const parsedConfig = makeParsedConfig(deploymentInfo, configArtifacts)

      const containsDeployment = parsedConfig.actionInputs.some(
        (action) =>
          action.actionType === SphinxActionType.DEPLOY_CONTRACT.toString() &&
          !action.skip
      )

      if (containsDeployment) {
        const provider = new SphinxJsonRpcProvider(forkUrl)
        const deploymentArtifactPath =
          await writeDeploymentArtifactsUsingEvents(
            provider,
            parsedConfig,
            configArtifacts,
            deploymentFolder
          )
        spinner.succeed(
          `Wrote deployment artifacts to: ${deploymentArtifactPath}`
        )
      } else {
        spinner.succeed(`No deployment artifacts to write.`)
      }

      displayDeploymentTable(parsedConfig)
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
