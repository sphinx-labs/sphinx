import { resolve } from 'path'

import { getProjectBundleInfo } from '@sphinx-labs/core/dist/tasks'
import {
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
  const { cachePath, artifactFolder, buildInfoFolder } =
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

  const fullyQualifiedSet = new Set<string>()
  for (const deploymentInfo of deploymentInfoArray) {
    for (const actionInput of deploymentInfo.actionInputs) {
      fullyQualifiedSet.add(actionInput.fullyQualifiedName)
    }
  }

  const configArtifacts = await getConfigArtifacts(
    Array.from(fullyQualifiedSet)
  )

  const bundleInfoPerChain = {}
  const authLeafs: Array<AuthLeaf> = []
  for (const deploymentInfo of deploymentInfoArray) {
    const networkName = getNetworkNameForChainId(deploymentInfo.chainId)

    const parsedConfig = makeParsedConfig(deploymentInfo, configArtifacts)

    const authLeafsForChain = await getAuthLeafsForChain(
      parsedConfig,
      configArtifacts
    )
    authLeafs.push(...authLeafsForChain)

    const { configUri, bundles, compilerConfig, humanReadableActions } =
      await getProjectBundleInfo(parsedConfig, configArtifacts)

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
      // We include the compiler config so that we don't need to regenerate it in the TypeScript
      // `propose` function after running the simulation. An alternative approach is to save
      // it to the file system.
      compilerConfigStr: coder.encode(
        ['string'],
        [JSON.stringify(compilerConfig)]
      ),
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
          leafTypeEnum: l.leafTypeEnum,
          leafFunctionName: l.leafFunctionName,
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
