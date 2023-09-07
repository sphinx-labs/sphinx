import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { ethers } from 'ethers'

import {
  arraysEqual,
  equal,
  flattenCallFrames,
  getTransactionHashesInRange,
  isEarlierThan,
  isEqualTo,
  isLaterThan,
  isUserFunctionOptions,
} from '../src/utils'
import { CallFrame } from '../src/languages'
import { SphinxJsonRpcProvider } from '../src/provider'
import {
  INCORRECT_ORDER_OF_BLOCK_NUMBERS_AND_TRANSACTION_INDICES,
  failedToGetBlock,
} from '../src/config/validation-error-messages'

chai.use(chaiAsPromised)
const expect = chai.expect

describe('Utils', () => {
  describe('isUserFunctionOptions', () => {
    it('returns false for undefined arg', () => {
      expect(isUserFunctionOptions(undefined)).to.equal(false)
    })

    it('returns false for boolean', () => {
      expect(isUserFunctionOptions(false)).to.equal(false)
      expect(isUserFunctionOptions(true)).to.equal(false)
    })

    it('returns false for number', () => {
      expect(isUserFunctionOptions(1)).to.equal(false)
      expect(isUserFunctionOptions(0)).to.equal(false)
    })

    it('returns false for string', () => {
      expect(isUserFunctionOptions('')).to.equal(false)
      expect(isUserFunctionOptions('test')).to.equal(false)
    })

    it('returns false for object that contains invalid overrides field', () => {
      expect(
        isUserFunctionOptions({
          overrides: [{ incorrectField: 1, chains: ['goerli'] }],
        })
      ).to.equal(false)
    })

    it('returns true for valid UserFunctionOptions', () => {
      expect(
        isUserFunctionOptions({
          overrides: [{ args: {}, chains: ['goerli'] }],
        })
      ).to.equal(true)
    })
  })

  describe('equal', () => {
    it('returns true for two empty objects', () => {
      expect(equal({}, {})).to.equal(true)
    })

    it('returns true for two empty arrays', () => {
      expect(equal([], [])).to.equal(true)
    })

    it('returns false for empty object and empty array', () => {
      expect(equal({}, [])).to.equal(false)
    })

    it('returns false for empty array and empty object', () => {
      expect(equal([], {})).to.equal(false)
    })

    it('returns true for two equal strings', () => {
      expect(equal('test', 'test')).to.equal(true)
    })

    it('returns false for two unequal strings', () => {
      expect(equal('test', 'test2')).to.equal(false)
    })

    it('returns true for two equal arrays', () => {
      expect(equal(['test', 'test2'], ['test', 'test2'])).to.equal(true)
    })

    it('returns false for two unequal arrays', () => {
      expect(equal(['test', 'test2'], ['test', 'test3'])).to.equal(false)
    })

    it('returns true for two equal objects', () => {
      expect(equal({ test: 'testVal' }, { test: 'testVal' })).to.equal(true)
    })

    it('returns false for two objects with different values', () => {
      expect(equal({ test: 'testVal' }, { test: 'testVal2' })).to.equal(false)
    })

    it('returns false for two objects with different keys', () => {
      expect(equal({ test: 'testVal' }, { test2: 'testVal' })).to.equal(false)
    })

    it('returns false for two objects with different numbers of keys', () => {
      expect(
        equal({ test: 'testVal', test2: 'testVal' }, { test: 'testVal' })
      ).to.equal(false)
    })

    it('returns true for two equal nested objects', () => {
      expect(
        equal({ test: { test2: 'testVal' } }, { test: { test2: 'testVal' } })
      ).to.equal(true)
    })

    it('returns false for two unequal nested objects', () => {
      expect(
        equal({ test: { test2: 'testVal' } }, { test: { test2: 'testVal2' } })
      ).to.equal(false)
    })

    it('returns true for two equal nested arrays', () => {
      expect(
        equal(
          { test: ['testVal', 'testVal2'] },
          { test: ['testVal', 'testVal2'] }
        )
      ).to.equal(true)
    })

    it('returns false for two unequal nested arrays', () => {
      expect(
        equal(
          { test: ['testVal', 'testVal2'] },
          { test: ['testVal', 'testVal3'] }
        )
      ).to.equal(false)
    })

    it('returns true for two equal nested objects and arrays', () => {
      expect(
        equal(
          { test: ['testVal', { test2: 'testVal2' }] },
          { test: ['testVal', { test2: 'testVal2' }] }
        )
      ).to.equal(true)
    })

    it('returns false for two unequal nested objects and arrays', () => {
      expect(
        equal(
          { test: ['testVal', { test2: 'testVal2' }] },
          { test: ['testVal', { test2: 'testVal3' }] }
        )
      ).to.equal(false)
    })

    it('returns true for two equal booleans', () => {
      expect(equal(true, true)).to.equal(true)
      expect(equal(false, false)).to.equal(true)
    })

    it('returns false for two unequal booleans', () => {
      expect(equal(true, false)).to.equal(false)
      expect(equal(false, true)).to.equal(false)
    })
  })

  describe('arraysEqual', () => {
    it('returns true for two empty arrays', () => {
      expect(arraysEqual([], [])).to.equal(true)
    })

    it('returns false for empty array and non-empty array', () => {
      expect(arraysEqual([], ['test'])).to.equal(false)
    })

    it('returns false for non-empty array and empty array', () => {
      expect(arraysEqual(['test'], [])).to.equal(false)
    })

    it('returns true for two equal arrays', () => {
      expect(arraysEqual(['test', 'test2'], ['test', 'test2'])).to.equal(true)
    })

    it('returns false for two unequal arrays', () => {
      expect(arraysEqual(['test', 'test2'], ['test', 'test3'])).to.equal(false)
    })

    it('returns false if first array is longer than the second array', () => {
      expect(arraysEqual(['test', 'test2'], ['test'])).to.equal(false)
    })

    it('returns false if the first array is shorter than the second array', () => {
      expect(arraysEqual(['test'], ['test', 'test2'])).to.equal(false)
    })

    it('returns true for two equal ParsedConfigVariables', () => {
      expect(
        arraysEqual(
          [
            {
              name: 'test',
              type: 'uint256',
              value: '1',
            },
          ],
          [
            {
              name: 'test',
              type: 'uint256',
              value: '1',
            },
          ]
        )
      ).to.equal(true)
    })

    it('returns false for two unequal ParsedConfigVariables', () => {
      expect(
        arraysEqual(
          [
            {
              name: 'test',
              type: 'uint256',
              value: '1',
            },
          ],
          [
            {
              name: 'test',
              type: 'uint256',
              value: '2',
            },
          ]
        )
      ).to.equal(false)
    })
  })

  describe('isEarlierThan', () => {
    it('returns true if earlier block number', () => {
      expect(
        isEarlierThan(
          {
            blockNumber: 1,
            transactionIndex: 0,
            callFrameIndex: 0,
          },
          {
            blockNumber: 2,
            transactionIndex: 0,
            callFrameIndex: 0,
          }
        )
      ).to.equal(true)
    })

    it('returns true if equal block number and earlier transaction index', () => {
      expect(
        isEarlierThan(
          {
            blockNumber: 1,
            transactionIndex: 0,
            callFrameIndex: 0,
          },
          {
            blockNumber: 1,
            transactionIndex: 1,
            callFrameIndex: 0,
          }
        )
      ).to.equal(true)
    })

    it('returns true if equal block number, equal transaction index, earlier call frame index', () => {
      expect(
        isEarlierThan(
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 2,
          },
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          }
        )
      ).to.equal(true)
    })
    it('returns false if exact match', () => {
      expect(
        isEarlierThan(
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          },
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          }
        )
      ).to.equal(false)
    })

    it('returns false if later block number, earlier transaction index, and earlier call frame index', () => {
      expect(
        isEarlierThan(
          {
            blockNumber: 2,
            transactionIndex: 0,
            callFrameIndex: 0,
          },
          {
            blockNumber: 1,
            transactionIndex: 1,
            callFrameIndex: 1,
          }
        )
      ).to.equal(false)
    })

    it('returns false if equal block number, later transaction index, and earlier call frame index', () => {
      expect(
        isEarlierThan(
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 0,
          },
          {
            blockNumber: 1,
            transactionIndex: 1,
            callFrameIndex: 1,
          }
        )
      ).to.equal(false)
    })

    it('returns false if equal block number, equal transaction index, and later call frame index', () => {
      expect(
        isEarlierThan(
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          },
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 2,
          }
        )
      ).to.equal(false)
    })
  })

  describe('flattenCallFrames', () => {
    // A CallFrame object minus the `calls` and `input` fields, which we'll fill in later.
    const callFrameFillerFields = {
      type: 'CALL' as CallFrame['type'], // Removes a TypeScript type error.
      from: ethers.ZeroAddress,
      to: ethers.ZeroAddress,
      value: '0x',
      gas: '0x',
      gasUsed: '0x',
      output: '0x',
      error: '',
      revertReason: '',
    }

    it('returns an array with a single callframe if no sub-calls exist', () => {
      const rootCallFrame: CallFrame = {
        ...callFrameFillerFields,
        input: '1',
        calls: [],
      }

      expect(flattenCallFrames(rootCallFrame)).to.deep.equal([rootCallFrame])
    })

    it('flattens a call-frame in the correct order', () => {
      const rootCallFrame: CallFrame = {
        ...callFrameFillerFields,
        input: '1',
        calls: [
          {
            ...callFrameFillerFields,
            input: '2',
            calls: [
              {
                ...callFrameFillerFields,
                input: '3',
                calls: [],
              },
              {
                ...callFrameFillerFields,
                input: '4',
                calls: [],
              },
            ],
          },
          {
            ...callFrameFillerFields,
            input: '5',
            calls: [],
          },
        ],
      }

      const flattenedCallFrames = flattenCallFrames(rootCallFrame)
      expect(flattenedCallFrames.length).to.equal(5)
      expect(flattenedCallFrames[0]).to.deep.equal(rootCallFrame)
      expect(flattenedCallFrames[1]).to.deep.equal(rootCallFrame.calls[0])
      expect(flattenedCallFrames[2]).to.deep.equal(
        rootCallFrame.calls[0].calls[0]
      )
      expect(flattenedCallFrames[3]).to.deep.equal(
        rootCallFrame.calls[0].calls[1]
      )
      expect(flattenedCallFrames[4]).to.deep.equal(rootCallFrame.calls[1])
    })
  })

  describe('isEqualTo', () => {
    it('returns true if all fields are equal', () => {
      expect(
        isEqualTo(
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          },
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          }
        )
      ).to.equal(true)
    })

    it('returns false if blockNumber is different', () => {
      expect(
        isEqualTo(
          {
            blockNumber: 2,
            transactionIndex: 2,
            callFrameIndex: 3,
          },
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          }
        )
      ).to.equal(false)
    })

    it('returns false if transaction index is different', () => {
      expect(
        isEqualTo(
          {
            blockNumber: 1,
            transactionIndex: 3,
            callFrameIndex: 3,
          },
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          }
        )
      ).to.equal(false)
    })

    it('returns false if call frame index is different', () => {
      expect(
        isEqualTo(
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 4,
          },
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          }
        )
      ).to.equal(false)
    })
  })

  describe('isLaterThan', () => {
    it('returns true if first element is later than the second element', () => {
      expect(
        isLaterThan(
          {
            blockNumber: 2,
            transactionIndex: 2,
            callFrameIndex: 3,
          },
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          }
        )
      )
    })

    it('returns false if elements are equal', () => {
      expect(
        isLaterThan(
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          },
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          }
        )
      )
    })

    it('returns false if first element is earlier than the second element', () => {
      expect(
        isLaterThan(
          {
            blockNumber: 1,
            transactionIndex: 2,
            callFrameIndex: 3,
          },
          {
            blockNumber: 2,
            transactionIndex: 2,
            callFrameIndex: 3,
          }
        )
      )
    })
  })

  describe('getTransactionHashesInRange', () => {
    class MockSphinxJsonRpcProvider extends SphinxJsonRpcProvider {
      #numTxnsInBlock: number

      constructor(numTxnsPerBlock: number) {
        super('') // Pass in an empty RPC url since it isn't used here.
        this.#numTxnsInBlock = numTxnsPerBlock
      }

      public async getBlock(blockNumber: number): Promise<ethers.Block | null> {
        if (blockNumber === Infinity || blockNumber < 0) {
          return null
        }

        const transactions: Array<string> = []
        for (let i = 0; i < this.#numTxnsInBlock; i++) {
          transactions.push(computeMockTransactionHash(blockNumber, i))
        }
        // TODO(docs): why we use 'any' here
        return {
          transactions,
          number: blockNumber,
        } as any
      }
    }

    const computeMockTransactionHash = (
      blockNumber: number,
      transactionIndex: number
    ): string => {
      const aTODO = ethers.toBeHex(transactionIndex + blockNumber * 1000)
      const bTODO = ethers.zeroPadValue(aTODO, 32)
      return bTODO
    }

    const numTxnsInBlock = 100
    const provider = new MockSphinxJsonRpcProvider(100)

    it('throws error if first block number is later than last block number', async () => {
      await expect(
        getTransactionHashesInRange(
          provider,
          2, // first block number
          0,
          1, // last block number
          0
        )
      ).to.be.rejectedWith(
        INCORRECT_ORDER_OF_BLOCK_NUMBERS_AND_TRANSACTION_INDICES
      )
    })

    it('throws error if block numbers are equal but first txn index is later than last txn index', async () => {
      await expect(
        getTransactionHashesInRange(
          provider,
          1,
          1, // first txn index
          1,
          0 // last txn index
        )
      ).to.be.rejectedWith(
        INCORRECT_ORDER_OF_BLOCK_NUMBERS_AND_TRANSACTION_INDICES
      )
    })

    it('throws error if first block number is invalid', async () => {
      await expect(
        getTransactionHashesInRange(
          provider,
          -1, // first block number
          0,
          1,
          0
        )
      ).to.be.rejectedWith(failedToGetBlock(-1))
    })

    it('throws error if last block number is invalid', async () => {
      await expect(
        getTransactionHashesInRange(
          provider,
          1,
          0,
          Infinity, // last block number
          0
        )
      ).to.be.rejectedWith(failedToGetBlock(Infinity))
    })

    it('returns single txn hash if block numbers and transaction indices are equal', async () => {
      const blockNumber = 10
      const transactionIndex = 42
      const expected = computeMockTransactionHash(blockNumber, transactionIndex)

      const transactions = await getTransactionHashesInRange(
        provider,
        blockNumber,
        transactionIndex,
        blockNumber,
        transactionIndex
      )

      expect(transactions).to.deep.equal([expected])
    })

    it('returns txn hashes for equal block numbers where first txn index is 0 and last txn index is block length - 1', async () => {
      const blockNumber = 10
      const lastTransactionIndex = numTxnsInBlock - 1

      const expected: Array<string> = []
      for (let i = 0; i <= lastTransactionIndex; i++) {
        expected.push(computeMockTransactionHash(blockNumber, i))
      }

      const transactions = await getTransactionHashesInRange(
        provider,
        blockNumber,
        0,
        blockNumber,
        lastTransactionIndex
      )

      expect(transactions.length).to.equal(numTxnsInBlock)
      expect(transactions).to.deep.equal(expected)
    })

    it('returns txn hashes for different block numbers where first txn index is 0 and last txn index is block length - 1', async () => {
      const firstBlockNumber = 1000
      const lastBlockNumber = 1250
      const lastTransactionIndex = numTxnsInBlock - 1

      const expected: Array<string> = []
      for (
        let blockNumber = firstBlockNumber;
        blockNumber <= lastBlockNumber;
        blockNumber++
      ) {
        for (let txnIndex = 0; txnIndex < numTxnsInBlock; txnIndex++) {
          expected.push(computeMockTransactionHash(blockNumber, txnIndex))
        }
      }

      const transactions = await getTransactionHashesInRange(
        provider,
        firstBlockNumber,
        0,
        lastBlockNumber,
        lastTransactionIndex
      )

      expect(transactions.length).to.equal(
        numTxnsInBlock * (lastBlockNumber - firstBlockNumber + 1)
      )
      expect(transactions).to.deep.equal(expected)
    })

    it('returns txn hashes for different block numbers where first txn index is block length - 1 and last txn index is 0', async () => {
      const firstBlockNumber = 1000
      const lastBlockNumber = 1250
      const firstTransactionIndex = numTxnsInBlock - 1
      const lastTransactionIndex = 0

      const expected: Array<string> = []
      expected.push(computeMockTransactionHash(firstBlockNumber, 99))
      for (
        let blockNumber = firstBlockNumber + 1;
        blockNumber < lastBlockNumber;
        blockNumber++
      ) {
        for (let txnIndex = 0; txnIndex < numTxnsInBlock; txnIndex++) {
          expected.push(computeMockTransactionHash(blockNumber, txnIndex))
        }
      }
      expected.push(computeMockTransactionHash(lastBlockNumber, 0))

      const transactions = await getTransactionHashesInRange(
        provider,
        firstBlockNumber,
        firstTransactionIndex,
        lastBlockNumber,
        lastTransactionIndex
      )

      expect(transactions).to.deep.equal(expected)
      const expectedNumTxns = 2 + numTxnsInBlock * (1250 - 1000 - 1)
      expect(transactions.length).to.equal(expectedNumTxns)
    })

    it('returns txn hashes for different block numbers if each block contains a single txn', async () => {
      const firstBlockNumber = 1000
      const lastBlockNumber = 1250

      const providerForBlocksWithOneTxn = new MockSphinxJsonRpcProvider(1)

      const expected: Array<string> = []
      for (
        let blockNumber = firstBlockNumber;
        blockNumber <= lastBlockNumber;
        blockNumber++
      ) {
        expected.push(computeMockTransactionHash(blockNumber, 0))
      }

      const transactions = await getTransactionHashesInRange(
        providerForBlocksWithOneTxn,
        firstBlockNumber,
        0,
        lastBlockNumber,
        0
      )

      expect(transactions.length).to.equal(
        lastBlockNumber - firstBlockNumber + 1
      )
      expect(transactions).to.deep.equal(expected)
    })
  })
})
