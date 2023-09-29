import path, { resolve } from 'path'
import fs from 'fs'

import { getProjectBundleInfo } from '@sphinx-labs/core/dist/tasks'
import {
  writeCompilerConfig,
  makeAuthBundle,
  getAuthLeafsForChain,
  ChainInfo,
  makeParsedConfig,
  getNetworkNameForChainId,
  AuthLeaf,
} from '@sphinx-labs/core/dist'
import { AbiCoder, ethers } from 'ethers'

import { getFoundryConfigOptions } from './options'
import { decodeChainInfoArray } from './structs'
import { makeGetConfigArtifacts } from './utils'

// TODO: see what happens if the user does `vm.createSelectFork(); deploy(...);` in their script
// when we're attempting to call their script with an `--rpc-url` flag from `sphinx deploy/propose`.
// my hunch is that `createSelectFork` will override the `--rpc-url` flag, which means that their
// transactions probably wouldn't get broadcasted onto our port.

const args = process.argv.slice(2)
const abiEncodedChainInfoArray = args[0]

;(async () => {
  const { compilerConfigFolder, cachePath, artifactFolder, buildInfoFolder } =
    await getFoundryConfigOptions()

  const rootImportPath =
    process.env.DEV_FILE_PATH ?? './node_modules/@sphinx-labs/plugins/'
  const sphinxArtifactFolder = `${rootImportPath}out/artifacts`

  const SphinxUtilsABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${sphinxArtifactFolder}/SphinxUtils.sol/SphinxUtils.json`
    )).abi
  const SphinxABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(`${artifactFolder}/Sphinx.sol/Sphinx.json`)).abi

  const bundledActionType = SphinxUtilsABI.find(
    (fragment) => fragment.name === 'bundledActionsType'
  ).outputs[0]
  const targetBundleType = SphinxUtilsABI.find(
    (fragment) => fragment.name === 'targetBundleType'
  ).outputs[0]
  const humanReadableActionsType = SphinxUtilsABI.find(
    (fragment) => fragment.name === 'humanReadableActionsType'
  ).outputs[0]
  const bundledAuthLeafType = SphinxUtilsABI.find(
    (fragment) => fragment.name === 'bundledAuthLeafsType'
  ).outputs[0]

  const chainInfoArray: Array<ChainInfo> = decodeChainInfoArray(
    abiEncodedChainInfoArray,
    SphinxABI
  )

  const coder = AbiCoder.defaultAbiCoder()

  const getConfigArtifacts = makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    cachePath
  )

  const bundleInfoPerChain = {}
  const authLeafs: Array<AuthLeaf> = []
  for (const chainInfo of chainInfoArray) {
    const networkName = getNetworkNameForChainId(chainInfo.chainId)

    const configArtifacts = await getConfigArtifacts(chainInfo.actionsTODO)

    const parsedConfig = makeParsedConfig(chainInfo, configArtifacts)

    const authLeafsForChain = await getAuthLeafsForChain(
      parsedConfig,
      configArtifacts
    )
    authLeafs.push(...authLeafsForChain)

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

    const actionsAbiEncoded = coder.encode(
      [bundledActionType],
      [bundles.actionBundle.actions]
    )
    const targetBundleAbiEncoded = coder.encode(
      [targetBundleType],
      [bundles.targetBundle]
    )
    const humanReadableActionsAbiEncoded = coder.encode(
      [humanReadableActionsType],
      [Object.values(humanReadableActions)]
    )

    bundleInfoPerChain[networkName] = {
      configUri,
      humanReadableActionsAbiEncoded,
      actionBundle: {
        root: bundles.actionBundle.root,
        actionsAbiEncoded,
      },
      targetBundleAbiEncoded,
    }
  }

  const authBundle = makeAuthBundle(authLeafs)

  for (const chainInfo of chainInfoArray) {
    const networkName = getNetworkNameForChainId(chainInfo.chainId)

    // TODO(docs): include only the leafs on the current chain
    const authLeafsForChain = authBundle.leafs
      .filter((l) => l.leaf.chainId === chainInfo.chainId)
      // TODO(docs): only include the necessary fields
      .map((l) => {
        return {
          leaf: {
            chainId: l.leaf.chainId,
            to: l.leaf.to,
            index: l.leaf.index,
            data: l.leaf.data,
          },
          leafType: l.prettyLeaf.leafTypeEnum,
          proof: l.proof,
        }
      })

    const authLeafsAbiEncoded = coder.encode(
      [bundledAuthLeafType],
      [authLeafsForChain]
    )
    bundleInfoPerChain[networkName].authBundle = {
      authLeafsAbiEncoded,
    }
  }

  const bundleInfo = {
    chains: bundleInfoPerChain,
    authRoot: authBundle.root,
  }

  process.stdout.write(JSON.stringify(bundleInfo))
})()
