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
  makeParsedConfig,
  spawnAsync,
} from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import {
  getPreview,
  getPreviewString,
  userConfirmation,
  SphinxActionType,
  getEtherscanEndpointForNetwork,
  SUPPORTED_NETWORKS,
  ConfigArtifacts,
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
import { deploy } from './deploy'

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

      await deploy(confirm, scriptPath, network, targetContract, verify)
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
