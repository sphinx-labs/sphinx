import { ethers } from 'ethers'
import { getSphinxConstants, remove0x } from '@sphinx-labs/contracts'

/**
 * Writes the initcode and expected addresses of all Sphinx system contracts. This allows us to use
 * the contracts in Forge tests.
 *
 * The output can be written to a file by appending this CLI command with: `> fileName.json`.
 *
 * NOTE: The generated `SphinxInitCode` contract is for testing purposes only. Including it in the
 * production Foundry plugin would *significantly* slow down the user's compilation process if
 * they're using Yul (i.e. `viaIR`) with the optimizer enabled. It's not necessary for us to use the
 * `SphinxInitCode` contract in the production Foundry plugin because we deploy the Sphinx system
 * contracts from TypeScript via the `ensureSphinxAndGnosisSafeDeployed` function.
 */
const writeConstants = async () => {
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
    `contract SphinxInitCode {\n` +
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
