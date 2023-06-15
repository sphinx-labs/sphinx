import { getDeterministicFactoryAddress } from '@chugsplash/core/dist/languages/solidity/predeploys'
import { providers } from 'ethers/lib/ethers'

const args = process.argv.slice(2)
const rpcUrl = args[0]

const provider = new providers.JsonRpcProvider(rpcUrl)

const main = async () => {
  try {
    await getDeterministicFactoryAddress(provider)
  } catch (e) {
    if (!e.reason.includes('could not detect network')) {
      throw e
    }
  }
}

main()
