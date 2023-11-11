Error.stackTraceLimit = Infinity // TODO(end): rm

import { ethers } from 'ethers'

import { getSphinxConstants } from '../src/contract-info'
import { remove0x } from '../src/utils'
import {
  getManagedServiceAddress,
  getSphinxModuleFactoryAddress,
  getGnosisSafeProxyFactoryAddress,
  getGnosisSafeAddress,
  getCompatibilityFallbackHandlerAddress,
  getMultiSendAddress,
} from '../src/addresses'
import { GnosisSafeProxyArtifact, SphinxModuleArtifact } from '../src/ifaces'

/**
 * Writes various constant values to a Solidity contract. This improves the speed of the Foundry
 * plugin by reducing the number of times we read need to read JSON files or do FFI calls.
 * This script can be called by running:
 * npx ts-node src/scripts/write-constants.ts
 *
 * The output can be written to a file by appending this CLI command with: `> fileName.json`.
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
    sphinxModuleFactoryAddress: {
      type: 'address',
      value: getSphinxModuleFactoryAddress(),
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
      value: getGnosisSafeAddress(),
    },
    safeProxyBytecode: {
      type: 'bytes',
      value: GnosisSafeProxyArtifact.bytecode,
    },
    sphinxModuleBytecode: {
      type: 'bytes',
      value: SphinxModuleArtifact.bytecode,
    },
  }

  const sphinxConstants = getSphinxConstants()

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
