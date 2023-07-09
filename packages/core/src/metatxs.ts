import { ethers } from 'ethers'

export const signAuthRootMetaTxn = async (
  signer: ethers.Wallet | ethers.providers.JsonRpcSigner,
  authRoot: string
): Promise<string> => {
  const domain = {
    name: 'ChugSplash',
  }

  const types = { AuthRoot: [{ name: 'root', type: 'bytes32' }] }
  const value = { root: authRoot }

  const signature = await signer._signTypedData(domain, types, value)
  return signature
}
