import {
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  DEFAULT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
} from '@chugsplash/contracts'
import {
  CURRENT_CHUGSPLASH_MANAGER_VERSION,
  getChugSplashRegistryAddress,
  getManagerProxyInitCodeHash,
  getChugSplashManagerV1Address,
  OZ_TRANSPARENT_ADAPTER_ADDRESS,
  OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
  OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
  DEFAULT_ADAPTER_ADDRESS,
  getChugSplashConstants,
  AUTH_FACTORY_ADDRESS,
  AUTH_IMPL_V1_ADDRESS,
} from '@chugsplash/core'
import { remove0x } from '@eth-optimism/core-utils'
import { ethers } from 'ethers'

/**
 * Writes various constant values to a Solidity contract. This improves the speed of the Foundry
 * plugin by reducing the number of times we read need to read JSON files or do FFI calls.
 * This script can be called by running:
 * npx ts-node src/scripts/write-constants.ts
 *
 * The output can be written to a file by appending this CLI command with: `> fileName.json`.
 */
const writeConstants = async () => {
  const { major, minor, patch } = CURRENT_CHUGSPLASH_MANAGER_VERSION

  const constants = {
    registryAddress: {
      type: 'address',
      value: getChugSplashRegistryAddress(),
    },
    managerProxyInitCodeHash: {
      type: 'bytes32',
      value: getManagerProxyInitCodeHash(),
    },
    major: {
      type: 'uint256',
      value: major,
    },
    minor: {
      type: 'uint256',
      value: minor,
    },
    patch: {
      type: 'uint256',
      value: patch,
    },
    defaultProxyTypeHash: {
      type: 'bytes32',
      value: DEFAULT_PROXY_TYPE_HASH,
    },
    ozTransparentProxyTypeHash: {
      type: 'bytes32',
      value: OZ_TRANSPARENT_PROXY_TYPE_HASH,
    },
    ozUUPSOwnableProxyTypeHash: {
      type: 'bytes32',
      value: OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
    },
    ozUUPSAccessControlProxyTypeHash: {
      type: 'bytes32',
      value: OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
    },
    externalTransparentProxyTypeHash: {
      type: 'bytes32',
      value: EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
    },
    managerImplementationAddress: {
      type: 'address',
      value: getChugSplashManagerV1Address(),
    },
    ozTransparentAdapterAddr: {
      type: 'address',
      value: OZ_TRANSPARENT_ADAPTER_ADDRESS,
    },
    ozUUPSOwnableAdapterAddr: {
      type: 'address',
      value: OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
    },
    ozUUPSAccessControlAdapterAddr: {
      type: 'address',
      value: OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
    },
    defaultAdapterAddr: {
      type: 'address',
      value: DEFAULT_ADAPTER_ADDRESS,
    },
    authFactoryAddress: {
      type: 'address',
      value: AUTH_FACTORY_ADDRESS,
    },
    authImplV1Address: {
      type: 'address',
      value: AUTH_IMPL_V1_ADDRESS,
    },
  }

  const contractInfo = getChugSplashConstants(31337)
    .filter(
      (el) =>
        el.artifact.contractName !== 'ChugSplashLZSender' &&
        el.artifact.contractName !== 'ChugSplashLZReceiver'
    )
    .map(({ artifact, constructorArgs, expectedAddress }) => {
      const { abi, bytecode } = artifact

      const iface = new ethers.utils.Interface(abi)

      const creationCode = bytecode.concat(
        remove0x(iface.encodeDeploy(constructorArgs))
      )

      return { creationCode, expectedAddress }
    })

  const solidityFile =
    `// SPDX-License-Identifier: MIT\n` +
    `pragma solidity >=0.6.2 <0.9.0;\n\n` +
    `struct ChugSplashContractInfo {\n` +
    `  bytes creationCode;\n` +
    `  address expectedAddress;\n` +
    `}\n\n` +
    `contract ChugSplashConstants {\n` +
    `${Object.entries(constants)
      .map(
        ([name, { type, value }]) =>
          `  ${type} public constant ${name} = ${value};`
      )
      .join('\n')}\n\n` +
    `  function getChugSplashContractInfo() public pure returns (ChugSplashContractInfo[] memory) {\n` +
    `    ChugSplashContractInfo[] memory contracts = new ChugSplashContractInfo[](${contractInfo.length});\n` +
    `${contractInfo
      .map(
        ({ creationCode, expectedAddress }, i) =>
          `    contracts[${i}] = ChugSplashContractInfo(hex"${remove0x(
            creationCode
          )}", ${expectedAddress});`
      )
      .join('\n')}\n` +
    `    return contracts;\n  }` +
    `\n}`

  process.stdout.write(solidityFile)
}

writeConstants()
