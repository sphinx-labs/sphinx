import { ChainInfo } from '@sphinx-labs/core/dist/config/types'
import { AbiCoder, Result } from 'ethers'

// TODO: rename to 'decode' or something

export const decodeChainInfo = (
  abiEncodedChainInfo: string,
  abi: Array<any>
): ChainInfo => {
  const chainInfoType = abi.find((fragment) => fragment.name === 'getChainInfo')
    .outputs[0]

  const coder = AbiCoder.defaultAbiCoder()
  const chainInfo = coder.decode([chainInfoType], abiEncodedChainInfo)[0]

  return chainInfo
}

/**
 * This function recursively converts a Result object to a plain object.
 *
 * AbiCoder.defaultAbiCoder() returns a Result object, which is a strict superset of the underlying type.
 * In cases where we need to JSON serialize the result, we need to convert it to a plain object first or
 * the object will not be converted in the expected format.
 */
export const recursivelyConvertResult = (r: Result | unknown) => {
  if (r instanceof Result) {
    if (r.length === 0) {
      return []
    }

    const objResult = r.toObject()

    for (const [key, value] of Object.entries(objResult)) {
      if (key === '_') {
        return r
      }

      if (value instanceof Result) {
        try {
          objResult[key] = recursivelyConvertResult(value)
        } catch (e) {
          // eslint-disable-next-line no-template-curly-in-string
          if (e.message.includes('value at index ${ index } unnamed')) {
            objResult[key] = value.map((v) => {
              if (v instanceof Result) {
                return recursivelyConvertResult(v)
              } else {
                return v
              }
            })
          } else {
            throw e
          }
        }
      }
    }
    return objResult
  } else {
    return r
  }
}

export const decodeChainInfoArray = (
  abiEncodedChainInfoArray: string,
  abi: Array<any>
): Array<ChainInfo> => {
  const chainInfoType = abi.find(
    (fragment) => fragment.name === 'getChainInfoArray'
  ).outputs[0]

  const coder = AbiCoder.defaultAbiCoder()

  // This is actually a Result object which is a strict superset of the ChainInfo[] type.
  // So we're able to safely mark it as Result here and then cast it to ChainInfo[] later.
  const chainInfoResultArray: Result = coder.decode(
    [chainInfoType],
    abiEncodedChainInfoArray
  )[0]

  return chainInfoResultArray.map((chainInfo) =>
    recursivelyConvertResult(chainInfo)
  ) as Array<ChainInfo>
}
