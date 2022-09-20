import * as path from 'path'
import * as fs from 'fs'

import { utils, constants } from 'ethers'
// TODO: import the Proxy bytecode from @eth-optimism/contracts-bedrock when they update the npm
// package. Also remove @chugsplash/contracts from core/
import { bytecode as ProxyBytecode } from '@chugsplash/contracts/artifacts/@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol/Proxy.json'
import {
  ChugSplashManagerArtifact,
  CHUGSPLASH_REGISTRY_ADDRESS,
  PROXY_UPDATER_ADDRESS,
  EXECUTOR_BOND_AMOUNT,
  EXECUTION_LOCK_TIME,
  OWNER_BOND_AMOUNT,
} from '@chugsplash/contracts'

export const computeBundleId = (
  bundleRoot: string,
  bundleSize: number,
  configUri: string
): string => {
  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['bytes32', 'uint256', 'string'],
      [bundleRoot, bundleSize, configUri]
    )
  )
}

export const writeSnapshotId = async (hre: any) => {
  const hardhatNetworkPath = path.join(
    path.basename(hre.config.paths.deployed),
    '31337'
  )
  if (!fs.existsSync(hardhatNetworkPath)) {
    fs.mkdirSync(hardhatNetworkPath, { recursive: true })
  }

  const snapshotId = await hre.network.provider.send('evm_snapshot', [])
  const snapshotIdPath = path.join(hardhatNetworkPath, '.snapshotId')
  fs.writeFileSync(snapshotIdPath, snapshotId)
}

export const getProxyAddress = (
  projectName: string,
  target: string
): string => {
  const chugSplashManagerAddress = getChugSplashManagerAddress(projectName)

  return utils.getCreate2Address(
    chugSplashManagerAddress,
    utils.keccak256(utils.toUtf8Bytes(target)),
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ProxyBytecode,
        utils.defaultAbiCoder.encode(['address'], [chugSplashManagerAddress]),
      ]
    )
  )
}

export const getChugSplashManagerAddress = (projectName: string) => {
  return utils.getCreate2Address(
    CHUGSPLASH_REGISTRY_ADDRESS,
    constants.HashZero,
    utils.solidityKeccak256(
      ['bytes', 'bytes'],
      [
        ChugSplashManagerArtifact.bytecode,
        utils.defaultAbiCoder.encode(
          ['address', 'string', 'address', 'uint256', 'uint256', 'uint256'],
          [
            CHUGSPLASH_REGISTRY_ADDRESS,
            projectName,
            PROXY_UPDATER_ADDRESS,
            EXECUTOR_BOND_AMOUNT,
            EXECUTION_LOCK_TIME,
            OWNER_BOND_AMOUNT,
          ]
        ),
      ]
    )
  )
}
