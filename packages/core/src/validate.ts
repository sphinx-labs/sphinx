import { ethers } from 'ethers'
import { SphinxManagerABI } from '@sphinx-labs/contracts'
import { decodeAllSync } from 'cbor'

import {
  ConfigArtifacts,
  ConfigCache,
  ParsedConfig,
  SphinxFunctionSignature,
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
  flattenCallFrames,
  getCallHash,
  getEncodedConstructorArgs,
  getTransactionHashesInRange,
  isEarlierThan,
  isEventLog,
  isSupportedChainId,
  remove0x,
  sortCallFrameTimes,
} from './utils'
import { CallFrameTime } from './types'
import { DEFAULT_CREATE3_ADDRESS, getSphinxRegistryAddress } from './addresses'
import 'core-js/features/array/at'

// TODO(docs): we prefer `debug_traceTransaction` to `trace_transaction` because it's supported by
// more execution clients (e.g. geth)

// TODO(docs): everywhere

// TODO(output):
// -output for deployments: result (i.e. match / no match+reason), pretty constructor signature,
// contract address, deployment txn hash, block explorer link to the address

// TODO(output):
// -output for calls: result (i.e. match / no match+reason), pretty function call, txn hash, block
// explorer link to the txn
// - there shouldn't be a redundant '- Address' field if `referenceNameOrAddress` is an address.

// TODO(output): remember to log whether or not any extra transactions were found during execution.

// TODO(output): make sure you handle each of these cases.
export enum ActionValidationResultType {
  EXACT_MATCH,
  SIMILAR_MATCH,
  NOT_EXECUTED_YET,
  NO_MATCH,
  INCORRECT_ORDER,
}

export enum TransactionCountValidation {
  CORRECT,
  INCORRECT,
  NO_ATTEMPT__INVALID_ACTIONS,
  NO_ATTEMPT__MULTIPLE_DEPLOYMENT_IDS,
}

export type ValidationOutput = {
  actionValidation: Array<ActionValidationOutput>
  transactionCountValidation: TransactionCountValidation
}

export type ActionValidationOutput =
  | {
      match: Omit<
        ActionValidationResultType,
        ActionValidationResultType.NOT_EXECUTED_YET
      >
      functionSignature: SphinxFunctionSignature
      address: string
      transactionHash: string
    }
  // Skipped contract deployment:
  | {
      match: ActionValidationResultType.NOT_EXECUTED_YET
      functionSignature: SphinxFunctionSignature
    }

// TODO(task): consider wrapping `validate` in a Promise.any instead of Promise.all. e.g. say one rpc url
// out of 5 doesn't support debug_traceTransaction. the user will probably need to run the command all
// over again. not sure what promise.any actually does.
export const validate = async (
  provider: SphinxJsonRpcProvider,
  parsedConfig: ParsedConfig,
  actionBundle: SphinxActionBundle,
  configArtifacts: ConfigArtifacts,
  configCache: ConfigCache
): Promise<ValidationOutput> => {
  const latestBlock = await provider.getBlock('latest')
  if (!latestBlock) {
    throw new Error(`Failed to retrieve latest block. Should never happen.`)
  }
  const randomTransactionHash = latestBlock.transactions.at(0)
  if (randomTransactionHash === undefined) {
    throw new Error(`Block contains zero transactions. Should never happen.`)
  }
  try {
    await provider.send('trace_transaction', [randomTransactionHash])
  } catch (e) {
    throw new Error(
      `Your RPC url for ${configCache.networkName} does not allow 'debug_traceTransaction' RPC calls, which\n` +
        `is required to validate your config. Reason:\n` +
        `${e.message}`
    )
  }

  // TODO(test): case: a new live network you add doesn't support `debug_traceTransaction`. you
  // should probably have a sanity check somewhere 

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
    throw new Error(`Unsupported chain ID: ${chainId}. Should never happen.`)
  }

  // TODO(docs): this will contain the set of deployment IDs for every contract deployment and
  // post-deployment action executed in the config.
  const deploymentIds = new Set<string>()
  const callFrameTimes: Array<CallFrameTime> = []
  const actionValidation: Array<ActionValidationOutput> = []

  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { isTargetDeployed } = configCache.contractConfigCache[referenceName]
    const constructorSignature: SphinxFunctionSignature = {
      referenceNameOrAddress: referenceName,
      functionName: 'constructor',
      variables: contractConfig.constructorArgs,
    }

    if (!isTargetDeployed) {
      actionValidation.push({
        match: ActionValidationResultType.NOT_EXECUTED_YET,
        functionSignature: constructorSignature,
      })
      continue
    }

    const expectedAddress = contractConfig[referenceName].address
    const action = deploymentActions.find(
      (_action) =>
        expectedAddress ===
        getCreate3Address(sphinxManagerAddress, _action.salt)
    )

    if (!action) {
      throw new Error(
        `Action not found for ${referenceName}. Should never happen.`
      )
    }

    const deploymentEvents = await SphinxManager.queryFilter(
      SphinxManager.filters.ContractDeployed(expectedAddress)
    )
    if (deploymentEvents.length === 0) {
      // If the contract wasn't deployed, the config cache should reflect that, so this should
      // have been caught earlier in this function.
      throw new Error(
        `No deployment events found for ${referenceName}. Should never happen.`
      )
    } else if (deploymentEvents.length > 1) {
      // Only one contract can be deployed at a given address, so this should never happen.
      throw new Error(
        `More than one deployment event found for ${referenceName}. Should never happen.`
      )
    }
    const deploymentEvent = deploymentEvents[0]

    // Narrow the TypeScript type of `deploymentEvent`.
    if (!isEventLog(deploymentEvent)) {
      throw new Error(
        `Deployment event for ${referenceName} is not an event log. Should never happen.`
      )
    }

    deploymentIds.add(deploymentEvent.args.deploymentId)

    const { blockNumber, transactionHash, transactionIndex } = deploymentEvent

    const receipt = await provider.getTransactionReceipt(transactionHash)
    // Narrow the TypeScript type of `receipt`.
    if (!receipt) {
      // This should never happen because we got the transaction hash from an event that was queried
      // earlier in this function.
      throw new Error(
        `Failed to retrieve transaction receipt for ${transactionHash}. Should never happen.`
      )
    } else if (receipt.status === 0) {
      // A `status` of `0` means the transaction reverted. This should never happen because the
      // there was a `ContractDeployed` event associated with this transaction (shown above). This
      // means the transaction should have succeeded.
      throw new Error(
        `Transaction ${transactionHash} reverted. Should never happen.`
      )
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
      // TODO(docs): exact match
      deploymentCallFrame = flattenedCallFrames[callFrameIndexExactMatch]
      callFrameIndex = callFrameIndexExactMatch

      actionValidation.push({
        match: ActionValidationResultType.EXACT_MATCH,
        functionSignature: constructorSignature,
        address: expectedAddress,
        transactionHash,
      })
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
        // TODO(docs): could be b/c of local differences in the contract's source code, or it
        // could be b/c there's an embedded metadata hash that's different (if the contract deploys
        // another contract), or it could be b/c our system has a bug
        actionValidation.push({
          match: ActionValidationResultType.NO_MATCH,
          functionSignature: constructorSignature,
          address: expectedAddress,
          transactionHash,
        })
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
        throw new Error(
          `Failed to decode metadata hash for ${referenceName}. Should never happen.`
        )
      }

      actionValidation.push({
        match: ActionValidationResultType.SIMILAR_MATCH,
        functionSignature: constructorSignature,
        address: expectedAddress,
        transactionHash,
      })
    }

    callFrameTimes.push({
      blockNumber,
      transactionIndex,
      callFrameIndex,
    })
  }

  let previousCallFrameTime: CallFrameTime = {
    blockNumber: 0,
    transactionIndex: 0,
    callFrameIndex: 0,
  }
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
      actionValidation.push({
        match: ActionValidationResultType.NOT_EXECUTED_YET,
        functionSignature: action.readableSignature,
      })
      continue
    }

    const callHash = getCallHash(action.to, action.data)
    const callEvents = await SphinxManager.queryFilter(
      SphinxManager.filters.CallExecuted(undefined, callHash)
    )

    if (callEvents.length === 0) {
      // If the call wasn't executed, the config cache should reflect that, so this should have been
      // caught earlier in this function.
      throw new Error(
        `No call events found on ${configCache.networkName}. Should never happen.`
      )
    } else if (configCache.callNonces[callHash] !== callEvents.length) {
      // The number of events should always match the number of times this call was executed.
      throw new Error(
        `The number of call events does not match the number of times the call was\n` +
          `executed on ${configCache.networkName}. Should never happen.`
      )
    }
    // TODO(docs): The `queryFilter` function returns an array of elements from least to most recent.
    const callEvent = callEvents[action.nonce]

    // Narrow the TypeScript type of `callEvent`.
    if (!isEventLog(callEvent)) {
      throw new Error(`Call event is not an event log. Should never happen.`)
    }

    deploymentIds.add(callEvent.args.deploymentId)

    const { transactionHash, blockNumber, transactionIndex } = callEvent

    const receipt = await provider.getTransactionReceipt(transactionHash)
    if (!receipt) {
      // This should never happen because we got the transaction hash from an event that was queried
      // earlier in this function.
      throw new Error(
        `Failed to retrieve transaction receipt for ${transactionHash}. Should never happen.`
      )
    } else if (receipt.status === 0) {
      // A `status` of `0` means the transaction reverted. This should never happen because the
      // there was a `CallExecuted` event associated with this transaction (shown above). This means
      // the transaction should have succeeded.
      throw new Error(
        `Transaction ${transactionHash} reverted. Should never happen.`
      )
    }

    const rootCallFrame: CallFrame = await provider.send(
      'debug_traceTransaction',
      [transactionHash, { tracer: 'callTracer' }]
    )

    const flattenedCallFrames = flattenCallFrames(rootCallFrame)

    const callFrameIndex = flattenedCallFrames.findIndex(
      (frame: CallFrame): boolean =>
        frame.from === sphinxManagerAddress &&
        frame.to === action.to &&
        frame.input === action.data &&
        frame.type === 'CALL'
    )

    if (callFrameIndex === -1) {
      actionValidation.push({
        match: ActionValidationResultType.NO_MATCH,
        functionSignature: action.readableSignature,
        address: action.to,
        transactionHash,
      })
      continue
    }

    const currentCallFrameTime: CallFrameTime = {
      blockNumber,
      transactionIndex,
      callFrameIndex,
    }
    callFrameTimes.push(currentCallFrameTime)
    // TODO(docs): explain that this is "later than or equal to"
    if (!isEarlierThan(currentCallFrameTime, previousCallFrameTime)) {
      actionValidation.push({
        match: ActionValidationResultType.INCORRECT_ORDER,
        functionSignature: action.readableSignature,
        address: action.to,
        transactionHash,
      })
    }
    previousCallFrameTime = currentCallFrameTime
  }

  const isValidConfig = actionValidation.every(
    (output) =>
      output.match === ActionValidationResultType.EXACT_MATCH ||
      output.match === ActionValidationResultType.SIMILAR_MATCH
  )

  // TODO(ci): we may need an alchemy api key in CI that's on the paid tier.

  // TODO(docs): not sure where this is relevant: it's worth mentioning that
  // `latestCallFrameTime` will contain the latest call action even if the actions weren't
  // executed in ascending order.

  if (!isValidConfig) {
    // TODO(docs): we return here to avoid unnecessary rpc calls.

    return {
      actionValidation,
      transactionCountValidation:
        TransactionCountValidation.NO_ATTEMPT__INVALID_ACTIONS,
    }
  }

  if (deploymentIds.size > 1) {
    return {
      actionValidation,
      transactionCountValidation:
        TransactionCountValidation.NO_ATTEMPT__MULTIPLE_DEPLOYMENT_IDS,
    }
  }

  // TODO(optimize): use rpc batch provider
  // TODO(optimize): promise.all

  const sortedCallFrameTimes = sortCallFrameTimes(callFrameTimes)
  const earliestCallFrameTime = sortedCallFrameTimes.at(0)
  const latestCallFrameTime = sortedCallFrameTimes.at(-1)

  if (
    earliestCallFrameTime === undefined ||
    latestCallFrameTime === undefined
  ) {
    throw new Error(
      `TODO: catch this earlier. can probably happen if nothing's been executed yet`
    )
  }

  const transactionHashes = await getTransactionHashesInRange(
    provider,
    earliestCallFrameTime.blockNumber,
    earliestCallFrameTime.transactionIndex,
    latestCallFrameTime.blockNumber,
    latestCallFrameTime.transactionIndex
  )

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
    return {
      actionValidation,
      transactionCountValidation: TransactionCountValidation.INCORRECT,
    }
  }

  return {
    actionValidation,
    transactionCountValidation: TransactionCountValidation.CORRECT,
  }
}
