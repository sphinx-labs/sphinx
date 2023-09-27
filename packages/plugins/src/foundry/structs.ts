import { fromRawSphinxActionTODO } from '@sphinx-labs/core'
import {
  ChainInfo,
  ConfigCache,
  DeployContractTODO,
  FunctionCallTODO,
  RawSphinxActionTODO,
} from '@sphinx-labs/core/dist/config/types'
import { AbiCoder } from 'ethers'

// TODO: rename to 'decode' or something

export const decodeChainInfo = (
  abiEncodedChainInfo: string,
  abi: Array<any>
): ChainInfo => {
  const chainInfoType = abi.find((fragment) => fragment.name === 'getChainInfo')
    .outputs[0]

  const coder = AbiCoder.defaultAbiCoder()
  const chainInfo = coder.decode([chainInfoType], abiEncodedChainInfo)[0]

  return chainInfo
}

export const decodeChainInfoArray = (
  abiEncodedChainInfoArray: string,
  abi: Array<any>
): Array<ChainInfo> => {
  const chainInfoType = abi.find((fragment) => fragment.name === 'getChainInfo')
    .outputs[0]

  const coder = AbiCoder.defaultAbiCoder()
  const chainInfo = coder.decode([chainInfoType], abiEncodedChainInfoArray)[0]

  return chainInfo
}
