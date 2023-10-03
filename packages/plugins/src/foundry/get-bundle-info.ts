import path, { resolve } from 'path'
import fs from 'fs'

import { getProjectBundleInfo } from '@sphinx-labs/core/dist/tasks'
import {
  writeCompilerConfig,
  makeAuthBundle,
  getAuthLeafsForChain,
  DeploymentInfo,
  makeParsedConfig,
  getNetworkNameForChainId,
  AuthLeaf,
} from '@sphinx-labs/core/dist'
import { AbiCoder } from 'ethers'

import { getFoundryConfigOptions } from './options'
import { decodeDeploymentInfoArray } from './decode'
import { makeGetConfigArtifacts } from './utils'

const args = process.argv.slice(2)
const abiEncodedDeploymentInfoArray = args[0]

;(async () => {
  const { compilerConfigFolder, cachePath, artifactFolder, buildInfoFolder } =
    await getFoundryConfigOptions()

  const SphinxPluginTypesABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${artifactFolder}/SphinxPluginTypes.sol/SphinxPluginTypes.json`
    )).abi

  const bundledActionType = SphinxPluginTypesABI.find(
    (fragment) => fragment.name === 'bundledActionsType'
  ).outputs[0]
  const targetBundleType = SphinxPluginTypesABI.find(
    (fragment) => fragment.name === 'targetBundleType'
  ).outputs[0]
  const humanReadableActionsType = SphinxPluginTypesABI.find(
    (fragment) => fragment.name === 'humanReadableActionsType'
  ).outputs[0]
  const bundledAuthLeafType = SphinxPluginTypesABI.find(
    (fragment) => fragment.name === 'bundledAuthLeafsType'
  ).outputs[0]

  const deploymentInfoArray: Array<DeploymentInfo> = decodeDeploymentInfoArray(
    abiEncodedDeploymentInfoArray,
    SphinxPluginTypesABI
  )

  const coder = AbiCoder.defaultAbiCoder()

  const getConfigArtifacts = makeGetConfigArtifacts(
    artifactFolder,
    buildInfoFolder,
    cachePath
  )

  const bundleInfoPerChain = {}
  const authLeafs: Array<AuthLeaf> = []
  for (const deploymentInfo of deploymentInfoArray) {
    const networkName = getNetworkNameForChainId(deploymentInfo.chainId)

    const configArtifacts = await getConfigArtifacts(
      deploymentInfo.actionInputs
    )

    const parsedConfig = makeParsedConfig(deploymentInfo, configArtifacts)

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

    // TODO(test): it seems we write the config artifacts here just for etherscan verification. if
    // foundry can verify the user's contracts without us, i think we can delete the logic that
    // writes it to the FS here.
    // TODO(test): is the `configArtifactsPath` path correct? i'm curious how the ipfsHash is related to the configArtifacts.
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

  for (const deploymentInfo of deploymentInfoArray) {
    const networkName = getNetworkNameForChainId(deploymentInfo.chainId)

    // Remove any auth leafs that won't be executed on the current chain.
    const authLeafsForChain = authBundle.leafs
      .filter((l) => l.leaf.chainId === deploymentInfo.chainId)
      // Remove any unnecessary fields from the Auth leaf.
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
