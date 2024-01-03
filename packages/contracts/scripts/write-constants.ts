import { remove0x } from '../src/utils'
import {
  getManagedServiceAddress,
  getSphinxModuleProxyFactoryAddress,
  getGnosisSafeProxyFactoryAddress,
  getGnosisSafeSingletonAddress,
  getCompatibilityFallbackHandlerAddress,
  getMultiSendAddress,
  getSphinxModuleImplAddress,
} from '../src/addresses'

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
    sphinxModuleProxyFactoryAddress: {
      type: 'address',
      value: getSphinxModuleProxyFactoryAddress(),
    },
    managedServiceAddress: {
      type: 'address',
      value: getManagedServiceAddress(),
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
      .join('\n')}\n}\n`

  process.stdout.write(solidityFile)
}

writeConstants()
