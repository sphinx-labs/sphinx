import { fromRawSphinxActionTODO } from '@sphinx-labs/core'
import {
  ChainInfo,
  ConfigCache,
  DeployContractTODO,
  FunctionCallTODO,
  RawSphinxActionTODO,
} from '@sphinx-labs/core/dist/config/types'
import { AbiCoder } from 'ethers'

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
