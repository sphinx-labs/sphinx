import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

import { ethers } from 'ethers'
import {
  ParsedContractConfigs,
  getChugSplashManagerAddress,
  readBuildInfo,
} from '@chugsplash/core'

type BroadcastedTransactionReceipt = {
  hash: string | null
  transactionType: 'CREATE' | 'CALL'
  contractName: string | null
  contractAddress: string
  function: string | null
  arguments: any[] | null
  rpc: string
  transaction: {
    type: string
    from: string
    gas: string
    value: string
    data: string
    nonce: string
    accessList: any[]
  }
  additionalContracts: any[]
  isFixedGasLimit: boolean
}

type MinimalChugSplashConfig = {
  options: {
    organizationID: string
  }
}

export const readMinimalChugSplashConfig = (
  configPath: string
): MinimalChugSplashConfig => {
  delete require.cache[require.resolve(path.resolve(configPath))]

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(path.resolve(configPath))
  return config.default || config
}

const tmpDir = '.chugsplash-internal'

const args = process.argv.slice(2)

const scriptPath = args[0]
const { ext, base: scriptFileName } = path.parse(scriptPath)
if (ext !== '.sol') {
  throw new Error('Script must be a Solidity file')
}

const indexOfChugSplashConfigPath = args.indexOf('--config') + 1
const chugsplashConfigPath = args[indexOfChugSplashConfigPath]
const minimalConfig = readMinimalChugSplashConfig(chugsplashConfigPath)

execSync(
  `forge script ${scriptPath} --rpc-url http://localhost:8545 --broadcast`
)

const foundryConfig = JSON.parse(
  fs.readFileSync(path.join(tmpDir, 'foundryConfig.json'), 'utf8')
)

const broadcastPath = path.join(
  foundryConfig.broadcast,
  scriptFileName,
  '31337',
  'run-latest.json'
)
const broadcast: {
  transactions: BroadcastedTransactionReceipt[]
} = JSON.parse(fs.readFileSync(broadcastPath, 'utf8'))

const functionCalls: string[] = []
for (const tx of broadcast.transactions) {
  if (typeof tx.contractName !== 'string') {
    throw new Error(
      `Could not find contract name. Please report this error to the ChugSplash team.`
    )
  }

  if (tx.transactionType === 'CREATE') {
    tx.contractAddress
  } else {
    functionCalls.push(tx.function ?? 'unknown')
  }
}

if (functionCalls.length > 0) {
  const unique = [...new Set(functionCalls)]
  throw new Error(
    `Only contract creation transactions are allowed in your script.\nPlease remove the following state-changing function calls:${unique.map(
      (fn) => `\n- ${fn}`
    )}\n`
  )
}

const managerAddress = getChugSplashManagerAddress(
  minimalConfig.options.organizationID
)
const parsedContractConfigs: ParsedContractConfigs = {}
for (const tx of broadcast.transactions) {

  //   export type ParsedContractConfig = {
  //     contract: string;
  //     address: string;
  //     kind: ContractKind;
  //     variables: ParsedConfigVariables;
  //     constructorArgs: ParsedConfigVariables;
  //     unsafeAllowEmptyPush?: boolean;
  //     unsafeAllowFlexibleConstructor?: boolean;
  // };

  parsedContractConfigs[tx.contractName] = {
    contract: TODO
    address: ethers.utils.getCreate2Address(managerAddress, ethers.constants.HashZero, ethers.utils.keccak256())
  }
}

const [buildInfoFileName] = fs.readdirSync(tmpDir)
const buildInfoPath = path.join(tmpDir, buildInfoFileName)

const buildInfo = readBuildInfo(buildInfoPath)

// TODO: what are we going to do about the salt of the contracts?

// TODO: the contract addresses in the constructor args will be incorrect

// TODO: rm .chugsplash-internal file
