import { expect } from 'chai'

import { isUserFunctionOptions } from '../src/utils'

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
})
