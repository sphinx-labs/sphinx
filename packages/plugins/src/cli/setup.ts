import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ora from 'ora'
import { getDuplicateElements, syncSphinxLock } from '@sphinx-labs/core'

import { init } from '../sample-project'
import { SphinxContext, makeSphinxContext } from './context'
import {
  ArtifactsCommandArgs,
  DeployCommandArgs,
  ProposeCommandArgs,
} from './types'
import {
  BothNetworksSpecifiedError,
  ConfirmAndDryRunError,
  NoNetworkArgsError,
  getDuplicatedNetworkErrorMessage,
} from './utils'
import { handleInstall } from './install'

const networkOption = 'network'
const confirmOption = 'confirm'
const dryRunOption = 'dry-run'
const targetContractOption = 'target-contract'
const verifyOption = 'verify'

export const makeCLI = (
  args: Array<string> = hideBin(process.argv),
  sphinxContext: SphinxContext = makeSphinxContext()
): void => {
  yargs(args)
    .scriptName('sphinx')
    .command(
      'propose <scriptPath>',
      `Propose a deployment by submitting it to Sphinx's backend.`,
      (y) =>
        y
          .usage(
            `Usage: sphinx propose <SCRIPT_PATH> --networks <NETWORK_NAMES...|testnets|mainnets> [options]`
          )
          .positional('scriptPath', {
            describe: 'Path to the Forge script file.',
            type: 'string',
            demandOption: true,
          })
          .option('networks', {
            describe: 'The networks to propose on.',
            type: 'array',
            coerce: (networks: Array<string | number>) => networks.map(String),
            demandOption: true,
          })
          .option('sig', {
            describe:
              'The signature of the function to call in the script, or raw calldata',
            array: true,
            // Set all array elements to be strings. Necessary to avoid precision loss for large
            // numbers, which will otherwise occur because Yargs' default behavior is to convert CLI
            // arguments to numbers when possible.
            string: true,
            alias: 's',
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
          .check((argv) => {
            const { networks } = argv

            if (networks.length === 0) {
              throw new Error(NoNetworkArgsError)
            }

            if (
              networks.includes('testnets') &&
              networks.includes('mainnets')
            ) {
              throw new Error(BothNetworksSpecifiedError)
            }

            const duplicatedNetworks = getDuplicateElements(networks)
            if (duplicatedNetworks.length > 0) {
              throw new Error(
                getDuplicatedNetworkErrorMessage(duplicatedNetworks)
              )
            }

            if (
              networks.length > 1 &&
              (networks.includes('testnets') || networks.includes('mainnets'))
            ) {
              throw new Error(
                `If you specify 'mainnets' or testnets', you cannot specify any other networks.`
              )
            }

            return true
          })
          .hide('version'),
      async (argv) => proposeCommandHandler(argv, sphinxContext)
    )
    .command(
      'artifacts',
      `Retrieves deployment artifacts from the DevOps Platform and writes them to the file system.`,
      (y) =>
        y
          .usage(
            `Usage: sphinx artifacts --org-id <ORG_ID> --project-name <PROJECT_NAME> [options]`
          )
          .option('org-id', {
            describe: 'Your Sphinx organization ID.',
            type: 'string',
            demandOption: true,
          })
          .option('project-name', {
            describe: 'The name of your project.',
            type: 'string',
            demandOption: true,
          })
          .option('silent', {
            describe: 'Silence the output except for error messages.',
            boolean: true,
            default: false,
          })
          .hide('version'),
      async (argv) => artifactsCommandHandler(argv, sphinxContext)
    )
    .command(
      'init',
      'Initialize a sample Sphinx project',
      (y) =>
        y
          .usage(
            'Usage: sphinx init [--pnpm] --org-id <org-id> --sphinx-api-key <api-key> --alchemy-api-key <alchemy-key> --owner <owner-address>'
          )
          .option('pnpm', {
            describe: `Create remappings for pnpm.`,
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
          .option('project', {
            describe: 'Your project name from the Sphinx UI.',
            type: 'string',
            demandOption: true,
          })
          .hide('version'),
      async (argv) => {
        const { orgId, sphinxApiKey, alchemyApiKey, project } = argv

        await init(orgId, sphinxApiKey, alchemyApiKey, project)
      }
    )
    .command(
      'install',
      'Installs the required version of the Sphinx Solidity library contracts and Sphinx Foundry fork',
      (y) => y.usage('Usage: sphinx install'),
      async (argv) => {
        const { ci } = argv

        if (ci) {
          console.warn(
            'The `--ci` flag is no longer necessary and has been deprecated.'
          )
        }

        const spinner = ora()
        await handleInstall(spinner)
      }
    )
    .command(
      'sync',
      'Regenerates the sphinx.lock file',
      (y) =>
        y.usage('Usage: sphinx sync').option('org-id', {
          describe: 'Your organization ID from the Sphinx UI.',
          type: 'string',
          demandOption: false,
        }),
      async (argv) => {
        const { orgId } = argv
        const apiKey = process.env.SPHINX_API_KEY
        if (!apiKey) {
          console.error(
            "You must specify a 'SPHINX_API_KEY' environment variable."
          )
          process.exit(1)
        }

        const spinner = ora()
        spinner.start('Syncing sphinx.lock...')
        await syncSphinxLock(orgId, apiKey)
        spinner.succeed('Sync complete')
      }
    )
    .command(
      'deploy <scriptPath>',
      `Executes a deployment on a network. Displays a preview before the deployment, and writes artifacts after.`,
      (y) =>
        y
          .usage(
            `Usage: sphinx deploy <SCRIPT_PATH> --network <NETWORK_NAME> [options]`
          )
          .positional('scriptPath', {
            describe: 'Path to the Forge script file.',
            type: 'string',
            demandOption: true,
          })
          .option('sig', {
            describe:
              'The signature of the function to call in the script, or raw calldata',
            array: true,
            // Set all array elements to be strings. Necessary to avoid precision loss for large
            // numbers, which will otherwise occur because Yargs' default behavior is to convert CLI
            // arguments to numbers when possible.
            string: true,
            alias: 's',
          })
          .option(networkOption, {
            describe: 'Name of the network to deploy on.',
            type: 'string',
            demandOption: true,
          })
          .option(confirmOption, {
            describe: 'Confirm the deployment without displaying a preview.',
            boolean: true,
            default: false,
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
            default: false,
          })
          .option('silent', {
            describe:
              'Silence the output except for error messages. You must also confirm the deployment via the --confirm flag if you specify this option.',
            boolean: true,
            default: false,
          })
          .hide('version'),
      async (argv) => deployCommandHandler(argv, sphinxContext)
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
}

const proposeCommandHandler = async (
  argv: ProposeCommandArgs,
  sphinxContext: SphinxContext
): Promise<void> => {
  const { networks, scriptPath, targetContract, silent, dryRun, confirm, sig } =
    argv

  if (dryRun && confirm) {
    // Throw an error because these flags are redundant, which signals user error or a
    // misunderstanding of the commands.
    console.error(ConfirmAndDryRunError)
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

  await sphinxContext.propose({
    confirm,
    networks,
    isDryRun: dryRun,
    silent,
    scriptPath,
    sphinxContext,
    targetContract,
    sig,
  })
}

const deployCommandHandler = async (
  argv: DeployCommandArgs,
  sphinxContext: SphinxContext
): Promise<void> => {
  const { network, scriptPath, targetContract, verify, silent, confirm, sig } =
    argv

  if (silent && !confirm) {
    // Since the '--silent' option silences the preview, the user must confirm the deployment
    // via the CLI flag.
    console.error(
      `If you specify '--silent', you must also specify '--${confirmOption}' to confirm the deployment.`
    )
    process.exit(1)
  }

  await sphinxContext.deploy({
    scriptPath,
    network,
    skipPreview: confirm,
    silent,
    sphinxContext,
    verify,
    targetContract,
    sig,
  })
}

const artifactsCommandHandler = async (
  argv: ArtifactsCommandArgs,
  sphinxContext: SphinxContext
): Promise<void> => {
  const { orgId, projectName, silent } = argv

  const apiKey = process.env.SPHINX_API_KEY
  if (!apiKey) {
    console.error("You must specify a 'SPHINX_API_KEY' environment variable.")
    process.exit(1)
  }

  sphinxContext.fetchRemoteArtifacts({ apiKey, orgId, projectName, silent })
}
