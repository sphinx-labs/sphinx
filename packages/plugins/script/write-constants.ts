import hre from 'hardhat'
import '@nomicfoundation/hardhat-ethers'
import {
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  DEFAULT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
} from '@sphinx-labs/contracts'
import {
  CURRENT_SPHINX_MANAGER_VERSION,
  getSphinxRegistryAddress,
  getManagerProxyInitCodeHash,
  getSphinxManagerImplAddress,
  OZ_TRANSPARENT_ADAPTER_ADDRESS,
  OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
  OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
  DEFAULT_ADAPTER_ADDRESS,
  getSphinxConstants,
  AUTH_FACTORY_ADDRESS,
  remove0x,
  getAuthImplAddress,
  CURRENT_SPHINX_AUTH_VERSION,
} from '@sphinx-labs/core'
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
  const { major, minor, patch } = CURRENT_SPHINX_MANAGER_VERSION

  const constants = {
    registryAddress: {
      type: 'address',
      value: getSphinxRegistryAddress(),
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
      value: getSphinxManagerImplAddress(31337, CURRENT_SPHINX_MANAGER_VERSION),
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
    factoryAddress: {
      type: 'address',
      value: AUTH_FACTORY_ADDRESS,
    },
    authImplV1Address: {
      type: 'address',
      value: getAuthImplAddress(CURRENT_SPHINX_AUTH_VERSION),
    },
  }

  const sphinxConstants = await getSphinxConstants(hre.ethers.provider)

  const contractInfo = sphinxConstants.map(
    ({ artifact, constructorArgs, expectedAddress }) => {
      const { abi, bytecode } = artifact

      const iface = new ethers.Interface(abi)

      const creationCode = bytecode.concat(
        remove0x(iface.encodeDeploy(constructorArgs))
      )

      return { creationCode, expectedAddress }
    }
  )

  const solidityFile =
    `// SPDX-License-Identifier: MIT\n` +
    `pragma solidity >=0.6.2 <0.9.0;\n\n` +
    `struct SphinxContractInfo {\n` +
    `  bytes creationCode;\n` +
    `  address expectedAddress;\n` +
    `}\n\n` +
    `contract SphinxConstants {\n` +
    `${Object.entries(constants)
      .map(
        ([name, { type, value }]) =>
          `  ${type} public constant ${name} = ${value};`
      )
      .join('\n')}\n\n` +
    `  function getSphinxContractInfo() public pure returns (SphinxContractInfo[] memory) {\n` +
    `    SphinxContractInfo[] memory contracts = new SphinxContractInfo[](${contractInfo.length});\n` +
    `${contractInfo
      .map(
        ({ creationCode, expectedAddress }, i) =>
          `    contracts[${i}] = SphinxContractInfo(hex"${remove0x(
            creationCode
          )}", ${expectedAddress});`
      )
      .join('\n')}\n` +
    `    return contracts;\n  }` +
    `\n}`

  process.stdout.write(solidityFile)
}

writeConstants()
