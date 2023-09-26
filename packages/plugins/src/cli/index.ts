#!/usr/bin/env node

import { join, resolve } from 'path'
import { exec, spawnSync } from 'child_process'
import { readFileSync } from 'fs'

import { blue } from 'chalk'
import * as dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ora from 'ora'
import {
  execAsync,
  hyperlink,
  isSupportedNetworkName,
  makeParsedConfig,
} from '@sphinx-labs/core/dist/utils'
import { SphinxJsonRpcProvider } from '@sphinx-labs/core/dist/provider'
import { satisfies } from 'semver'
import { getSphinxManagerAddress } from '@sphinx-labs/core/dist/addresses'
import {
  Contract,
  Wallet,
  keccak256,
  parseEther,
  toBeHex,
  toUtf8Bytes,
} from 'ethers'
import {
  getDiff,
  getDiffString,
  userConfirmation,
  ensureSphinxInitialized,
  UserConfig,
  UserConfigWithOptions,
  RawSphinxAction,
  DeployContractTODO,
  FunctionCallTODO,
  SphinxConfig,
  SemverVersion,
  ParsedConfig,
  SphinxActionType,
  ChainInfo,
} from '@sphinx-labs/core'
import 'core-js/features/array/at'

import { writeSampleProjectFiles } from '../sample-project'
import {
  inferSolcVersion,
  makeGetConfigArtifacts,
  makeGetProviderFromChainId,
} from '../foundry/utils'
import { getFoundryConfigOptions } from '../foundry/options'
import { createSphinxRuntime } from '../cre'
// import { writeDeploymentArtifactsUsingEvents } from '../foundry/artifacts'
import { generateClient } from './typegen/client'
import { decodeChainInfo } from '../foundry/structs'

// Load environment variables from .env
dotenv.config()

const configOption = 'config'
const rpcOption = 'rpc'
const projectOption = 'project'
const privateKeyOption = 'private-key'
const networkOption = 'network'
const skipPreviewOption = 'skip-preview'

// TODO(refactor): "SemverVersion" is redundant

const pluginRootPath =
  process.env.DEV_FILE_PATH ?? './node_modules/@sphinx-labs/plugins/'

// TODO(docs): address(uint160(uint256(keccak256('sphinx.actions')) - 1))
const SPHINX_ACTIONS_ADDRESS = '0x56ab627a05e305e206291ee8d40621af4fc22f15'

// Gets a random integer between min and max, inclusive.
// TODO: mv
const getRandomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min
const getAvailablePort = async () => {
  let attempts: number = 0
  while (attempts < 100) {
    const port = getRandomInt(42000, 42999)
    try {
      await execAsync(`anvil --port ${port}`)
      const { stdout: pid } = await execAsync(`lsof -t -i:${port}`)
      await execAsync(`kill $(lsof -t -i:${pid})`)
      return port
    } catch {
      attempts += 1
    }
  }
  throw new Error('Could not find available port')
}

yargs(hideBin(process.argv))
  .scriptName('sphinx')
  .command(
    'propose',
    `Propose the latest version of a config file. Signs a proposal meta transaction and relays it to Sphinx's back-end.`,
    (y) =>
      y
        .usage(
          `Usage: npx sphinx propose --${configOption} <path> [--testnets|--mainnets] [--confirm] [--dry-run]`
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
        .option('confirm', {
          describe:
            'Automatically confirm the proposal. Only use this in a CI process.',
          boolean: true,
        })
        .option('dryRun', {
          describe: `Simulate the proposal without sending it to Sphinx's back-end.`,
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      const { config, testnets, mainnets } = argv
      const confirm = !!argv.confirm
      const dryRun = !!argv.dryRun

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
          `Cannot specify both --dry-run and --confirm. Please choose one.`
        )
        process.exit(1)
      }

      if (!config) {
        console.error(
          `Must specify a path to a Sphinx config file via --${configOption}.`
        )
        process.exit(1)
      }

      // TODO(propose): validation:
      // // TODO(docs): this check is specific to proposals because these arrays aren't used in the standard deploy task,
      // // which occurs on one network at a time.
      // if (mainnets.length === 0 && testnets.length === 0) {
      //   logValidationError(
      //     'error',
      //     `There must be at least one network or testnet in your Sphinx config.`,
      //     [],
      //     cre.silent,
      //     cre.stream
      //   )
      // }
      // if (proposers.length === 0) {
      //   logValidationError(
      //     'error',
      //     `There must be at least one proposer or manager.`,
      //     [],
      //     cre.silent,
      //     cre.stream
      //   )
      // }
      // if (orgId === '') {
      //   logValidationError(
      //     'error',
      //     `The 'orgId' cannot be an empty string.`,
      //     [],
      //     cre.silent,
      //     cre.stream
      //   )
      // }
      // if (
      //   firstProposalOccurred &&
      //   !prevConfig.options.proposers.includes(signerAddress)
      // ) {
      //   throw new Error(
      //     `Signer is not currently a proposer on chain ${chainId}. Signer's address: ${signerAddress}\n` +
      //       `Current proposers: ${prevConfig.options.proposers.map(
      //         (proposer) => `\n- ${proposer}`
      //       )}`
      //   )
      // }

      // First, we compile the contracts to make sure we're using the latest versions. This command
      // displays the compilation process to the user in real time.
      const { status } = spawnSync(`forge`, ['build'], { stdio: 'inherit' })
      // Exit the process if compilation fails.
      if (status !== 0) {
        process.exit(1)
      }

      const spinner = ora()
      spinner.start(`Getting project info...`)

      const {
        artifactFolder,
        buildInfoFolder,
        cachePath,
        compilerConfigFolder,
        rpcEndpoints,
      } = await getFoundryConfigOptions()

      const cre = createSphinxRuntime(
        'hardhat',
        true,
        false,
        confirm,
        compilerConfigFolder,
        undefined,
        false,
        process.stderr
      )

      // Get the user config by invoking a script with TS node. This is necessary to support
      // TypeScript configs because the current context is invoked with Node, not TS Node.
      const userConfigScriptPath = join(
        pluginRootPath,
        'dist',
        'foundry',
        'display-user-config.js'
      )
      let userConfig: UserConfigWithOptions
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

      // TODO(propose)
      // await proposeAbstractTask(
      //   userConfig,
      //   isTestnet,
      //   cre,
      //   dryRun,
      //   makeGetConfigArtifacts(artifactFolder, buildInfoFolder, cachePath),
      //   await makeGetProviderFromChainId(rpcEndpoints),
      //   spinner
      // )
    }
  )
  .command(
    'init',
    'Initialize a sample project',
    (y) =>
      y
        .usage('Usage: npx sphinx init --js|--ts [--quickstart]')
        .option('quickstart', {
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
      const quickstart = argv.quickstart ?? false
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
          `Usage: npx sphinx deploy <script_path> [--${networkOption} <network_name> --${skipPreviewOption}]`
        )
        .positional('scriptPath', {
          describe: 'Path to the Forge script file.',
          type: 'string',
        })
        .option(networkOption, {
          describe: 'Name of the network to deploy on.',
          type: 'string',
        })
        .option(skipPreviewOption, {
          describe: 'Skip displaying the deployment preview.',
          boolean: true,
        })
        .hide('version'),
    async (argv) => {
      // TODO(case): two contracts in the script file. you'd need to replicate forge's --tc.

      const { network } = argv
      const skipPreview = argv[skipPreviewOption] ?? false

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

      // const network: string = argv.network ?? 'anvil'
      // if (!isSupportedNetworkName(network)) {
      //   console.error(
      //     `The network ${network} is not supported. See ${blue(
      //       hyperlink(
      //         'here',
      //         'https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md#options'
      //       )
      //     )} for a list of supported networks.`
      //   )
      //   process.exit(1)
      // }

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
        compilerConfigFolder,
        cachePath,
        rpcEndpoints,
      } = await getFoundryConfigOptions()

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

      // TODO: make sure we're running the simulation on live networks even if the user skips the diff

      const chainInfoPath = join(cachePath, 'sphinx-chain-info.txt')

      // TODO(case): there's an error in the script. we should bubble it up.
      // TODO: this is the simulation. you should do this in every case.
      process.env['SPHINX_INTERNAL__PREVIEW_ENABLED'] = 'true'
      process.env['SPHINX_INTERNAL__CHAIN_INFO_PATH'] = chainInfoPath
      try {
        spinner.start(`Generating preview...`)
        await execAsync(`forge script ${scriptPath} --rpc-url ${forkUrl}`)
      } catch (e) {
        spinner.stop()
        // The `stdout` contains the trace of the error.
        console.log(e.stdout)
        // The `stderr` contains the error message.
        console.log(e.stderr)
        process.exit(1)
      }
      delete process.env['SPHINX_INTERNAL__PREVIEW_ENABLED']
      delete process.env['SPHINX_INTERNAL__CHAIN_INFO_PATH']

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

      // TODO(docs): we retrieve these actions from the Sphinx contract because
      // it has a consistent address, unlike the user's script, which may change if the
      // user has set a `FOUNDRY_SENDER` env var.

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

      if (!skipPreview) {
        const diff = getDiff([parsedConfig])
        const diffString = getDiffString(diff)

        spinner.stop()
        await userConfirmation(diffString)
      }

      const { status } = spawnSync(
        `forge`,
        ['script', scriptPath, '--fork-url', forkUrl, '--broadcast'],
        { stdio: 'inherit' }
      )
      if (status !== 0) {
        process.exit(1)
      }

      // TODO: currently, we don't check if the user has `vm.startBroadcast` in their script. if they don't,
      // and we also don't have an existing 'sphinx-chain-info.txt' file, then i believe this will fail.

      const containsContractDeployment = parsedConfig.actionsTODO.some(
        (e) => !e.skip && e.actionType === SphinxActionType.DEPLOY_CONTRACT
      )

      if (containsContractDeployment) {
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
