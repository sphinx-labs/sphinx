import { SphinxActionType, SupportedChainId, fromRawSphinxActionTODO } from '@sphinx-labs/core'
import {
  ConfigCache,
  DeployContractTODO,
  FunctionCallTODO,
  ParsedConfig,
  RawSphinxActionTODO,
  SphinxActionTODO,
} from '@sphinx-labs/core/dist/config/types'
import { AbiCoder } from 'ethers'

// TODO(refactor): rename configcache + cachedconfig?
export const decodeCachedConfig = (
  encodedConfigCache: string,
  SphinxUtilsABI: Array<any>
): ConfigCache => {
  // TODO(refactor): you do [0] then [configCacheType]. is that necessary?
  const configCacheType = SphinxUtilsABI.find(
    (fragment) => fragment.name === 'configCache'
  ).outputs[0]

  const coder = AbiCoder.defaultAbiCoder()
  const configCache = coder.decode([configCacheType], encodedConfigCache)[0]

  return {
    manager: configCache.manager,
    chainId: configCache.chainId, // TODO: see what type chainId is in the configCache object. should be a number.
    isLiveNetwork: configCache.isLiveNetwork,
    isManagerDeployed: configCache.isManagerDeployed,
    isExecuting: configCache.isExecuting,
    currentManagerVersion: configCache.managerVersion,
  }
}

// TODO(refactor): rename this file to something else since this isn't a struct
// TODO(refactor): mv
export const decodeActions = (
  encodedActions: string,
  abi: Array<any>,
  manager: string,
  chainId: SupportedChainId
): Array<DeployContractTODO | FunctionCallTODO> => {
  const coder = AbiCoder.defaultAbiCoder()
  const rawActions: Array<RawSphinxActionTODO> = coder.decode(
    abi,
    encodedActions
  )[0]
  const actions = rawActions.map(fromRawSphinxActionTODO)

  return actions
}
