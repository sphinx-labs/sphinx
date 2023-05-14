import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

import { ethers } from 'ethers'
import {
  ConfigArtifacts,
  ParsedContractConfigs,
  chugsplashProposeAbstractTask,
  getChugSplashManagerAddress,
  getCreate3Address,
  readBuildInfo,
} from '@chugsplash/core'
import { remove0x } from '@eth-optimism/core-utils'
import { findAll, isNodeType } from 'solidity-ast/utils'

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

const [buildInfoFileName] = fs.readdirSync(tmpDir)
const buildInfoPath = path.join(tmpDir, buildInfoFileName)

const buildInfo = readBuildInfo(buildInfoPath)

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
      // TODO: make it clear that this is because there are two contracts with the same name in this repo. change one to fix the error.
      `Could not find contract name. Please report this error to the ChugSplash team.`
    )
  }

  const create3Address = getCreate3Address(
    managerAddress,
    projectName,
    contractName,
    ethers.constants.HashZero
  )

  for (const tx of broadcast.transactions) {
    // Replace all instances of the current contract address with the new Create3 address
    tx.transaction.data = tx.transaction.data
      .split(remove0x(tx.contractAddress))
      .join(remove0x(create3Address))
  }

  const potentialSourceNames: string[] = []
  for (const [currSourceName, outputSource] of Object.entries(
    buildInfo.output.sources
  )) {
    for (const _ of findAll(
      ['ContractDefinition'],
      outputSource.ast,
      (node) =>
        isNodeType('ContractDefinition', node) && node.name === contractName
    )) {
      potentialSourceNames.push(currSourceName)
    }
  }

  if (potentialSourceNames.length === 0) {
    throw new Error(`Could not find source name for ${contractName}.`)
  } else if (potentialSourceNames.length > 1) {
    throw new Error(
      `Found multiple source names for ${contractName}: ${potentialSourceNames.join(
        ', '
      )}`
    )
  }

  const sourceName = potentialSourceNames[0]

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
    contract: `${sourceName}:${contractName}`,
    address: create3Address,
    kind: 'no-proxy',

  }
}

const configArtifacts: ConfigArtifacts = {}
for (const currTx of broadcast.transactions) {
  const contractName = currTx.contractName as string
  configArtifacts[contractName] = {
    buildInfo,
    artifact: {
      sourceName,
      contractName,
      creationCodeWithConstructorArgs: currTx.transaction.data,
    },
  }
}

// await chugsplashProposeAbstractTask(
//   provider,
//   wallet,
//   config,
//   configPath,
//   ipfsUrl,
//   'foundry',
//   configArtifacts,
//   canonicalConfigPath,
//   cre
// )

// TODO: replace all instances of addresses before calculating the real create3 address of each contract

// TODO: we should have the fully qualified name instead of the contractName

// TODO: remove .chugsplash-internal directory when the script is done. also turn off the anvil instance

// TODO: i don't think this works if there are two generated build info files

// TODO: throw an error if you read more than one build info file. this'd happen in e.g. optimism's repo
