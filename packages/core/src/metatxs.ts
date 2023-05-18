import { BigNumber, Contract, ethers } from 'ethers'
import {
  signTypedData,
  SignTypedDataVersion,
  TypedMessage,
  MessageTypes,
} from '@metamask/eth-sig-util'
import { ForwarderABI, FORWARDER_ADDRESS } from '@chugsplash/contracts'
import axios from 'axios'

const EIP712Domain = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
]

type BaseForwardRequestType = {
  from: string
  to: string
  data: string
}

export type ForwardRequestType = BaseForwardRequestType & {
  value: number
  gas: number
  nonce: number
}

const ForwardRequest = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'gas', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'data', type: 'bytes' },
]

export const getMetaTxTypeData = (
  chainId: number,
  verifyingContract: string
) => {
  return {
    types: {
      EIP712Domain,
      ForwardRequest,
    },
    domain: {
      name: 'GSNv2 Forwarder',
      version: '0.0.1',
      chainId,
      verifyingContract,
    },
    primaryType: 'ForwardRequest',
  }
}

export const signMessage = async (
  key: string,
  data: TypedMessage<MessageTypes>
) => {
  // If signer is a private key, use it to sign
  const privateKey = Buffer.from(key.replace(/^0x/, ''), 'hex')
  return signTypedData({
    privateKey,
    data,
    version: SignTypedDataVersion.V4,
  })
}

export const buildRequest = async (
  forwarder: Contract,
  input: BaseForwardRequestType
): Promise<ForwardRequestType> => {
  const nonce = await forwarder
    .getNonce(input.from)
    .then((n: BigNumber) => n.toString())
  return { value: 0, gas: 1e6, nonce, ...input }
}

export const buildTypedData = async (
  forwarder: Contract,
  request: ForwardRequestType
) => {
  const chainId = await forwarder.provider.getNetwork().then((n) => n.chainId)
  const typeData = getMetaTxTypeData(chainId, forwarder.address)
  return { ...typeData, message: request }
}

export const signMetaTxRequest = async (
  provider: ethers.providers.JsonRpcProvider,
  privateKey: string,
  input: BaseForwardRequestType
) => {
  const forwarder = new Contract(FORWARDER_ADDRESS, ForwarderABI, provider)
  const request = await buildRequest(forwarder, input)
  const toSign = await buildTypedData(forwarder, request)
  const signature = await signMessage(privateKey, toSign)
  return { signature, request }
}

export const relaySignedRequest = async (
  signature: string,
  request: ForwardRequestType,
  orgId: string,
  deploymentId: string,
  projectName: string,
  networkId: number,
  estimatedGasCost: BigNumber
) => {
  const baseUrl = process.env.CHUGSPLASH_MANAGED_BASE_URL
    ? process.env.CHUGSPLASH_MANAGED_BASE_URL
    : 'https://www.chugsplash.io'
  try {
    await axios.post(`${baseUrl}/api/relay`, {
      apiKey: process.env.CHUGSPLASH_API_KEY,
      orgId,
      signature,
      request,
      onChainId: deploymentId,
      projectName,
      networkId,
      estimatedGasCost: estimatedGasCost.toString(),
    })
  } catch (e) {
    if (e.response?.data?.includes('Unsupported network')) {
      throw new Error(`Unsupported network: ${networkId}`)
    } else if (e.response?.data?.includes('Unauthorized')) {
      throw new Error(
        `Unauthorized, are you sure your API key and org ID are correct?`
      )
    } else if (e.response?.data?.includes('Invalid metatxs request')) {
      throw new Error(
        `Invalid signature, are you sure your PRIVATE_KEY is correct?`
      )
    } else {
      throw new Error(
        `Unknown error, please report this to the developers + \n ${e}`
      )
    }
  }
}
