import { DeploymentInfo } from '@sphinx-labs/core/dist/config/types'
import { recursivelyConvertResult } from '@sphinx-labs/core/dist/utils'
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
