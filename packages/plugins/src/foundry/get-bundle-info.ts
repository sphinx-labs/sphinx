import path, { resolve } from 'path'
import fs from 'fs'

import { postParsingValidation } from '@sphinx-labs/core/dist/config/parse'
import { FailureAction } from '@sphinx-labs/core/dist/types'
import { getProjectBundleInfo } from '@sphinx-labs/core/dist/tasks'
import {
  writeCompilerConfig,
  remove0x,
  ParsedConfig,
  SphinxActionTODO,
  SupportedChainId,
  isSupportedChainId,
  makeAuthBundle,
  getAuthLeafsForChain,
} from '@sphinx-labs/core/dist'
import { AbiCoder, concat } from 'ethers'

import { createSphinxRuntime } from '../cre'
import { getFoundryConfigOptions } from './options'
import { decodeActions, decodeCachedConfig } from './structs'
import { makeGetConfigArtifacts } from './utils'
import {
  getEncodedFailure,
  getPrettyWarnings,
  validationStderrWrite,
} from './logs'

// TODO: see what happens if the user does `vm.createSelectFork(); deploy(...);` in their script
// when we're attempting to call their script with an `--rpc-url` flag from `sphinx deploy/propose`.
// my hunch is that `createSelectFork` will override the `--rpc-url` flag, which means that their
// transactions probably wouldn't get broadcasted onto our port.

const args = process.argv.slice(2)
const encodedActions = args[0]
const encodedConfigCache = args[1]

;(async () => {
  const { compilerConfigFolder, cachePath, artifactFolder, buildInfoFolder } =
    await getFoundryConfigOptions()

  const rootImportPath =
    process.env.DEV_FILE_PATH ?? './node_modules/@sphinx-labs/plugins/'
  const utilsArtifactFolder = `${rootImportPath}out/artifacts`

  const SphinxUtilsABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${utilsArtifactFolder}/SphinxUtils.sol/SphinxUtils.json`
    )).abi

  const SphinxActionsABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${utilsArtifactFolder}/SphinxActions.sol/SphinxActions.json`
    )).abi

  const configCache = decodeCachedConfig(encodedConfigCache, SphinxUtilsABI)
  const actions = decodeActions(
    encodedActions,
    SphinxActionsABI,
    sphinxManager,
    chainId
  )

  // TODO(refactor): i think the cleanest solution would be to have a single object that contains
  // everything on a given chain. then, in the proposal task, you can just do a slight reformat to create
  // the parsed config.

  const parsedConfig: ParsedConfig = {
    manager: configCache.manager,
    chainId: configCache.chainId,
    actionsTODO: actions,
    isManagerDeployed: configCache.isManagerDeployed,
    isExecuting: configCache.isExecuting,
    isLiveNetwork: configCache.isLiveNetwork,
    currentManagerVersion: configCache.currentManagerVersion,
  }

  const cre = createSphinxRuntime(
    'foundry',
    false,
    false,
    true,
    compilerConfigFolder,
    undefined,
    false,
    process.stderr
  )

  const getConfigArtifacts = makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    cachePath
  )

  const configArtifacts = await getConfigArtifacts(actions)

  const leafs = await getAuthLeafsForChain(parsedConfig, configArtifacts)

  const authBundle = makeAuthBundle(leafs)

  const { configUri, bundles, compilerConfig, humanReadableActions } =
    await getProjectBundleInfo(parsedConfig, configArtifacts)

  writeCompilerConfig(compilerConfigFolder, configUri, compilerConfig)

  const ipfsHash = configUri.replace('ipfs://', '')
  const artifactCachePath = path.resolve(`${cachePath}/configArtifacts`)
  // Create the canonical config network folder if it doesn't already exist.
  if (!fs.existsSync(artifactCachePath)) {
    fs.mkdirSync(artifactCachePath)
  }

  // TODO: it seems we write the config artifacts here just for etherscan verification. if
  // foundry can verify the user's contracts without us, we can delete the logic that
  // writes it to the FS here.
  // TODO: is the `configArtifactsPath` path correct? i'm curious how the ipfsHash is related to the configArtifacts.
  // Write the config artifacts to the local file system. It will exist in a JSON file that has the
  // config URI as its name.
  const configArtifactsPath = path.join(artifactCachePath, `${ipfsHash}.json`)
  if (!fs.existsSync(configArtifactsPath)) {
    fs.writeFileSync(
      configArtifactsPath,
      JSON.stringify(configArtifacts, null, 2)
    )
  }

  // TODO: you return a single object that isn't keyed by a chain id, since this file will only
  // be called on one chain at a time.

  const bundleInfo = {
    bundles: {
      actionBundle: bundles.actionBundle,
      targetBundle: bundles.targetBundle,
      authBundle,
    },
    configUri,
    humanReadableActions,
  }

  process.stdout.write(JSON.stringify(bundleInfo))
})()
