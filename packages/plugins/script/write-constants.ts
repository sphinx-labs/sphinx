import hre from 'hardhat'
import '@nomicfoundation/hardhat-ethers'
import {
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  DEFAULT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  EXTERNAL_TRANSPARENT_PROXY_TYPE_HASH,
  buildInfo as sphinxContractsBuildInfo,
  SphinxManagerArtifact,
  ManagedServiceArtifact,
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
  AUTH_PROXY_INIT_CODE_HASH,
  getSphinxConstants,
  AUTH_FACTORY_ADDRESS,
  remove0x,
  getAuthImplAddress,
  CURRENT_SPHINX_AUTH_VERSION,
  getStorageSlotKey,
  getManagerConstructorValues,
  getManagedServiceAddress,
  getManagedServiceConstructorArgs,
  DEFAULT_CREATE3_ADDRESS,
  getStorageLayout,
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
  const fullyQualifiedNameAuth = 'contracts/SphinxAuth.sol:SphinxAuth'
  const [sourceNameAuth, contractNameAuth] = fullyQualifiedNameAuth.split(':')
  const storageLayoutAuth = getStorageLayout(
    sphinxContractsBuildInfo.output,
    sourceNameAuth,
    contractNameAuth
  )
  // The `_roles` variable is a mapping located in the AccessControl contract inherited by
  // SphinxAuth.
  const authAccessControlRoleSlotKey = getStorageSlotKey(
    fullyQualifiedNameAuth,
    storageLayoutAuth,
    '_roles'
  )

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
    authProxyInitCodeHash: {
      type: 'bytes32',
      value: AUTH_PROXY_INIT_CODE_HASH,
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
    defaultCreate3Address: {
      type: 'address',
      value: DEFAULT_CREATE3_ADDRESS,
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
    managerImplementationAddressStandard: {
      type: 'address',
      value: getSphinxManagerImplAddress(
        31337n,
        CURRENT_SPHINX_MANAGER_VERSION
      ),
    },
    managerImplementationAddressOptimism: {
      type: 'address',
      value: getSphinxManagerImplAddress(10n, CURRENT_SPHINX_MANAGER_VERSION),
    },
    managerImplementationAddressOptimismGoerli: {
      type: 'address',
      value: getSphinxManagerImplAddress(420n, CURRENT_SPHINX_MANAGER_VERSION),
    },
    authAccessControlRoleSlotKey: {
      type: 'bytes32',
      value: ethers.zeroPadValue(
        ethers.toBeHex(authAccessControlRoleSlotKey),
        32
      ),
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
    authImplAddress: {
      type: 'address',
      value: getAuthImplAddress(CURRENT_SPHINX_AUTH_VERSION),
    },
  }

  const sphinxConstants = await getSphinxConstants(hre.ethers.provider)

  // Add the manager contract info for specifically optimism and optimism goerli
  // where the address is different from the rest of the networks.
  // We do not include these in the above getSphinxConstants function b/c that function
  // is also used by our live network deployment process so including three copies of the
  // Sphinx manager contract info would be redundant and potentially cause errors.
  sphinxConstants.push(
    ...[
      {
        artifact: SphinxManagerArtifact,
        expectedAddress: getSphinxManagerImplAddress(
          10n,
          CURRENT_SPHINX_MANAGER_VERSION
        ),
        constructorArgs: getManagerConstructorValues(
          10n,
          CURRENT_SPHINX_MANAGER_VERSION
        ),
      },
      {
        artifact: ManagedServiceArtifact,
        expectedAddress: getManagedServiceAddress(10n),
        constructorArgs: getManagedServiceConstructorArgs(10n),
      },
      {
        artifact: SphinxManagerArtifact,
        expectedAddress: getSphinxManagerImplAddress(
          420n,
          CURRENT_SPHINX_MANAGER_VERSION
        ),
        constructorArgs: getManagerConstructorValues(
          420n,
          CURRENT_SPHINX_MANAGER_VERSION
        ),
      },
      {
        artifact: ManagedServiceArtifact,
        expectedAddress: getManagedServiceAddress(420n),
        constructorArgs: getManagedServiceConstructorArgs(420n),
      },
    ]
  )

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
      .map(([name, { type, value }]) => {
        if (type === 'bytes') {
          // We must use the hex"..." format instead of 0x... for dynamic bytes because Solidity
          // prevents these types from using the latter format. Only fixed-size bytes, e.g. bytes32,
          // can the 0x... format.
          return `  ${type} public constant ${name} = hex"${remove0x(
            value.toString()
          )}";`
        } else {
          return `  ${type} public constant ${name} = ${value};`
        }
      })
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
