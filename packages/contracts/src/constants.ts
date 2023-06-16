import { ethers } from 'ethers'

import {
  DefaultAdapterArtifact,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterArtifact,
  OZTransparentAdapterArtifact,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  DefaultGasPriceCalculatorArtifact,
  DefaultCreate3Artifact,
  ForwarderArtifact,
} from './ifaces'

export const OWNER_MULTISIG_ADDRESS =
  '0x226F14C3e19788934Ff37C653Cf5e24caD198341'
export const getOwnerAddress = () => {
  return process.env.CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY)
        .address
    : OWNER_MULTISIG_ADDRESS
}
export const EXECUTOR = '0x42761facf5e6091fca0e38f450adfb1e22bd8c3c'

export const CHUGSPLASH_PROXY_ADMIN_ADDRESS_SLOT_KEY = ethers.BigNumber.from(
  ethers.utils.keccak256(ethers.utils.toUtf8Bytes('chugsplash.proxy.admin'))
)
  .sub(1)
  .toHexString()

export const EXTERNAL_DEFAULT_PROXY_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('external-default')
)
export const OZ_TRANSPARENT_PROXY_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('oz-transparent')
)
export const OZ_UUPS_OWNABLE_PROXY_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('oz-ownable-uups')
)
export const OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('oz-access-control-uups')
)
export const NO_PROXY_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('no-proxy')
)

export const DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS =
  '0x4e59b44847b379578588920ca78fbf26c0b4956c'
export const OWNER_BOND_AMOUNT = ethers.utils.parseEther('0.001')
export const EXECUTION_LOCK_TIME = 15 * 60
export const EXECUTOR_PAYMENT_PERCENTAGE = 20
export const PROTOCOL_PAYMENT_PERCENTAGE = 20

export const DEFAULT_CREATE3_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.constants.HashZero,
  ethers.utils.solidityKeccak256(['bytes'], [DefaultCreate3Artifact.bytecode])
)

export const DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS =
  ethers.utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ethers.constants.HashZero,
    ethers.utils.solidityKeccak256(
      ['bytes'],
      [DefaultGasPriceCalculatorArtifact.bytecode]
    )
  )

export const DEFAULT_UPDATER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.constants.HashZero,
  ethers.utils.solidityKeccak256(['bytes'], [DefaultUpdaterArtifact.bytecode])
)

export const DEFAULT_ADAPTER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.constants.HashZero,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      DefaultAdapterArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address'],
        [DEFAULT_UPDATER_ADDRESS]
      ),
    ]
  )
)

export const OZ_UUPS_UPDATER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.constants.HashZero,
  ethers.utils.solidityKeccak256(['bytes'], [OZUUPSUpdaterArtifact.bytecode])
)

export const OZ_UUPS_OWNABLE_ADAPTER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.constants.HashZero,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      OZUUPSOwnableAdapterArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address'],
        [OZ_UUPS_UPDATER_ADDRESS]
      ),
    ]
  )
)

export const OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS =
  ethers.utils.getCreate2Address(
    DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
    ethers.constants.HashZero,
    ethers.utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        OZUUPSAccessControlAdapterArtifact.bytecode,
        ethers.utils.defaultAbiCoder.encode(
          ['address'],
          [OZ_UUPS_UPDATER_ADDRESS]
        ),
      ]
    )
  )

export const OZ_TRANSPARENT_ADAPTER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.constants.HashZero,
  ethers.utils.solidityKeccak256(
    ['bytes', 'bytes'],
    [
      OZTransparentAdapterArtifact.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address'],
        [DEFAULT_UPDATER_ADDRESS]
      ),
    ]
  )
)

export const FORWARDER_ADDRESS = ethers.utils.getCreate2Address(
  DETERMINISTIC_DEPLOYMENT_PROXY_ADDRESS,
  ethers.constants.HashZero,
  ethers.utils.solidityKeccak256(['bytes'], [ForwarderArtifact.bytecode])
)
