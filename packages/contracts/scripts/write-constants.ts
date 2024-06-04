import { ethers } from 'ethers'

import { remove0x } from '../src/utils'
import {
  getSphinxModuleProxyFactoryAddress,
  getGnosisSafeProxyFactoryAddress,
  getGnosisSafeSingletonAddress,
  getCreateCallAddress,
  getCompatibilityFallbackHandlerAddress,
  getMultiSendAddress,
  getSphinxModuleImplAddress,
  getPermissionlessRelayAddress,
} from '../src/addresses'
import {
  SPHINX_NETWORKS,
  SPHINX_LOCAL_NETWORKS,
  CONTRACTS_LIBRARY_VERSION,
} from '../src'

/**
 * Writes various constant values to a Solidity contract. This improves the speed of the Foundry
 * plugin by reducing the number of times we read need to read JSON files or do FFI calls. This
 * script can be called by running: npx ts-node src/scripts/write-constants.ts
 *
 * The output can be written to a file by appending this CLI command with: `> fileName.json`.
 *
 * NOTE: Putting contract initcode in the Solidity file will *significantly* slow down the user's
 * compilation if they're using Yul (i.e. `viaIR`) with the optimizer enabled.
 */
const writeConstants = async () => {
  const constants = {
    compatibilityFallbackHandlerAddress: {
      type: 'address',
      value: getCompatibilityFallbackHandlerAddress(),
    },
    multiSendAddress: {
      type: 'address',
      value: getMultiSendAddress(),
    },
    createCallAddress: {
      type: 'address',
      value: getCreateCallAddress(),
    },
    sphinxModuleProxyFactoryAddress: {
      type: 'address',
      value: getSphinxModuleProxyFactoryAddress(),
    },
    permissionlessRelayAddress: {
      type: 'address',
      value: getPermissionlessRelayAddress(),
    },
    safeFactoryAddress: {
      type: 'address',
      value: getGnosisSafeProxyFactoryAddress(),
    },
    safeSingletonAddress: {
      type: 'address',
      value: getGnosisSafeSingletonAddress(),
    },
    sphinxModuleImplAddress: {
      type: 'address',
      value: getSphinxModuleImplAddress(),
    },
  }

  const SphinxConstants =
    `// SPDX-License-Identifier: MIT\n` +
    `pragma solidity >=0.6.2 <0.9.0;\n\n` +
    `import { NetworkInfo, NetworkType } from "./SphinxPluginTypes.sol";\n\n` +
    `contract SphinxConstants {\n` +
    `  string public constant sphinxLibraryVersion = '${CONTRACTS_LIBRARY_VERSION}';\n` +
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
    `  uint8 internal constant numSupportedNetworks = ${
      SPHINX_NETWORKS.length + SPHINX_LOCAL_NETWORKS.length
    };\n\n` +
    `  function getNetworkInfoArray() public pure returns (NetworkInfo[] memory) {\n` +
    `    NetworkInfo[] memory all = new NetworkInfo[](numSupportedNetworks);\n` +
    `${[...SPHINX_LOCAL_NETWORKS, ...SPHINX_NETWORKS]
      .map(
        (network, index) =>
          `    all[${index}] = NetworkInfo({\n      network: Network.${
            network.name
          },\n      name: "${network.name}",\n      chainId: ${
            network.chainId
          },\n      networkType: NetworkType.${
            network.networkType
          },\n      dripSize: ${ethers.parseUnits(
            network.dripSize,
            'ether'
          )},\n      dripSizeString: '${
            network.dripSize + ' ' + network.currency
          }'\n    });`
      )
      .join('\n')}\n` +
    `    return all;\n  }` +
    `\n}\n`

  process.stdout.write(SphinxConstants)

  const networksEnum =
    `\nenum Network {\n` +
    `${SPHINX_LOCAL_NETWORKS.map((network) => {
      return `  ${network.name},`
    }).join('\n')}\n` +
    `${SPHINX_NETWORKS.map((network, index) => {
      return `  ${network.name}${
        index !== SPHINX_NETWORKS.length - 1 ? ',' : ''
      }`
    }).join('\n')}\n}\n`

  process.stdout.write(networksEnum)
}

writeConstants()
