import { DeploymentInfo } from '@sphinx-labs/core/dist/config/types'
import { AbiCoder, Result } from 'ethers'

export const decodeDeploymentInfo = (
  abiEncodedDeploymentInfo: string,
  abi: Array<any>
): DeploymentInfo => {
  const deploymentInfoType = abi.find(
    (fragment) => fragment.name === 'getDeploymentInfo'
  ).outputs[0]

  const coder = AbiCoder.defaultAbiCoder()
  const deploymentInfo = coder.decode(
    [deploymentInfoType],
    abiEncodedDeploymentInfo
  )[0]

  return deploymentInfo
}

/**
 * This function recursively converts a Result object to a plain object. It is necessary because the standard
 * `toObject()` method on a Result object only converts the top level fields. Any nested Result objects are left
 * as is which is an issue when using nested structs or arrays.
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

// Decodes an ABI-encoded DeploymentInfo array. The returned value is actually a Result object,
// which is a strict superset of the Array<DeploymentInfo> type. We cast it to Result so that it can
// be passed to `recursivelyConvertResult`.
export const decodeDeploymentInfoArray = (
  abiEncodedDeploymentInfoArray: string,
  abi: Array<any>
): Array<DeploymentInfo> => {
  const deploymentInfoType = abi.find(
    (fragment) => fragment.name === 'getDeploymentInfoArray'
  ).outputs[0]

  const coder = AbiCoder.defaultAbiCoder()

  // This is actually a Result object which is a strict superset of the DeploymentInfo[] type.
  // So we're able to safely mark it as Result here and then cast it to DeploymentInfo[] later.
  const deploymentInfoResultArray: Result = coder.decode(
    [deploymentInfoType],
    abiEncodedDeploymentInfoArray
  )[0]

  return deploymentInfoResultArray.map((deploymentInfo) =>
    recursivelyConvertResult(deploymentInfo)
  ) as Array<DeploymentInfo>
}
