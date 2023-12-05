import { Wallet, toUtf8Bytes } from 'ethers'
import {
  createWalletClient,
  encodeAbiParameters,
  encodePacked,
  http,
  keccak256,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// forge script ./contracts/foundry/SphinxUtils.sol --sig 'signMetaTxnForAuthRoot(uint256,bytes32)' 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 0x0000000000000000000000000000000000000000000000000000000000000000

/**
 * Uses the Ethers type data signing utility.
 * https://docs.ethers.org/v5/api/signer/#Signer-signTypedData
 * Note this function is not documented in v6 yet, so the above docs are for v5.
 */
const ethersSignTypedData = async (root: string, privateKey: string) => {
  const domain = {
    name: 'Sphinx',
    version: '1.0.0',
  }

  const types = { MerkleRoot: [{ name: 'root', type: 'bytes32' }] }

  const value = { root }

  const wallet = new Wallet(privateKey)

  const signature = await wallet.signTypedData(domain, types, value)
  console.log(signature)
}

/**
 * Signature generation by handling the construction of each part of the message individually then signing as a raw
 * message at the end. Also using viem. Note that this outputs exactly the same thing as `signMetaTxnForAuthRoot` for all
 * the individual parts up until the final signature.
 * https://viem.sh/docs/actions/wallet/signMessage.html#signmessage
 */
const signatureParts = async (root: string, privateKey: string) => {
  const walletClient = createWalletClient({
    transport: http('http://localhost'),
  })
  const account = privateKeyToAccount(privateKey as `0x${string}`)

  const DOMAIN_SEPARATOR = keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }],
      [
        keccak256(toUtf8Bytes('EIP712Domain(string name,string version')),
        keccak256(toUtf8Bytes('Sphinx')),
        keccak256(toUtf8Bytes('1.0.0')),
      ]
    )
  )
  console.log(`DOMAIN_SEPARATOR: ${DOMAIN_SEPARATOR}`)

  const typeHash = keccak256(toUtf8Bytes('MerkleRoot(bytes32 root)'))
  console.log(`typeHash: ${typeHash}`)

  const encodedParams = encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }],
    [typeHash, root as `0x${string}`]
  )
  console.log(`encodedParams: ${encodedParams}`)

  const hashedData = keccak256(encodedParams)
  console.log(`hashedData: ${hashedData}`)

  const typedData = encodePacked(
    ['string', 'bytes32', 'bytes32'],
    ['\x19\x01', DOMAIN_SEPARATOR, hashedData]
  )
  console.log(`typedData: ${typedData}`)

  const sig = await walletClient.signMessage({
    account,
    message: {
      raw: keccak256(typedData),
    },
  })
  console.log(`sig: ${sig}`)
}

/**
 * Standard viem typed data signing. This is what I was originally using, and was working fine until recently.
 * https://viem.sh/docs/actions/wallet/signTypedData.html#signtypeddata
 */
const viemSignTypedData = async (root: string, privateKey: string) => {
  const walletClient = createWalletClient({
    transport: http('http://localhost'),
  })
  const account = privateKeyToAccount(privateKey as `0x${string}`)

  const domain = {
    name: 'Sphinx',
    version: '1.0.0',
  }
  const types = { MerkleRoot: [{ name: 'root', type: 'bytes32' }] }
  const message = { root }
  const sig = await walletClient.signTypedData({
    account,
    domain,
    message,
    primaryType: 'MerkleRoot',
    types,
  })
  console.log(sig)
}

const generateSignature = async () => {
  const root =
    '0x0000000000000000000000000000000000000000000000000000000000000000'
  const privateKey =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

  console.log('ethers sign typed data:')
  await ethersSignTypedData(root, privateKey)
  console.log('************************')

  console.log('signature parts:')
  await signatureParts(root, privateKey)
  console.log('************************')

  console.log('viem sign typed data: ')
  await viemSignTypedData(root, privateKey)
  console.log('************************')
}

generateSignature()
