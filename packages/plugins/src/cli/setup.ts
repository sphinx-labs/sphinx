import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { init } from '../sample-project'
import {
  fetchNPMRemappings,
  fetchPNPMRemappings,
} from '../sample-project/sample-foundry-config'
import { SphinxContext, makeSphinxContext } from './context'
import {
  ArtifactsCommandArgs,
  DeployCommandArgs,
  ProposeCommandArgs,
} from './types'
import { ConfirmAndDryRunError, coerceNetworks } from './utils'

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
      'deploy <scriptPath>',
      `Executes a deployment on a network. Displays a preview before the deployment, and writes artifacts after.`,
      (y) =>
        y
          .usage(
            `Usage: sphinx deploy <SCRIPT_PATH> --network <network_name> [OPTIONS]`
          )
          .positional('scriptPath', {
            describe: 'Path to the Forge script file.',
            type: 'string',
            demandOption: true,
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
  const { networks, scriptPath, targetContract, silent, dryRun, confirm } = argv

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

  const isTestnet = networks === 'testnets'
  await sphinxContext.propose({
    confirm,
    isTestnet,
    isDryRun: dryRun,
    silent,
    scriptPath,
    sphinxContext,
    targetContract,
  })
}

const deployCommandHandler = async (
  argv: DeployCommandArgs,
  sphinxContext: SphinxContext
): Promise<void> => {
  const { network, scriptPath, targetContract, verify, silent, confirm } = argv

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
