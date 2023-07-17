#!/usr/bin/env node
import { join } from 'path'

import * as dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ora from 'ora'
import { execAsync } from '@chugsplash/core/dist/utils'

import { writeSampleProjectFiles } from '../sample-project'
import { inferSolcVersion } from '../foundry/utils'

// Load environment variables from .env
dotenv.config()

const configPathOption = 'config-path'
const projectOption = 'project'

yargs(hideBin(process.argv))
  .scriptName('chugsplash')
  .command(
    'propose',
    `Propose the latest version of a config file. Signs a proposal meta transaction and relays it to ChugSplash's back-end.`,
    (y) =>
      y
        .usage(
          `Usage: npx chugsplash propose --${configPathOption} <path> --${projectOption} <projectName> [--silent]`
        )
        .option(configPathOption, {
          alias: 'c',
          describe: 'Path to the ChugSplash config file.',
          type: 'string',
        })
        .option('project', {
          alias: 'p',
          describe: 'The name of the project to propose.',
          type: 'string',
        })
        .option('testnets', {
          describe:
            'Propose on the testnets specified in the ChugSplash config',
          boolean: true,
        })
        .option('mainnets', {
          describe: `Propose on the mainnets specified in the ChugSplash config`,
          boolean: true,
        })
        .option('dryRun', {
          describe:
            'Dry run the proposal without signing or relaying it to the back-end.',
          boolean: true,
        })
        .option('silent', {
          alias: 's',
          describe: `Hide ChugSplash's output.`,
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const { configPath, project } = argv
      const silent = argv.silent ?? false
      const dryRun = argv.dryRun ?? false
      const testnets = argv.testnets ?? false
      const mainnets = argv.mainnets ?? false

      let isTestnet: boolean
      if (testnets && mainnets) {
        throw new Error('Cannot specify both --testnets and --mainnets')
      } else if (testnets) {
        isTestnet = true
      } else if (mainnets) {
        isTestnet = false
      } else {
        throw new Error('Must specify either --testnets or --mainnets')
      }

      if (!configPath) {
        console.error(
          `Must specify a path to a ChugSplash config file via --${configPathOption}.`
        )
        process.exit(1)
      }
      if (!project) {
        console.error(`Must specify a project name via --${projectOption}.`)
        process.exit(1)
      }

      const rootFfiPath =
        process.env.DEV_FILE_PATH ?? './node_modules/@chugsplash/plugins/'
      const proposeContractPath = join(
        rootFfiPath,
        'contracts/foundry/Propose.sol'
      )

      process.env['CHUGSPLASH_INTERNAL_PROJECT_NAME'] = project
      process.env['CHUGSPLASH_INTERNAL_CONFIG_PATH'] = configPath
      process.env['CHUGSPLASH_INTERNAL_DRY_RUN'] = dryRun.toString()
      process.env['CHUGSPLASH_INTERNAL_SILENT'] = silent.toString()
      process.env['CHUGSPLASH_INTERNAL_IS_TESTNET'] = isTestnet.toString()

      const spinner = ora({ isSilent: silent })
      const dryRunOrProposal = dryRun ? 'Dry run' : 'Proposal'
      spinner.start(`${dryRunOrProposal} in progress...`)

      try {
        // Although it's not strictly necessary to propose via a Forge script, we do it anyways
        // because it's a convenient way to ensure that the latest versions of the contracts are
        // compiled. It's also convenient because it invokes `ts-node`, which allows us to support
        // TypeScript configs. This can't be done by calling the TypeScript propose function
        // directly because calling `npx chugsplash` uses Node, not TS Node.
        await execAsync(`forge script ${proposeContractPath}`)
      } catch ({ stderr }) {
        spinner.fail(`${dryRunOrProposal} failed.`)
        // Strip \n from the end of the error message, if it exists
        const prettyError = stderr.endsWith('\n')
          ? stderr.substring(0, stderr.length - 1)
          : stderr

        console.error(prettyError)
        process.exit(1)
      }
      spinner.succeed(`${dryRunOrProposal} succeeded!`)
    }
  )
  .command(
    'init',
    'Initialize a sample project',
    (y) =>
      y
        .usage('Usage: npx chugsplash init --js|--ts')
        .option('js', {
          describe: 'Create a JavaScript ChugSplash config file',
          boolean: true,
        })
        .option('ts', {
          describe: 'Create a TypeScript ChugSplash config file',
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const { ts, js } = argv
      if (ts && js) {
        console.error('Cannot specify both --ts and --js. Please choose one.')
        process.exit(1)
      } else if (!ts && !js) {
        console.error(
          'Must specify either --ts (TypeScript) or --js (JavaScript).'
        )
        process.exit(1)
      }

      const isTypeScriptProject = ts ? true : false

      const spinner = ora()

      const forgeConfigOutput = await execAsync('forge config --json')
      const forgeConfig = JSON.parse(forgeConfigOutput.stdout)
      const { src, test, script, solc } = forgeConfig

      const solcVersion = solc ?? (await inferSolcVersion())

      writeSampleProjectFiles(
        'chugsplash',
        src,
        test,
        isTypeScriptProject,
        solcVersion,
        'foundry',
        script
      )
      spinner.succeed('Initialized ChugSplash project.')
    }
  )
  .showHelpOnFail(true)
  .demandCommand(
    1,
    'To get help for a specific task run: npx chugsplash [task] --help'
  )
  .parse()
