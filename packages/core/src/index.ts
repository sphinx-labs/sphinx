// Converts BigInt values to strings when calling JSON.stringify. An error would be thrown
// otherwise. For more context, see these sources:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json

// https://github.com/GoogleChromeLabs/jsbi/issues/30#issuecomment-1006088574
BigInt.prototype['toJSON'] = function () {
  return this.toString()
}

export * from './actions'
export * from './config'
export * from './languages'
export * from './utils'
export * from './constants'
export * from './tasks'
export * from './analytics'
export * from './etherscan'
export * from './networks'
export * from './preview'
export * from './provider'
export * from './artifacts'
export * from './types'
export * from './errors'
