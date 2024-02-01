import { JsonRpcProvider, TransactionRequest } from 'ethers'

export class SphinxJsonRpcProvider extends JsonRpcProvider {
  constructor(url: string) {
    // We override the default `cacheTimeout` because local test nodes won't work otherwise. We
    // override the default `batchMaxCount` because this speeds up the rate that transactions are
    // executed on local test nodes. The downside to using these overrides is that they'll result in
    // more RPC calls on live networks. However, the upside is that we can reuse the same provider
    // for test nodes and live networks.
    super(url, undefined, {
      batchMaxCount: 1,
      cacheTimeout: -1,
    })
  }

  // On OKT Chain, they appear to be running an out of date geth client which is not compatible with the current spec.
  // For shame!
  // See this issue for more info: https://github.com/NomicFoundation/hardhat/issues/4010
  // So on OKT Chain we have to call eth_estimateGas ourselves to handle this....
  estimateGas(_tx: TransactionRequest): Promise<bigint> {
    if (_tx.chainId === 66) {
      return this.send('eth_estimateGas', [_tx])
    }

    return super.estimateGas(_tx)
  }
}
