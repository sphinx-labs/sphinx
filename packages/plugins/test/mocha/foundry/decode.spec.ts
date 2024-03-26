import { expect } from 'chai'
import { ConstructorFragment, ethers, parseUnits } from 'ethers'
import { ConfigArtifacts } from '@sphinx-labs/core'
import {
  CREATE3_PROXY_INITCODE,
  parseFoundryContractArtifact,
} from '@sphinx-labs/contracts'

import { makeAddress } from '../common'
import * as MyContract1FoundryArtifact from '../../../out/artifacts/MyContracts.sol/MyContract1.json'
import * as MyContract2FoundryArtifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import {
  makeContractDecodedAction,
  makeFunctionCallDecodedAction,
} from '../../../src/foundry/decode'

describe('Decoded Actions', () => {
  const MyContract1Artifact = parseFoundryContractArtifact(
    MyContract1FoundryArtifact
  )
  const MyContract2Artifact = parseFoundryContractArtifact(
    MyContract2FoundryArtifact
  )
  const myContract1FullyQualifiedName = `${MyContract1Artifact.sourceName}:${MyContract1Artifact.contractName}`
  const myContract2FullyQualifiedName = `${MyContract2Artifact.sourceName}:${MyContract2Artifact.contractName}`
  const mockConfigArtifacts: ConfigArtifacts = {
    [myContract1FullyQualifiedName]: {
      artifact: MyContract1Artifact,
      buildInfoId: '', // Unused
    },
    [myContract2FullyQualifiedName]: {
      artifact: MyContract2Artifact,
      buildInfoId: '', // Unused
    },
  }

  describe('makeContractDecodedAction', () => {
    const create2Address = makeAddress(255)

    it('returns decoded action for provided fully qualified name and contract with constructor', () => {
      const { contractName, abi, bytecode } = MyContract1Artifact
      const iface = new ethers.Interface(abi)
      const constructorArgs = {
        _intArg: '1',
        _uintArg: '2',
        _addressArg: makeAddress(3),
        _otherAddressArg: makeAddress(4),
      }
      const initCodeWithArgs = ethers.concat([
        bytecode,
        iface.encodeDeploy(Object.values(constructorArgs)),
      ])
      const value = parseUnits('0.1', 'ether').toString()

      const result = makeContractDecodedAction(
        create2Address,
        initCodeWithArgs,
        mockConfigArtifacts,
        myContract1FullyQualifiedName,
        value
      )
      expect(result).to.deep.equal({
        referenceName: contractName,
        functionName: 'deploy',
        variables: constructorArgs,
        address: create2Address,
        value,
      })
    })

    it('returns decoded action for provided fully qualified name and contract with no constructor', () => {
      const { contractName, abi, bytecode } = MyContract2Artifact
      const iface = new ethers.Interface(abi)
      const initCodeWithArgs = ethers.concat([bytecode, iface.encodeDeploy([])])
      const value = parseUnits('0.1', 'ether').toString()

      const result = makeContractDecodedAction(
        create2Address,
        initCodeWithArgs,
        mockConfigArtifacts,
        myContract2FullyQualifiedName,
        value
      )
      expect(result).to.deep.equal({
        referenceName: contractName,
        functionName: 'deploy',
        variables: {},
        address: create2Address,
        value,
      })

      // Check that the contract does not have a constructor.
      expect(iface.fragments.some(ConstructorFragment.isFragment)).equals(false)
    })

    it('returns decoded action for contract with no fully qualified name', () => {
      const initCodeWithArgs = CREATE3_PROXY_INITCODE
      const configArtifacts = {}
      const value = parseUnits('0.1', 'ether').toString()
      const result = makeContractDecodedAction(
        create2Address,
        initCodeWithArgs,
        configArtifacts,
        undefined,
        value
      )
      expect(result).to.deep.equal({
        referenceName: create2Address,
        functionName: 'deploy',
        variables: [],
        address: create2Address,
        value,
      })
    })
  })

  describe('makeFunctionCallDecodedAction', () => {
    const to = makeAddress(512)

    it('returns decoded action for a call with fully qualified name and successful decoding', () => {
      const functionName = 'incrementMyContract2'
      const iface = new ethers.Interface(MyContract2Artifact.abi)
      const data = iface.encodeFunctionData(functionName, [1])
      const value = parseUnits('0.1', 'ether').toString()
      const result = makeFunctionCallDecodedAction(
        to,
        data,
        value,
        mockConfigArtifacts,
        myContract2FullyQualifiedName
      )

      expect(result).to.deep.equal({
        referenceName: MyContract2Artifact.contractName,
        functionName,
        variables: { _num: '1' },
        address: to,
        value,
      })
    })

    it('returns decoded action for a call with fully qualified name but unsuccessful decoding', () => {
      const data = '0x1111'
      const value = parseUnits('0.1', 'ether').toString()
      const result = makeFunctionCallDecodedAction(
        to,
        data,
        value,
        mockConfigArtifacts,
        myContract2FullyQualifiedName
      )
      expect(result).to.deep.equal({
        referenceName: MyContract2Artifact.contractName,
        functionName: 'call',
        variables: [data],
        address: to,
        value,
      })
    })

    it('returns decoded action for a call without fully qualified name', () => {
      const data = '0x1111'
      const value = parseUnits('0.1', 'ether').toString()
      const result = makeFunctionCallDecodedAction(
        to,
        data,
        value,
        mockConfigArtifacts
      )
      expect(result).to.deep.equal({
        referenceName: to,
        functionName: 'call',
        variables: [data],
        address: '',
        value,
      })
    })

    it('returns decoded action for very large calldata', () => {
      const largeData = '0x' + 'ab'.repeat(501) // More than 1000 characters
      const value = parseUnits('0.1', 'ether').toString()
      const result = makeFunctionCallDecodedAction(
        to,
        largeData,
        value,
        mockConfigArtifacts
      )
      expect(result).to.deep.equal({
        referenceName: to,
        functionName: 'call',
        variables: [`Calldata is too large to display.`],
        address: '',
        value,
      })
    })
  })
})
