#!/usr/bin/env node

import * as dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { init } from '../sample-project'
import { deploy } from './deploy'
import { propose } from './propose'
import {
  fetchNPMRemappings,
  fetchPNPMRemappings,
} from '../sample-project/sample-foundry-config'

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
          `Usage: npx sphinx propose <scriptPath> [--testnets|--mainnets] [--tc <targetContract>] [--confirm] [--dry-run] [--silent]`
        )
        .positional('scriptPath', {
          describe: 'Path to the Forge script file.',
          type: 'string',
        })
        .option('testnets', {
          describe: `Propose on the 'sphinxConfig.testnets' in the script`,
          boolean: true,
        })
        .option('mainnets', {
          describe: `Propose on the 'sphinxConfig.mainnets' in the script`,
          boolean: true,
        })
        .option(confirmOption, {
          describe: 'Confirm the proposal without previewing it.',
          boolean: true,
          default: false,
        })
        .option(dryRunOption, {
          describe: `Dry run the proposal without sending it to Sphinx's backend.`,
          boolean: true,
          default: false,
        })
        .option(targetContractOption, {
          describe: 'The name of the contract to run in the script.',
          type: 'string',
          alias: 'tc',
        })
        .option('silent', {
          describe: 'Silence the output except for error messages.',
          boolean: true,
          default: false,
        })
        .hide('version'),
    async (argv) => {
      const { testnets, mainnets, targetContract, silent, dryRun, confirm } =
        argv

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
    'Initialize a sample Sphinx project',
    (y) =>
      y
        .usage(
          'Usage: npx sphinx init [--pnpm] [--foundryup] --org-id <org-id> --sphinx-api-key <api-key> --alchemy-api-key <alchemy-key> --owner <owner-address>'
        )
        .option('pnpm', {
          describe: `Create remappings for pnpm.`,
          boolean: true,
          default: false,
        })
        .option('foundryup', {
          describe: 'Update Foundry to the latest version.',
          boolean: true,
          default: false,
        })
        .option('org-id', {
          describe: 'Your organization ID from the Sphinx UI.',
          type: 'string',
          demandOption: true,
        })
        .option('sphinx-api-key', {
          describe: 'Your API key from the Sphinx UI.',
          type: 'string',
          demandOption: true,
        })
        .option('alchemy-api-key', {
          describe: 'Your Alchemy API key.',
          type: 'string',
          demandOption: true,
        })
        .option('owner', {
          describe: 'The address of an account you own on live networks.',
          type: 'string',
          demandOption: true,
        })
        .hide('version'),
    async (argv) => {
      const { pnpm, foundryup, orgId, sphinxApiKey, alchemyApiKey, owner } =
        argv

      init(pnpm, foundryup, orgId, sphinxApiKey, alchemyApiKey, owner)
    }
  )
  .command(
    'remappings',
    'Output remappings for the Sphinx packages.',
    (y) =>
      y
        .usage('Usage: npx sphinx remappings [--pnpm]')
        .option('pnpm', {
          describe: `Create remappings for pnpm.`,
          boolean: true,
          default: false,
        })
        .hide('version'),
    async (argv) => {
      const { pnpm } = argv

      const remappings = pnpm
        ? fetchPNPMRemappings(false)
        : fetchNPMRemappings(false)

      console.log(remappings.join('\n'))
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
