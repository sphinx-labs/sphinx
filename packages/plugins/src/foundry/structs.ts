import { fromRawSphinxActionInput } from '@sphinx-labs/core'
import {
  DeploymentInfo,
  ConfigCache,
  DeployContractActionInput,
  FunctionCallTODO,
  RawSphinxActionInput,
} from '@sphinx-labs/core/dist/config/types'
import { AbiCoder } from 'ethers'

// TODO: rename to 'decode' or something

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

export const decodeDeploymentInfoArray = (
  abiEncodedDeploymentInfoArray: string,
  abi: Array<any>
): Array<DeploymentInfo> => {
  const deploymentInfoType = abi.find(
    (fragment) => fragment.name === 'getDeploymentInfoArray'
  ).outputs[0]

  const coder = AbiCoder.defaultAbiCoder()
  const deploymentInfo = coder.decode(
    [deploymentInfoType],
    abiEncodedDeploymentInfoArray
  )[0]

  return deploymentInfo
}
