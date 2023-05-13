import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

import { ethers } from 'ethers'
import {
  ParsedContractConfigs,
  getChugSplashManagerAddress,
  getCreate3Address,
  readBuildInfo,
} from '@chugsplash/core'
import { remove0x } from '@eth-optimism/core-utils'

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
    projectName: string
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
  if (tx.transactionType !== 'CREATE') {
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

const { organizationID, projectName } = minimalConfig.options
const managerAddress = getChugSplashManagerAddress(organizationID)
const parsedContractConfigs: ParsedContractConfigs = {}
for (const currTx of broadcast.transactions) {
  const { contractName } = currTx
  if (typeof contractName !== 'string') {
    throw new Error(
      `Could not find contract name. Please report this error to the ChugSplash team.`
    )
  }

  const newAddress = getCreate3Address(
    managerAddress,
    projectName,
    contractName,
    ethers.constants.HashZero
  )

  for (const tx of broadcast.transactions) {
    // Replace all instances of the current contract address with the new Create3 address
    tx.transaction.data = tx.transaction.data
      .split(remove0x(tx.contractAddress))
      .join(remove0x(newAddress))
  }

  //   export type ParsedContractConfig = {
  //     contract: string;
  //     address: string;
  //     kind: ContractKind;
  //     variables: ParsedConfigVariables;
  //     constructorArgs: ParsedConfigVariables;
  //     unsafeAllowEmptyPush?: boolean;
  //     unsafeAllowFlexibleConstructor?: boolean;
  // };

  // parsedContractConfigs[tx.contractName] = {
  //   contract: TODO
  //   address: ethers.utils.getCreate2Address(managerAddress, ethers.constants.HashZero, ethers.utils.keccak256())
  // }
}

const [buildInfoFileName] = fs.readdirSync(tmpDir)
const buildInfoPath = path.join(tmpDir, buildInfoFileName)

const buildInfo = readBuildInfo(buildInfoPath)

// TODO: replace all instances of addresses before calculating the real create3 address of each contract

// TODO: we should have the fully qualified name instead of the contractName

// TODO: remove .chugsplash-internal directory when the script is done. also turn off the anvil instance
