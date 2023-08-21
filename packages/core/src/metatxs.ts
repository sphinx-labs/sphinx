import { ethers } from 'ethers'

export const signAuthRootMetaTxn = async (
  signer: ethers.Wallet | ethers.JsonRpcSigner,
  authRoot: string
): Promise<string> => {
  const domain = {
    name: 'Sphinx',
  }

  const types = { AuthRoot: [{ name: 'root', type: 'bytes32' }] }
  const value = { root: authRoot }

  const signature = await signer.signTypedData(domain, types, value)
  return signature
}
