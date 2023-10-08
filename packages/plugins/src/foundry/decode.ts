import { DeploymentInfo } from '@sphinx-labs/core/dist/config/types'
import { recursivelyConvertResult } from '@sphinx-labs/core/dist/utils'
import { AbiCoder, Fragment, FunctionFragment, Interface, Result } from 'ethers'
import { ParamType } from 'ethers/lib.commonjs/abi'

import { ProposalOutput } from './types'

export const decodeDeploymentInfo = (
  abiEncodedDeploymentInfo: string,
  abi: Array<any>
): DeploymentInfo => {
  const iface = new Interface(abi)
  const deploymentInfoFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'getDeploymentInfo')

  if (!deploymentInfoFragment) {
    throw new Error(
      `'getDeploymentInfo' not found in ABI. Should never happen.`
    )
  }

  const coder = AbiCoder.defaultAbiCoder()

  const deploymentInfoResult = coder.decode(
    deploymentInfoFragment.outputs,
    abiEncodedDeploymentInfo
  )

  const { deploymentInfo } = recursivelyConvertResult(
    deploymentInfoFragment.outputs,
    deploymentInfoResult
  ) as any

  return deploymentInfo as DeploymentInfo
}

// Decodes an ABI-encoded DeploymentInfo array. The returned value is actually a Result object,
// which is a strict superset of the Array<DeploymentInfo> type. We cast it to Result so that it can
// be passed to `recursivelyConvertResult`.
export const decodeDeploymentInfoArray = (
  abiEncodedDeploymentInfoArray: string,
  abi: Array<any>
): Array<DeploymentInfo> => {
  const iface = new Interface(abi)
  const deploymentInfoFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'getDeploymentInfoArray')

  if (!deploymentInfoFragment) {
    throw new Error(
      `'getDeploymentInfoArray' not found in ABI. Should never happen.`
    )
  }

  const deploymentInfoResultArray = AbiCoder.defaultAbiCoder().decode(
    deploymentInfoFragment.outputs,
    abiEncodedDeploymentInfoArray
  )

  const { deploymentInfoArray } = recursivelyConvertResult(
    deploymentInfoFragment.outputs,
    deploymentInfoResultArray
  ) as any

  return deploymentInfoArray as Array<DeploymentInfo>
}

export const decodeProposalOutput = (
  abiEncodedProposalOutput: string,
  abi: Array<any>
): ProposalOutput => {
  const iface = new Interface(abi)
  const proposalOutputFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'proposalOutput')

  if (!proposalOutputFragment) {
    throw new Error(`'proposalOutput' not found in ABI. Should never happen.`)
  }

  const coder = AbiCoder.defaultAbiCoder()

  const proposalOutputResult = coder.decode(
    proposalOutputFragment.outputs,
    abiEncodedProposalOutput
  )

  const { output } = recursivelyConvertResult(
    proposalOutputFragment.outputs,
    proposalOutputResult
  ) as any

  for (const bundleInfo of output.bundleInfoArray) {
    bundleInfo.compilerConfig = JSON.parse(bundleInfo.compilerConfigStr)
    delete bundleInfo.compilerConfigStr
  }

  return output as ProposalOutput
}
