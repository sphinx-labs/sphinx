import path, { resolve } from 'path'
import fs from 'fs'

import { getProjectBundleInfo } from '@sphinx-labs/core/dist/tasks'
import {
  writeCompilerConfig,
  makeAuthBundle,
  getAuthLeafsForChain,
  ChainInfo,
  makeParsedConfig,
  convertBigIntToString,
} from '@sphinx-labs/core/dist'

import { getFoundryConfigOptions } from './options'
import { decodeChainInfo } from './structs'
import { makeGetConfigArtifacts } from './utils'

// TODO: see what happens if the user does `vm.createSelectFork(); deploy(...);` in their script
// when we're attempting to call their script with an `--rpc-url` flag from `sphinx deploy/propose`.
// my hunch is that `createSelectFork` will override the `--rpc-url` flag, which means that their
// transactions probably wouldn't get broadcasted onto our port.

const args = process.argv.slice(2)
const abiEncodedChainInfo = args[0]

;(async () => {
  const { compilerConfigFolder, cachePath, artifactFolder, buildInfoFolder } =
    await getFoundryConfigOptions()

  const rootImportPath =
    process.env.DEV_FILE_PATH ?? './node_modules/@sphinx-labs/plugins/'
  const utilsArtifactFolder = `${rootImportPath}out/artifacts`

  const SphinxActionsABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${utilsArtifactFolder}/SphinxActions.sol/SphinxActions.json`
    )).abi

  const chainInfo: ChainInfo = decodeChainInfo(
    abiEncodedChainInfo,
    SphinxActionsABI
  )

  const getConfigArtifacts = makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    cachePath
  )

  const configArtifacts = await getConfigArtifacts(chainInfo.actionsTODO)

  const parsedConfig = makeParsedConfig(chainInfo, configArtifacts)

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

  // TODO(docs): include only the necessary fields
  const authEncodedData = authBundle.leafs.map((l) => l.leaf.data)
  const TODO = authBundle.leafs.map((l) => {
    return {
      leaf: {
        chainId: l.leaf.chainId,
        to: l.leaf.to,
        index: l.leaf.index,
      },
      leafType: l.prettyLeaf.leafTypeEnum,
      proof: l.proof,
    }
  })

  const bundleInfo = {
    bundles: {
      actionBundle: bundles.actionBundle,
      targetBundle: bundles.targetBundle,
      authBundle: {
        root: authBundle.root,
        leafs: TODO,
        data: authEncodedData,
      },
    },
    configUri,
    humanReadableActions: Object.values(humanReadableActions), // TODO: this should be an array initially, not an obj
  }

  // TODO(docs)
  const convertedBigInts = convertBigIntToString(bundleInfo)
  process.stdout.write(JSON.stringify(convertedBigInts))
})()
