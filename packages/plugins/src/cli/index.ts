#!/usr/bin/env node

import { join } from 'path'
import { spawnSync } from 'child_process'

import * as dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ora from 'ora'
import { execAsync } from '@sphinx/core/dist/utils'
import { satisfies } from 'semver'
import { getSphinxManagerAddress } from '@sphinx/core/dist/addresses'
import { Wallet, providers } from 'ethers/lib/ethers'
import {
  getDiff,
  getDiffString,
  getParsedConfig,
  userConfirmation,
  UserConfig,
  ensureSphinxInitialized,
} from '@sphinx/core'
import 'core-js/features/array/at'

import { writeSampleProjectFiles } from '../sample-project'
import { inferSolcVersion, makeGetConfigArtifacts } from '../foundry/utils'
import { getFoundryConfigOptions } from '../foundry/options'
import { createSphinxRuntime } from '../cre'
import { writeDeploymentArtifactsUsingEvents } from '../foundry/artifacts'

// Load environment variables from .env
dotenv.config()

const configOption = 'config'
const rpcOption = 'rpc'
const projectOption = 'project'
const privateKeyOption = 'private-key'
const confirmOption = 'confirm'
const broadcastOption = 'broadcast'

const rootFfiPath =
  process.env.DEV_FILE_PATH ?? './node_modules/@sphinx/plugins/'

yargs(hideBin(process.argv))
  .scriptName('sphinx')
  .command(
    'propose',
    `Propose the latest version of a config file. Signs a proposal meta transaction and relays it to Sphinx's back-end.`,
    (y) =>
      y
        .usage(
          `Usage: npx sphinx propose --${configOption} <path> [--testnets|--mainnets] [--silent]`
        )
        .option(configOption, {
          alias: 'c',
          describe: 'Path to the Sphinx config file.',
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
        .option('silent', {
          alias: 's',
          describe: `Hide Sphinx's output.`,
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const { config } = argv
      const silent = argv.silent ?? false
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

      if (!config) {
        console.error(
          `Must specify a path to a Sphinx config file via --${configOption}.`
        )
        process.exit(1)
      }

      const proposeContractPath = join(
        rootFfiPath,
        'contracts/foundry/Propose.sol'
      )

      process.env['SPHINX_INTERNAL_CONFIG_PATH'] = config
      process.env['SPHINX_INTERNAL_SILENT'] = silent.toString()
      process.env['SPHINX_INTERNAL_IS_TESTNET'] = isTestnet.toString()

      const spinner = ora({ isSilent: silent })
      spinner.start(`Proposal in progress...`)

      try {
        // Although it's not strictly necessary to propose via a Forge script, we do it anyways
        // because it's a convenient way to ensure that the latest versions of the contracts are
        // compiled. It's also convenient because it invokes `ts-node`, which allows us to support
        // TypeScript configs. This can't be done by calling the TypeScript propose function
        // directly because calling `npx sphinx` uses Node, not TS Node.
        await execAsync(`forge script ${proposeContractPath}`)
      } catch ({ stderr }) {
        spinner.fail(`Proposal failed.`)
        // Strip \n from the end of the error message, if it exists
        const prettyError = stderr.endsWith('\n')
          ? stderr.substring(0, stderr.length - 1)
          : stderr

        console.error(prettyError)
        process.exit(1)
      }
      spinner.succeed(`Proposal succeeded!`)
    }
  )
  .command(
    'init',
    'Initialize a sample project',
    (y) =>
      y
        .usage('Usage: npx sphinx init --js|--ts [--quick-start]')
        .option('quickStart', {
          describe:
            'Initialize the project in a new repository. This writes a new foundry.toml and .env file.',
          boolean: true,
        })
        .option('js', {
          describe: 'Create a JavaScript Sphinx config file',
          boolean: true,
        })
        .option('ts', {
          describe: 'Create a TypeScript Sphinx config file',
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const quickStart = argv.quickStart ?? false
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

      const { stdout } = await execAsync('node -v')
      if (!satisfies(stdout, '>=18.16.0')) {
        console.warn(
          '\x1b[33m%s\x1b[0m', // Yellow text
          `Your Node version is less than v18.16.0. We HIGHLY recommend using v18.16.0 or later because\n` +
            `it runs our Foundry plugin significantly faster. To update your Node version, go to:\n` +
            `https://github.com/nvm-sh/nvm#intro`
        )
      }

      const isTypeScriptProject = ts ? true : false

      const spinner = ora()

      const forgeConfigOutput = await execAsync('forge config --json')
      const forgeConfig = JSON.parse(forgeConfigOutput.stdout)
      const { src, test, solc } = forgeConfig

      const solcVersion = solc ?? (await inferSolcVersion())

      writeSampleProjectFiles(
        'sphinx',
        src,
        test,
        isTypeScriptProject,
        quickStart,
        solcVersion,
        'foundry'
      )
      spinner.succeed('Initialized Sphinx project.')
    }
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

      const provider = new providers.JsonRpcProvider(rpc)

      const managerAddress = getSphinxManagerAddress(owner, project)

      await writeDeploymentArtifactsUsingEvents(
        provider,
        project,
        managerAddress,
        cachePath,
        deploymentFolder,
        spinner
      )
    }
  )
  .command(
    'deploy',
    `Deploy a Sphinx config file using Foundry. Writes deployment artifacts if broadcasting.`,
    (y) =>
      y
        .usage(
          `Usage: npx sphinx deploy --${configOption} <config_path> --${privateKeyOption} <key> [--${rpcOption} <url> --${confirmOption}]`
        )
        .option(configOption, {
          alias: 'c',
          describe: 'Path to the Sphinx config file.',
          type: 'string',
        })
        .option(privateKeyOption, {
          describe: 'Private key of the deployer.',
          type: 'string',
        })
        .option(rpcOption, {
          describe: 'RPC URL of the network to deploy on.',
          type: 'string',
        })
        .option(confirmOption, {
          describe: 'Automatically confirm the deployment.',
          boolean: true,
        })
        .option(broadcastOption, {
          describe: 'Broadcast the deployment to the network.',
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const { config, confirm } = argv
      if (!config) {
        console.error(
          `Must specify a path to a Sphinx config file via --${configOption}.`
        )
        process.exit(1)
      }

      // The deploy command allows the user to pass in an RPC url, private key, and a boolean flag
      // for broadcasting. For these three commands, there are three valid combinations. Any other
      // combination of these flags is invalid, and an error will be thrown. The valid cases are:
      // 1. Broadcasting on a network: --rpc --private-key --broadcast
      // 2. Not broadcasting on a network: --rpc --private-key (no --broadcast)
      // 3. Not broadcasting on the in-process node, which doesn't use any of these flags.

      // Throw an error if the three flags are used in an invalid way.
      if (
        (argv[rpcOption] && !argv[privateKeyOption]) ||
        (!argv[rpcOption] && argv[privateKeyOption])
      ) {
        console.error(
          `Must specify both --${rpcOption} and --${privateKeyOption} or neither.`
        )
        process.exit(1)
      }
      if (
        argv[broadcastOption] &&
        !argv[rpcOption] &&
        !argv[privateKeyOption]
      ) {
        console.error(
          `Must specify --${rpcOption} and --${privateKeyOption} when broadcasting.`
        )
        process.exit(1)
      }

      const broadcast = argv[broadcastOption] ?? false
      const privateKey = argv[privateKeyOption] ?? ''
      const rpcUrl = argv[rpcOption] ?? 'http://127.0.0.1:8545'

      const {
        artifactFolder,
        buildInfoFolder,
        compilerConfigFolder,
        cachePath,
        deploymentFolder,
      } = await getFoundryConfigOptions()

      const spinner = ora()

      const userConfigScriptPath = join(
        rootFfiPath,
        'dist',
        'foundry',
        'display-user-config.js'
      )

      const silent = false
      // Confirm with the user that they want to deploy the config. We skip this step if the user
      // has already confirmed or if they're deploying to the in-process Anvil node, which is
      // necessary because we can't access the in-process Anvil node from outside of Solidity.
      if (argv[rpcOption] && !confirm) {
        spinner.start('Getting project info...')

        const provider = new providers.JsonRpcProvider(rpcUrl)
        const owner = new Wallet(privateKey, provider)

        await ensureSphinxInitialized(provider, owner)

        // Get the user config by invoking a script with TS node. This is necessary to support
        // TypeScript configs because the current context is invoked with Node, not TS Node.
        let userConfig: UserConfig
        try {
          // Using --swc speeds up the execution of the script.
          const { stdout } = await execAsync(
            `npx ts-node --swc ${userConfigScriptPath} ${config}`
          )
          userConfig = JSON.parse(stdout)
        } catch ({ stderr }) {
          spinner.stop()
          console.error(stderr)
          process.exit(1)
        }

        const cre = createSphinxRuntime(
          'foundry',
          false,
          confirm,
          compilerConfigFolder,
          undefined,
          silent,
          process.stderr
        )

        const { parsedConfig, configCache, configArtifacts } =
          await getParsedConfig(
            userConfig,
            provider,
            cre,
            makeGetConfigArtifacts(artifactFolder, buildInfoFolder, cachePath),
            owner.address
          )

        const diff = getDiff(
          parsedConfig.contracts,
          configCache,
          configArtifacts
        )
        const diffString = getDiffString({ [configCache.networkName]: diff })

        spinner.stop()
        await userConfirmation(diffString)
      }

      process.env['SPHINX_INTERNAL_CONFIG_PATH'] = config
      process.env['SPHINX_INTERNAL_RPC_URL'] = rpcUrl
      process.env['SPHINX_INTERNAL_BROADCAST'] = broadcast.toString()
      process.env['SPHINX_INTERNAL_PRIVATE_KEY'] = privateKey

      const deployContractPath = join(
        rootFfiPath,
        'contracts',
        'foundry',
        'Deploy.sol'
      )

      const forgeScriptArgs = ['script', deployContractPath]
      if (argv[rpcOption]) {
        forgeScriptArgs.push('--rpc-url', rpcUrl)
      }
      if (broadcast) {
        forgeScriptArgs.push('--broadcast')
      }

      // Run the deployment script.
      try {
        // We use `spawnSync` instead of `execAsync` because we want to display the output of the
        // command to the user in real time, particularly the Foundry compilation process.
        spawnSync(`forge`, forgeScriptArgs, { stdio: 'inherit' })
      } catch ({ stderr }) {
        // Strip \n from the end of the error message, if it exists
        const prettyError = stderr.endsWith('\n')
          ? stderr.substring(0, stderr.length - 1)
          : stderr

        console.error(prettyError)
        process.exit(1)
      }

      if (broadcast) {
        spinner.start(`Writing deployment artifacts...`)
        const provider = new providers.JsonRpcProvider(rpcUrl)
        const owner = new Wallet(privateKey, provider)

        // Get the user config. Note that we use --swc because it speeds up the execution of the
        // script.
        const { stdout } = await execAsync(
          `npx ts-node --swc ${userConfigScriptPath} ${config}`
        )
        const userConfig: UserConfig = JSON.parse(stdout)

        await writeDeploymentArtifactsUsingEvents(
          provider,
          userConfig.projectName,
          owner.address,
          cachePath,
          deploymentFolder,
          spinner
        )
      }
    }
  )
  // Display the help menu when `npx sphinx` is called without any arguments.
  .showHelpOnFail(process.argv.length === 2 ? true : false)
  .demandCommand(
    1,
    'To get help for a specific task run: npx sphinx [task] --help'
  )
  .parse()
