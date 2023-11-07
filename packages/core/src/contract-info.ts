import {
  getOwnerAddress,
  ManagedServiceArtifact,
  SphinxModuleFactoryArtifact,
} from '@sphinx-labs/contracts'
import { Provider, ZeroAddress } from 'ethers'

import { ContractArtifact } from './languages/solidity/types'
import {
  getManagedServiceAddress,
  getSphinxModuleFactoryAddress,
} from './addresses'
import { USDC_ADDRESSES } from './networks'
import { parseFoundryArtifact } from './utils'

export const getSphinxConstants = async (
  provider: Provider
): Promise<
  Array<{
    artifact: ContractArtifact
    expectedAddress: string
    constructorArgs: any[]
  }>
> => {
  const network = await provider.getNetwork()
  const chainId = network.chainId
  const contractInfo = [
    {
      artifact: parseFoundryArtifact(ManagedServiceArtifact),
      expectedAddress: getManagedServiceAddress(chainId),
      constructorArgs: [
        getOwnerAddress(),
        chainId === 420n || chainId === 10n
          ? USDC_ADDRESSES[Number(chainId)]
          : ZeroAddress,
      ],
    },
    {
      artifact: parseFoundryArtifact(SphinxModuleFactoryArtifact),
      expectedAddress: getSphinxModuleFactoryAddress(),
      constructorArgs: [],
    },
  ]

  return contractInfo
}
