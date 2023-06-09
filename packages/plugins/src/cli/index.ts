#!/usr/bin/env node
import { execSync } from 'child_process'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ora from 'ora'

import { writeSampleProjectFiles } from '../sample-project'

yargs(hideBin(process.argv))
  .option('config-path', {
    alias: 'c',
    describe: 'Path to config file',
    type: 'string',
  })
  .option('network', {
    alias: 'n',
    describe:
      'Network to deploy to, must be an alias in your foundry.toml file',
    type: 'string',
  })
  .command(
    'propose',
    'Propose a new deployment',
    (y) => y.demandOption('config-path', true).demandOption('network', true),
    async (argv) => {
      const configPath = argv.configPath
      const network = argv.network
      console.log(configPath)
      console.log(network)
      process.env['CHUGSPLASH_INTERNAL_NETWORK'] = network
      process.env['CHUGSPLASH_INTERNAL_CONFIG_PATH'] = configPath
      await execSync('forge script src/cli/Propose.s.sol', {
        stdio: 'inherit',
      })
    }
  )
  .command('init', 'Initialize a new project', async () => {
    const spinner = ora()

    await writeSampleProjectFiles(
      './chugsplash',
      './src',
      './test',
      './script',
      false,
      '0.8.17',
      'foundry'
    )
    spinner.succeed('Initialized ChugSplash project.')
  })
  .demandCommand(1, 'You need at least one command')
  .parse()
