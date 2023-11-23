#!/usr/bin/env node

import * as dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ora from 'ora'
import 'core-js/features/array/at'

import { writeSampleProjectFiles } from '../sample-project'
import { inferSolcVersion } from '../foundry/utils'
import { getFoundryConfigOptions } from '../foundry/options'
// import { propose } from './propose'
import { deploy } from './deploy'
import { propose } from './propose'

// Load environment variables from .env
dotenv.config()

const networkOption = 'network'
const confirmOption = 'confirm'
const dryRunOption = 'dry-run'
const targetContractOption = 'target-contract'
const verifyOption = 'verify'

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
          describe:
            'Propose on the testnets specified in the Sphinx deployment script',
          boolean: true,
        })
        .option('mainnets', {
          describe: `Propose on the mainnets specified in the Sphinx deployment script`,
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
        .option('silent', {
          describe:
            'Silence the output except for error messages. You must also confirm the proposal via the --confirm flag if you specify this option.',
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const { testnets, mainnets, targetContract } = argv
      const confirm = !!argv[confirmOption]
      const dryRun = !!argv.dryRun
      const silent = !!argv.silent

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

      if (silent && !confirm) {
        // Since the '--silent' option silences the preview, the user must confirm the proposal
        // via the CLI flag.
        console.error(
          `If you specify '--silent', you must also specify '--${confirmOption}' to confirm the proposal.`
        )
        process.exit(1)
      }

      await propose(
        confirm,
        isTestnet,
        dryRun,
        silent,
        scriptPath,
        targetContract
      )
    }
  )
  .command(
    'init',
    'Initialize a sample project',
    (y) =>
      y
        .usage('Usage: npx sphinx init [--quickstart] [--pnpm]')
        .option('quickstart', {
          describe:
            'Initialize the project in a new repository. This writes a new foundry.toml and .env file.',
          boolean: true,
        })
        .option('pnpm', {
          describe:
            'Output remappings for pnpm installations instead of npm or yarn.',
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const quickstart = argv.quickstart ?? false
      const pnpm = argv.pnpm ?? false

      const spinner = ora()
      spinner.start(`Initializing sample project...`)

      const { src, test, script, solc } = await getFoundryConfigOptions()

      const solcVersion = solc ?? (await inferSolcVersion())

      writeSampleProjectFiles(
        src,
        test,
        script,
        quickstart,
        solcVersion,
        pnpm,
        spinner
      )
    }
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
        .option('silent', {
          describe:
            'Silence the output except for error messages. You must also confirm the deployment via the --confirm flag if you specify this option.',
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const { network, targetContract, verify } = argv
      const confirm = !!argv[confirmOption]
      const silent = !!argv.silent

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
      if (silent && !confirm) {
        // Since the '--silent' option silences the preview, the user must confirm the deployment
        // via the CLI flag.
        console.error(
          `If you specify '--silent', you must also specify '--${confirmOption}' to confirm the deployment.`
        )
        process.exit(1)
      }

      await deploy(scriptPath, network, confirm, silent, targetContract, verify)
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
