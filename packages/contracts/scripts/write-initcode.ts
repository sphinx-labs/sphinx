import { getSystemContractInfo, remove0x } from '../src'

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
  const contractInfo = getSystemContractInfo()

  const solidityFile =
    `// SPDX-License-Identifier: MIT\n` +
    `pragma solidity >=0.6.2 <0.9.0;\n\n` +
    `import { SystemContractInfo } from "../contracts/foundry/SphinxPluginTypes.sol";\n\n` +
    `contract SphinxInitCode {\n` +
    `  function getSystemContractInfo() public pure returns (SystemContractInfo[] memory) {\n` +
    `    SystemContractInfo[] memory contracts = new SystemContractInfo[](${contractInfo.length});\n` +
    `${contractInfo
      .map(
        ({ initCodeWithArgs, expectedAddress }, i) =>
          `    contracts[${i}] = SystemContractInfo(hex"${remove0x(
            initCodeWithArgs
          )}", ${expectedAddress});`
      )
      .join('\n')}\n` +
    `    return contracts;\n  }` +
    `\n}`

  process.stdout.write(solidityFile)
}

writeConstants()
