import { JsonRpcProvider } from 'ethers'

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
}
