import { ethers, toBeHex } from 'ethers'

export const OWNER_MULTISIG_ADDRESS =
  '0x226F14C3e19788934Ff37C653Cf5e24caD198341'
export const getOwnerAddress = () => {
  return process.env.SPHINX_INTERNAL__OWNER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.SPHINX_INTERNAL__OWNER_PRIVATE_KEY).address
    : OWNER_MULTISIG_ADDRESS
}
export const EXECUTOR = '0x42761facf5e6091fca0e38f450adfb1e22bd8c3c'

export const DEFAULT_ADMIN_ROLE = ethers.ZeroHash

export const SPHINX_PROXY_ADMIN_ADDRESS_SLOT_KEY = toBeHex(
  BigInt(ethers.keccak256(ethers.toUtf8Bytes('sphinx.proxy.admin'))) - BigInt(1)
)

export const EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH = ethers.keccak256(
  ethers.toUtf8Bytes('external-transparent')
)
export const OZ_TRANSPARENT_PROXY_TYPE_HASH = ethers.keccak256(
  ethers.toUtf8Bytes('oz-transparent')
)
export const OZ_UUPS_OWNABLE_PROXY_TYPE_HASH = ethers.keccak256(
  ethers.toUtf8Bytes('oz-ownable-uups')
)
export const OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH = ethers.keccak256(
  ethers.toUtf8Bytes('oz-access-control-uups')
)
export const IMMUTABLE_TYPE_HASH = ethers.keccak256(
  ethers.toUtf8Bytes('immutable')
)
export const IMPLEMENTATION_TYPE_HASH = ethers.keccak256(
  ethers.toUtf8Bytes('implementation')
)
export const DEFAULT_PROXY_TYPE_HASH = ethers.ZeroHash

export const DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS =
  '0x4e59b44847b379578588920cA78FbF26c0B4956C'
export const CREATE3_PROXY_INITCODE = '0x67363d3d37363d34f03d5260086018f3'
export const EXECUTION_LOCK_TIME = 15 * 60

export const RECOMMENDED_REMAPPING =
  '@sphinx-labs/contracts/=lib/sphinx/packages/contracts/contracts/foundry'

export const MAX_CONTRACT_SIZE_LIMIT = 24576
