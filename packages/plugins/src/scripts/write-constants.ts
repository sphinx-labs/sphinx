// import { argv } from 'node:process'

// TODO: rm unnecessary imports
// TODO(test): create Solidity tests for ChugSplashConstants.sol
// TODO: add this to yarn build
// import hre from 'hardhat'
// import '@nomiclabs/hardhat-ethers'
import {
  CURRENT_CHUGSPLASH_MANAGER_VERSION,
  getChugSplashRegistryAddress,
  getManagerProxyBytecodeHash,
} from '@chugsplash/core'
// import { utils } from 'ethers'

// import { makeGetConfigArtifacts } from '../hardhat/artifacts'
// import { createChugSplashRuntime } from '../utils'

// const configPath = argv[2]
// if (typeof configPath !== 'string') {
//   throw new Error(`Pass in a path to a ChugSplash config file.`)
// }

// TODO: hardhat/register probably not required
/**
 * Writes various constant values to a Solidity contract. This improves the speed of the Foundry
 * plugin by reducing the number of times we read need to read JSON files or do FFI calls.
 * This script can be called by running:
 * npx ts-node --require hardhat/register src/scripts/write-constants.ts
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
    managerProxyBytecodeHash: {
      type: 'bytes32',
      value: getManagerProxyBytecodeHash(),
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
  }

  const solidityFile =
    `// SPDX-License-Identifier: MIT\n` +
    `pragma solidity ^0.8.15;\n\n` +
    `${Object.entries(constants)
      .map(([name, { type, value }]) => `${type} constant ${name} = ${value};`)
      .join('\n')}
`

  process.stdout.write(solidityFile)
}

writeConstants()
