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
import { makeSphinxContext } from './context'

// Load environment variables from .env
dotenv.config()

const networkOption = 'network'
const confirmOption = 'confirm'
const dryRunOption = 'dry-run'
const targetContractOption = 'target-contract'
const verifyOption = 'verify'

const coerceNetworks = (
  arg: string | Array<string>
): 'testnets' | 'mainnets' => {
  // Check if `arg` is an array and has both 'mainnets' and 'testnets'.
  if (
    Array.isArray(arg) &&
    arg.length === 2 &&
    arg.includes('testnets') &&
    arg.includes('mainnets')
  ) {
    throw new Error(
      `You must specify either 'testnets' or 'mainnets', but not both.`
    )
  }

  // Check if `arg` is a single string and is either 'mainnets' or 'testnets'.
  if (typeof arg === 'string' && (arg === 'testnets' || arg === 'mainnets')) {
    return arg
  }

  // If none of the above conditions are met, throw a general error.
  throw new Error(
    `Invalid values:\n  Argument: networks, Given: "${arg}", Choices: "testnets", "mainnets"`
  )
}

yargs(hideBin(process.argv))
  .scriptName('sphinx')
  .command(
    'propose <scriptPath>',
    `Propose a deployment by submitting it to Sphinx's backend.`,
    (y) =>
      y
        .usage(
          `Usage: sphinx propose <SCRIPT_PATH> --networks <testnets|mainnets> [options]`
        )
        .positional('scriptPath', {
          describe: 'Path to the Forge script file.',
          type: 'string',
          demandOption: true,
        })
        .option('networks', {
          describe: 'The networks to propose on.',
          type: 'string',
          choices: ['testnets', 'mainnets'],
          coerce: coerceNetworks,
          demandOption: true,
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
      const { networks, scriptPath, targetContract, silent, dryRun, confirm } =
        argv

      if (silent && !confirm) {
        // Since the '--silent' option silences the preview, the user must confirm the proposal
        // via the CLI flag.
        console.error(
          `If you specify '--silent', you must also specify '--${confirmOption}' to confirm the proposal.`
        )
        process.exit(1)
      }

      const isTestnet = networks === 'testnets'
      await propose(
        confirm,
        isTestnet,
        dryRun,
        silent,
        scriptPath,
        makeSphinxContext(),
        targetContract
      )
    }
  )
  // .command(
  //   'artifacts',
  //   `Retrieves deployment artifacts from the DevOps Platform and writes them to the file system.`,
  //   (y) =>
  //     y
  //       .usage(
  //         `Usage: sphinx artifacts --org-id <ORG_ID> --project-name <PROJECT_NAME>`
  //       )
  //       .option('org-id', {
  //         describe: 'Your Sphinx organization ID.',
  //         type: 'string',
  //         demandOption: true,
  //       })
  //       .option('project-name', {
  //         describe: 'The name of your project.',
  //         type: 'string',
  //         demandOption: true,
  //       })
  //       .hide('version')
  //       .demandCommand(1, 'You must provide a Forge script path.'),
  //   async (argv) => {
  //     const { orgId, projectName } = argv

  //     const apiKey = process.env.SPHINX_API_KEY
  //     if (!apiKey) {
  //       console.error(
  //         "You must specify a 'SPHINX_API_KEY' environment variable."
  //       )
  //       process.exit(1)
  //     }

  //     const spinner = ora()
  //     spinner.start(`Fetching artifacts...`)

  //     const deploymentArtifacts = await fetchDeploymentArtifacts(
  //       apiKey,
  //       orgId,
  //       projectName
  //     )

  //     spinner.succeed(`Fetched artifacts.`)
  //     spinner.start(`Writing artifacts...`)

  //     writeDeploymentArtifacts(
  //       projectName,
  //       ExecutionMode.Platform,
  //       deploymentArtifacts
  //     )

  //     spinner.succeed(`Write artifacts.`)
  //   }
  // )
  .command(
    'init',
    'Initialize a sample Sphinx project',
    (y) =>
      y
        .usage(
          'Usage: sphinx init [--pnpm] [--foundryup] --org-id <org-id> --sphinx-api-key <api-key> --alchemy-api-key <alchemy-key> --owner <owner-address>'
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
          describe: 'Your Alchemy API Key.',
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
        .usage('Usage: sphinx remappings [--pnpm]')
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
    `Executes a deployment on a network. Displays a preview before the deployment, and writes artifacts after.`,
    (y) =>
      y
        .usage(
          `Usage: sphinx deploy <script_path> --network <network_name> [OPTIONS]`
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

      await deploy(
        scriptPath,
        network,
        confirm,
        silent,
        makeSphinxContext(),
        targetContract,
        verify
      )
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
