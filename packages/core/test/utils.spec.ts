import { expect } from 'chai'
import { ethers } from 'ethers'

import { arraysEqual, equal, recursivelyConvertResult } from '../src/utils'

describe('Utils', () => {
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

    it('returns true for two equal ParsedVariable objects', () => {
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

    it('returns false for two unequal ParsedVariable', () => {
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

  // TODO(docs): the param types are taken from an actual ABI
  describe('recursivelyConvertResult', () => {
    const abi = [
      {
        inputs: [
          {
            internalType: 'uint256[]',
            name: '_myArray',
            type: 'uint256[]',
          },
          {
            internalType: 'uint256[][]',
            name: '_myNestedArray',
            type: 'uint256[][]',
          },
        ],
        name: 'myArrayFunction',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [
          {
            internalType: 'string',
            name: '',
            type: 'string',
          },
          {
            components: [
              {
                internalType: 'int256',
                name: 'a',
                type: 'int256',
              },
              {
                internalType: 'bool',
                name: 'b',
                type: 'bool',
              },
              {
                components: [
                  {
                    internalType: 'address',
                    name: 'd',
                    type: 'address',
                  },
                  {
                    internalType: 'uint256[]',
                    name: 'e',
                    type: 'uint256[]',
                  },
                ],
                internalType: 'struct HelloSphinx.MyNestedStruct',
                name: 'c',
                type: 'tuple',
              },
            ],
            internalType: 'struct HelloSphinx.MyStruct',
            name: '_myStruct',
            type: 'tuple',
          },
          {
            internalType: 'uint256',
            name: '_myNumber',
            type: 'uint256',
          },
          {
            internalType: 'bool',
            name: '',
            type: 'bool',
          },
        ],
        name: 'myFunctionWithUnnamedVars',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [],
        name: 'myFunctionWithoutArgs',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [
          {
            internalType: 'uint256',
            name: '_myNumber',
            type: 'uint256',
          },
        ],
        name: 'mySingleArgFunction',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [
          {
            components: [
              {
                internalType: 'int256',
                name: 'a',
                type: 'int256',
              },
              {
                internalType: 'bool',
                name: 'b',
                type: 'bool',
              },
              {
                components: [
                  {
                    internalType: 'address',
                    name: 'd',
                    type: 'address',
                  },
                  {
                    internalType: 'uint256[]',
                    name: 'e',
                    type: 'uint256[]',
                  },
                ],
                internalType: 'struct HelloSphinx.MyNestedStruct',
                name: 'c',
                type: 'tuple',
              },
            ],
            internalType: 'struct HelloSphinx.MyStruct',
            name: '_myStruct',
            type: 'tuple',
          },
        ],
        name: 'myStructFunction',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [
          {
            components: [
              {
                internalType: 'int256',
                name: 'a',
                type: 'int256',
              },
              {
                internalType: 'bool',
                name: 'b',
                type: 'bool',
              },
              {
                components: [
                  {
                    internalType: 'address',
                    name: 'd',
                    type: 'address',
                  },
                  {
                    internalType: 'uint256[]',
                    name: 'e',
                    type: 'uint256[]',
                  },
                ],
                internalType: 'struct HelloSphinx.MyNestedStruct',
                name: 'c',
                type: 'tuple',
              },
            ],
            internalType: 'struct HelloSphinx.MyStruct[]',
            name: '_myStructArray',
            type: 'tuple[]',
          },
        ],
        name: 'myStructArrayFunction',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ]
    const coder = ethers.AbiCoder.defaultAbiCoder()
    const iface = ethers.Interface.from(abi)
    const functionFragments = iface.fragments.filter(ethers.Fragment.isFunction)

    it('converts empty result', () => {
      const noArgParamTypes = functionFragments.find(
        (f) => f.name === 'myFunctionWithoutArgs'
      )!.inputs
      const values = ethers.Result.fromItems([])

      expect(() => coder.encode(noArgParamTypes, values)).to.not.throw()

      expect(recursivelyConvertResult(noArgParamTypes, values)).to.deep.equal(
        {}
      )
    })

    it('converts Result with a single arg', () => {
      const singleArgParamTypes = functionFragments.find(
        (f) => f.name === 'mySingleArgFunction'
      )!.inputs
      const values = ethers.Result.fromItems([2])

      expect(() => coder.encode(singleArgParamTypes, values)).to.not.throw()

      expect(
        recursivelyConvertResult(singleArgParamTypes, values)
      ).to.deep.equal({
        _myNumber: 2,
      })
    })

    it('converts arg that contains arrays, including a nested array', () => {
      const arrayArgParamTypes = functionFragments.find(
        (f) => f.name === 'myArrayFunction'
      )!.inputs
      const values = ethers.Result.fromItems([
        [1, 2, 3],
        [
          [4, 5, 6],
          [7, 8, 9],
        ],
      ])

      expect(() => coder.encode(arrayArgParamTypes, values)).to.not.throw()

      expect(
        recursivelyConvertResult(arrayArgParamTypes, values)
      ).to.deep.equal({
        _myArray: [1, 2, 3],
        _myNestedArray: [
          [4, 5, 6],
          [7, 8, 9],
        ],
      })
    })

    // TODO(docs): we return an array in this case
    it('converts Result with unnamed args', () => {
      const unnamedArgsParamTypes = functionFragments.find(
        (f) => f.name === 'myFunctionWithUnnamedVars'
      )!.inputs
      const values = ethers.Result.fromItems([
        'test',
        [1, true, ['0x' + '11'.repeat(20), [1, 2, 3]]],
        2,
        false,
      ])

      expect(() => coder.encode(unnamedArgsParamTypes, values)).to.not.throw()

      expect(
        recursivelyConvertResult(unnamedArgsParamTypes, values)
      ).to.deep.equal([
        'test',
        {
          a: 1,
          b: true,
          c: {
            d: '0x' + '11'.repeat(20),
            e: [1, 2, 3],
          },
        },
        2,
        false,
      ])
    })

    it('converts Result that contains a nested struct', () => {
      const complexArgsParamTypes = functionFragments.find(
        (f) => f.name === 'myStructFunction'
      )!.inputs
      const values = ethers.Result.fromItems([
        [1, true, ['0x' + '11'.repeat(20), [1, 2, 3]]],
      ])

      expect(() => coder.encode(complexArgsParamTypes, values)).to.not.throw()

      expect(
        recursivelyConvertResult(complexArgsParamTypes, values)
      ).to.deep.equal({
        _myStruct: {
          a: 1,
          b: true,
          c: {
            d: '0x' + '11'.repeat(20),
            e: [1, 2, 3],
          },
        },
      })
    })

    it('converts Result that contains an array of structs', () => {
      const structArrayParamTypes = functionFragments.find(
        (f) => f.name === 'myStructArrayFunction'
      )!.inputs
      const values = ethers.Result.fromItems([
        [
          [1, true, ['0x' + '11'.repeat(20), [1, 2, 3]]],
          [2, false, ['0x' + '22'.repeat(20), [4, 5, 6]]],
        ],
      ])

      expect(() => coder.encode(structArrayParamTypes, values)).to.not.throw()

      expect(
        recursivelyConvertResult(structArrayParamTypes, values)
      ).to.deep.equal({
        _myStructArray: [
          {
            a: 1,
            b: true,
            c: {
              d: '0x' + '11'.repeat(20),
              e: [1, 2, 3],
            },
          },
          {
            a: 2,
            b: false,
            c: {
              d: '0x' + '22'.repeat(20),
              e: [4, 5, 6],
            },
          },
        ],
      })
    })
  })
})
