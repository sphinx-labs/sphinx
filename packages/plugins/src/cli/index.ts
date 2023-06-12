#!/usr/bin/env node
import { resolve } from 'path'

import * as dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ora from 'ora'
import { execAsync } from '@chugsplash/core/dist/utils'

import { writeSampleProjectFiles } from '../sample-project'
import { inferSolcVersion } from '../foundry/utils'

// Load environment variables from .env
dotenv.config()

yargs(hideBin(process.argv))
  .scriptName('chugsplash')
  .usage('Usage: npx <cmd> [args]')
  .command(
    'propose',
    'Propose a deployment',
    (y) =>
      y
        .usage(
          'Usage: npx chugsplash propose --config-path <path> --rpc-url <url> [--silent]'
        )
        .option('config-path', {
          alias: 'c',
          describe: 'Path to the ChugSplash config file to propose',
          type: 'string',
        })
        .option('rpc-url', {
          alias: 'r',
          describe: 'RPC URL for the network to propose on',
          type: 'string',
        })
        .option('silent', {
          describe: `Hide ChugSplash's output`,
          boolean: true,
          alias: 's',
        })
        .hide('version'),
    async (argv) => {
      const { configPath, rpcUrl } = argv
      const silent = argv.silent ?? false
      if (!configPath) {
        console.error('Must specify a path to a ChugSplash config file.')
        process.exit(1)
      }
      if (!rpcUrl) {
        console.error('Must specify an RPC URL.')
        process.exit(1)
      }

      const privateKey = process.env.PRIVATE_KEY
      if (!privateKey) {
        console.error(`Must specify a "PRIVATE_KEY" in your .env file.`)
        process.exit(1)
      }

      process.env['CHUGSPLASH_INTERNAL_RPC_URL'] = rpcUrl
      process.env['CHUGSPLASH_INTERNAL_CONFIG_PATH'] = configPath
      process.env['CHUGSPLASH_INTERNAL_SILENT'] = silent.toString()

      const spinner = ora()
      spinner.start('Proposing...')
      try {
        // Although it's not strictly necessary to propose via a Forge script, we do it anyways
        // because it's a convenient way to ensure that the latest versions of the contracts are
        // compiled. It's also convenient because it invokes `ts-node`, which allows us to support
        // TypeScript configs. This can't be done by calling the TypeScript propose function
        // directly because calling `npx chugsplash` uses Node, not `ts-node`.
        await execAsync(`forge script src/cli/Propose.s.sol`)
      } catch ({ stderr }) {
        spinner.fail('Proposal failed.')
        // Strip \n from the end of the error message, if it exists
        const prettyError = stderr.endsWith('\n')
          ? stderr.substring(0, stderr.length - 1)
          : stderr

        console.error(prettyError)
        process.exit(1)
      }
      spinner.succeed('Successfully proposed!')
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
        resolve('chugsplash'),
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
