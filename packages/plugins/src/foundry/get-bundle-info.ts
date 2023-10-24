import { resolve } from 'path'

import { getProjectBundleInfo } from '@sphinx-labs/core/dist/tasks'
import {
  makeAuthBundle,
  getAuthLeafsForChain,
  DeploymentInfo,
  getNetworkNameForChainId,
  AuthLeaf,
  ParsedConfig,
  ConfigArtifacts,
} from '@sphinx-labs/core/dist'
import { AbiCoder } from 'ethers'

// TODO(refactor): rm this file

import { getFoundryConfigOptions } from './options'
import { decodeDeploymentInfoArray, makeParsedConfig } from './decode'
import { makeGetConfigArtifacts } from './utils'
import { BundleInfo } from './types'

const args = process.argv.slice(2)
const abiEncodedDeploymentInfoArray = args[0]
