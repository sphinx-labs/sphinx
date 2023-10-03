import { expect } from 'chai'
import { ethers } from 'ethers'

import {
  arraysEqual,
  equal,
  isUserFunctionOptions,
  recursivelyConvertResult,
} from '../src/utils'

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

    it('returns true for two equal ParsedVariables', () => {
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

    it('returns false for two unequal ParsedVariables', () => {
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

  // TODO: .only
  describe.only('recursivelyConvertResult', () => {
    const coder = ethers.AbiCoder.defaultAbiCoder()

    it('TODO(docs)', () => {
      const encoded = coder.encode(
        ['string', 'string'],
        ['myFirstStr', 'mySecondStr']
      )

      const result = coder.decode(['string', 'string'], encoded)

      const parsed = recursivelyConvertResult(result)

      console.log(parsed)
    })
  })
})
