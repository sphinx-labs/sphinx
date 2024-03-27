import {
  SphinxSimulatorArtifact,
  getGnosisSafeProxyFactoryAddress,
  getGnosisSafeSingletonAddress,
  getSphinxSimulatorAddress,
} from '@sphinx-labs/contracts'
import { ethers } from 'ethers'

const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
  ['address', 'address'],
  [getGnosisSafeProxyFactoryAddress(), getGnosisSafeSingletonAddress()]
)
const initCodeWithArgs = ethers.concat([
  SphinxSimulatorArtifact.bytecode,
  constructorArgs,
])

console.log(getSphinxSimulatorAddress())
console.log('\n\n')
console.log(initCodeWithArgs)
