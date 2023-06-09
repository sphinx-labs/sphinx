import {
  ChugSplashBootloaderOneArtifact,
  ChugSplashBootloaderTwoArtifact,
  OZ_TRANSPARENT_PROXY_TYPE_HASH,
  DEFAULT_PROXY_TYPE_HASH,
  OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
  OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
  EXTERNAL_DEFAULT_PROXY_TYPE_HASH,
} from '@chugsplash/contracts'
import {
  bootloaderTwoConstructorFragment,
  CURRENT_CHUGSPLASH_MANAGER_VERSION,
  getBootloaderTwoConstructorArgs,
  getChugSplashRegistryAddress,
  getManagerProxyBytecodeHash,
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

  const bootloaderOne = ChugSplashBootloaderOneArtifact.bytecode
  const bootloaderTwo = ChugSplashBootloaderTwoArtifact.bytecode

  const bootloaderTwoCreationCode = bootloaderTwo.concat(
    ethers.utils.defaultAbiCoder
      .encode(
        bootloaderTwoConstructorFragment.inputs,
        getBootloaderTwoConstructorArgs()
      )
      .slice(2)
  )

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
    DEFAULT_PROXY_TYPE_HASH: {
      type: 'bytes32',
      value: DEFAULT_PROXY_TYPE_HASH,
    },
    OZ_TRANSPARENT_PROXY_TYPE_HASH: {
      type: 'bytes32',
      value: OZ_TRANSPARENT_PROXY_TYPE_HASH,
    },
    OZ_UUPS_OWNABLE_PROXY_TYPE_HASH: {
      type: 'bytes32',
      value: OZ_UUPS_OWNABLE_PROXY_TYPE_HASH,
    },
    OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH: {
      type: 'bytes32',
      value: OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH,
    },
    EXTERNAL_DEFAULT_PROXY_TYPE_HASH: {
      type: 'bytes32',
      value: EXTERNAL_DEFAULT_PROXY_TYPE_HASH,
    },
    bootloaderOneBytecode: {
      type: 'bytes',
      value: `hex"${remove0x(bootloaderOne)}"`,
    },
    bootloaderTwoBytecode: {
      type: 'bytes',
      value: `hex"${remove0x(bootloaderTwoCreationCode)}"`,
    },
  }

  const solidityFile =
    `// SPDX-License-Identifier: MIT\n` +
    `pragma solidity ^0.8.15;\n\n` +
    `library Constants {
${Object.entries(constants)
  .map(
    ([name, { type, value }]) => `\t${type} constant public ${name} = ${value};`
  )
  .join('\n')}
}`

  process.stdout.write(solidityFile)
}

writeConstants()
