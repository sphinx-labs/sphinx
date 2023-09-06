import { ethers } from 'ethers'
import { SphinxManagerABI } from '@sphinx-labs/contracts'
import { decodeAllSync } from 'cbor'

import {
  ConfigArtifacts,
  ConfigCache,
  ParsedConfig,
  getCreate3Address,
} from './config'
import { SphinxJsonRpcProvider } from './provider'
import {
  SphinxActionBundle,
  fromRawSphinxAction,
  isDeployContractAction,
} from './actions'
import { CallFrame } from './languages/solidity/types'
import {
  callActionWasExecuted,
  getCallHash,
  getEncodedConstructorArgs,
  isEventLog,
  isSupportedChainId,
  remove0x,
} from './utils'
import { CallFrameTime } from './types'
import { DEFAULT_CREATE3_ADDRESS, getSphinxRegistryAddress } from './addresses'

// TODO(docs): we prefer `debug_traceTransaction` to `trace_transaction` because it's supported by
// more execution clients (e.g. geth)

export const flattenCallFrames = (
  rootCallFrame: CallFrame
): Array<CallFrame> => {
  const callFrames: Array<CallFrame> = []

  const flatten = (child: CallFrame): void => {
    callFrames.push(child)

    for (const childCallFrame of child.calls) {
      flatten(childCallFrame)
    }
  }

  flatten(rootCallFrame)

  return callFrames
}

// TODO(docs): everywhere
export const validate = async (
  provider: SphinxJsonRpcProvider,
  parsedConfig: ParsedConfig,
  actionBundle: SphinxActionBundle,
  configArtifacts: ConfigArtifacts,
  configCache: ConfigCache
): void => {
  try {
    await provider.send('trace_transaction', [ethers.ZeroHash])
  } catch (e) {
    // TODO: handle error
  }

  const deploymentActions = actionBundle.actions
    .map((rawAction) => fromRawSphinxAction(rawAction.action))
    .filter(isDeployContractAction)

  const sphinxManagerAddress = parsedConfig.manager
  const SphinxManager = new ethers.Contract(
    sphinxManagerAddress,
    SphinxManagerABI,
    provider
  )

  const chainId = configCache.chainId

  if (!isSupportedChainId(chainId)) {
    throw new Error(`TODO: should never happen`)
  }

  // TODO(docs): this will contain the set of deployment IDs for every contract deployment and
  // post-deployment action executed in the config.
  const deploymentIds = new Set<string>()

  let firstContractDeployment: {
    time: CallFrameTime
    txnHash: string
  } = {
    time: { blockNumber: 0, transactionIndex: 0, callFrameIndex: 0 },
    txnHash: '',
  }
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { isTargetDeployed } = configCache.contractConfigCache[referenceName]

    if (!isTargetDeployed) {
      // TODO: handle this
      continue
    }

    const expectedAddress = contractConfig[referenceName].address
    const action = deploymentActions.find(
      (_action) =>
        expectedAddress ===
        getCreate3Address(sphinxManagerAddress, _action.salt)
    )

    if (!action) {
      // TODO: throw error, should never happen.
      throw new Error(`TODO`)
    }

    const deploymentEvents = await SphinxManager.queryFilter(
      SphinxManager.filters.ContractDeployed(expectedAddress)
    )
    if (deploymentEvents.length === 0) {
      // TODO: handle this
    } else if (deploymentEvents.length > 1) {
      // TODO: handle this
    }
    const deploymentEvent = deploymentEvents[0]
    if (!isEventLog(deploymentEvent)) {
      // TODO: should never happen
      continue
    }

    deploymentIds.add(deploymentEvent.args.deploymentId)

    const { blockNumber, transactionHash, transactionIndex } = deploymentEvent

    const receipt = await provider.getTransactionReceipt(transactionHash)
    if (!receipt) {
      // TODO: handle this. should never happen b/c we got the txn hash from an event
    } else if (receipt.status === 0) {
      // TODO: handle this. 'status = 0' means the transaction reverted. should never happen b/c the
      // presence of the 'ContractDeployed' event means the transaction should have succeeded.
    }

    const rootCallFrame: CallFrame = await provider.send(
      'debug_traceTransaction',
      [transactionHash, { tracer: 'callTracer' }]
    )

    const flattenedCallFrames = flattenCallFrames(rootCallFrame)

    const callFrameIndexExactMatch = flattenedCallFrames.findIndex(
      (callFrame: CallFrame): boolean =>
        callFrame.input === action.creationCodeWithConstructorArgs &&
        callFrame.to === expectedAddress &&
        callFrame.type === 'CREATE'
    )

    let deploymentCallFrame: CallFrame | undefined
    let callFrameIndex: number | undefined
    if (callFrameIndexExactMatch !== -1) {
      // TODO: exact match :)
      deploymentCallFrame = flattenedCallFrames[callFrameIndexExactMatch]
      callFrameIndex = callFrameIndexExactMatch
    } else {
      // TODO(docs): couldn't find an exact match. the most likely reason is that the contract's
      // metadata hash is slightly different on the user's local machine than it was when the
      // contract was deployed. a different metadata hash doesn't impact the behavior of the
      // contract, but it does mean that there is a mismatch in the compiler inputs (e.g. compiler
      // settings, natspec docs, source files, etc.). for a detailed description of the metadata,
      // see here: https://docs.soliditylang.org/en/latest/metadata.html

      // TODO(docs): we proceed by checking if there's a contract that matches the contract's
      // creation code and constructor args, excluding the metadata hash.

      const expectedCreationCodeWithoutConstructorArgs =
        configArtifacts[referenceName].artifact.bytecode

      const expectedConstructorArgs = remove0x(
        getEncodedConstructorArgs(
          contractConfig[referenceName].constructorArgs,
          configArtifacts[referenceName].artifact.abi
        )
      )

      // TODO(docs): get the last two bytes of the expected creation code without constructor args
      const encodedMetadataLengthHex = ethers.dataSlice(
        expectedCreationCodeWithoutConstructorArgs,
        -2
      )
      const encodedMetadataLength = Number(encodedMetadataLengthHex)
      const expectedCreationCodeWithoutMetadataHash = ethers.dataSlice(
        expectedCreationCodeWithoutConstructorArgs,
        -(encodedMetadataLength + 2),
        -2
      )

      const callFrameIndexSimilarMatch = flattenedCallFrames.findIndex(
        (callFrame: CallFrame): boolean =>
          callFrame.input.startsWith(expectedCreationCodeWithoutMetadataHash) &&
          callFrame.input.endsWith(expectedConstructorArgs) &&
          callFrame.to === expectedAddress &&
          callFrame.type === 'CREATE'
      )

      if (callFrameIndexSimilarMatch === -1) {
        // TODO: handle this. could be b/c of local differences in the contract's source code, or it
        // could be b/c there's an embedded metadata hash that's different (if the contract deploys
        // another contract), or it could be b/c our system has a bug
        continue
      }
      deploymentCallFrame = flattenedCallFrames[callFrameIndexSimilarMatch]
      callFrameIndex = callFrameIndexSimilarMatch

      // TODO(docs): Sanity check that a valid metadata hash exists at the end of the creation code
      // and before the encoded constructor arguments.
      const actualCreationCode = deploymentCallFrame.input
      const encodedMetadata = actualCreationCode
        // TODO(docs): remove the constructor args from the end of the actual creation code
        .slice(0, -expectedConstructorArgs.length)
        // TODO(docs): remove the contract's creation bytecode from the beginning of the actual
        // creation code
        .slice(expectedCreationCodeWithoutConstructorArgs.length)

      const decodedMetadata = decodeAllSync(encodedMetadata)

      if (decodedMetadata.length === 0) {
        // TODO: handle this case. should never happen.
      }

      // TODO: handle similar match here
    }

    if (
      isEarlierThan(
        {
          blockNumber,
          transactionIndex,
          callFrameIndex,
        },
        firstContractDeployment.time
      )
    ) {
      firstContractDeployment = {
        txnHash: transactionHash,
        time: { blockNumber, transactionIndex, callFrameIndex },
      }
    }
  }

  // TODO(test): no post-deployment actions in config
  // TODO(test): no contract deployments in config

  let lastCallAction: {
    time: CallFrameTime
    txnHash: string
  } = {
    time: { blockNumber: 0, transactionIndex: 0, callFrameIndex: 0 },
    txnHash: '',
  }
  let callsExecutedInAscendingOrder: boolean = true
  const postDeployActions = parsedConfig.postDeploy[chainId] ?? []
  for (const action of postDeployActions) {
    if (
      !callActionWasExecuted(
        action.to,
        action.data,
        action.nonce,
        configCache.callNonces
      )
    ) {
      // TODO: handle this
    }

    const callHash = getCallHash(action.to, action.data)
    const callEvents = await SphinxManager.queryFilter(
      SphinxManager.filters.CallExecuted(undefined, callHash)
    )

    const numExecutions = configCache.callNonces[callHash]
    if (callEvents.length === 0) {
      // TODO: handle this
    } else if (numExecutions !== callEvents.length) {
      // TODO: handle this. should never happen.
    }
    // TODO(docs): The `queryFilter` function returns an array of elements from least to most recent.
    const callEvent = callEvents[action.nonce]

    if (!isEventLog(callEvent)) {
      // TODO: should never happen
      continue
    }

    deploymentIds.add(callEvent.args.deploymentId)

    const { transactionHash, blockNumber, transactionIndex } = callEvent

    const receipt = await provider.getTransactionReceipt(transactionHash)
    if (!receipt) {
      // TODO: handle this. should never happen b/c we got the txn hash from an event
    } else if (receipt.status === 0) {
      // TODO: handle this. 'status = 0' means the transaction reverted. should never happen b/c the
      // presence of the 'CallExecuted' event means the transaction should have succeeded.
    }

    const rootCallFrame: CallFrame = await provider.send(
      'debug_traceTransaction',
      [transactionHash, { tracer: 'callTracer' }]
    )

    const flattenedCallFrames = flattenCallFrames(rootCallFrame)

    const callFrameIndex = flattenedCallFrames.findIndex(
      (callFrame: CallFrame): boolean =>
        callFrame.from === sphinxManagerAddress &&
        callFrame.to === action.to &&
        callFrame.input === action.data &&
        callFrame.type === 'CALL'
    )

    if (callFrameIndex === -1) {
      // TODO: handle
    }

    const callFrameExactMatch = flattenedCallFrames[callFrameIndex]

    // valid if: blockNumber > latest.blockNumber OR
    // (blockNumber === latest.blockNumber AND (
    //     transactionIndex > latest.transactionIndex OR
    //     (transactionIndex === latest.transactionIndex AND callFrameIndex > latest.callFrameIndex)
    // ))
    if (
      isEarlierThan(lastCallAction.time, {
        blockNumber,
        transactionIndex,
        callFrameIndex,
      })
    ) {
      // TODO: handle action that was executed in an incorrect order
      callsExecutedInAscendingOrder = false
      // TODO: continue, otherwise `latestCallFrameTime` will be overwritten
    }

    lastCallAction = {
      txnHash: transactionHash,
      time: { blockNumber, transactionIndex, callFrameIndex },
    }

    // TODO(review): check that you `continue`/break in all of the relevant places in this function.
  }

  if (!callsExecutedInAscendingOrder) {
    // TODO: probably return here to avoid unnecessary rpc calls. it's worth mentioning that
    // `latestCallFrameTime` will contain the latest call action even if the actions weren't
    // executed in ascending order.
  }

  if (deploymentIds.size > 1) {
    // TODO
  }

  // TODO(optimize): use rpc batch provider
  // TODO(optimize): promise.all

  // TODO: i think you can remove `txnHash` from the firstContractDeployment and lastCallAction,
  // then also remove the unnecessary `time` field.

  const firstBlock = await provider.getBlock(
    firstContractDeployment.time.blockNumber
  )
  const lastBlock = await provider.getBlock(lastCallAction.time.blockNumber)

  if (!firstBlock || !lastBlock) {
    throw new Error(`TODO: should never happen`)
  }

  const transactionHashes: Array<string> = []
  if (firstBlock.number === lastBlock.number) {
    const blockTxnHashes = firstBlock.transactions.slice(
      firstContractDeployment.time.transactionIndex,
      lastCallAction.time.transactionIndex + 1
    )
    transactionHashes.push(...blockTxnHashes)
  } else {
    const firstBlockTxnHashes = firstBlock.transactions.slice(
      firstContractDeployment.time.transactionIndex
    )
    transactionHashes.push(...firstBlockTxnHashes)

    for (let i = firstBlock.number + 1; i < lastBlock.number; i++) {
      const block = await provider.getBlock(i)
      if (!block) {
        throw new Error(`TODO: should never happen`)
      }
      transactionHashes.push(...block.transactions)
    }

    // TODO(docs): + 1 means inclusive
    const lastBlockTxnHashes = lastBlock.transactions.slice(
      0,
      lastCallAction.time.transactionIndex + 1
    )
    transactionHashes.push(...lastBlockTxnHashes)
  }

  const ignoredToAddresses = [
    getSphinxRegistryAddress(),
    DEFAULT_CREATE3_ADDRESS,
  ]
  let numTxnsFromSphinxManager = 0
  for (const transactionHash of transactionHashes) {
    const rootCallFrame: CallFrame = await provider.send(
      'debug_traceTransaction',
      [transactionHash, { tracer: 'callTracer' }]
    )
    const flattenedCallFrames = flattenCallFrames(rootCallFrame)
    for (const callFrame of flattenedCallFrames) {
      if (
        callFrame.from === sphinxManagerAddress &&
        !ignoredToAddresses.includes(callFrame.to)
      ) {
        numTxnsFromSphinxManager += 1
      }
    }
  }

  const expected = 2 * deploymentActions.length + postDeployActions.length

  if (numTxnsFromSphinxManager !== expected) {
    // TODO: output the expected and actual number of transactions
  }
}
