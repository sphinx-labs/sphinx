import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

import {
  trimObjectToType,
  BuildInfoTemplate,
} from '../../../src/foundry/utils/trim'
chai.use(chaiAsPromised)
const expect = chai.expect

describe('trimObjectToType function', () => {
  it('Basic Field Matching', () => {
    const source = { field1: 'value1', field2: 123, field3: true }
    const template = { field1: '', field2: 0 }

    const result = trimObjectToType(source, template)

    expect(result).to.deep.eq({ field1: 'value1', field2: 123 })
  })

  it('Nested Object Handling', () => {
    const source = { nested: { subField1: 'data', subField2: 456 } }
    const template = { nested: { subField1: '' } }

    const result = trimObjectToType(source, template)

    expect(result).to.deep.eq({ nested: { subField1: 'data' } })
  })

  it('Handling Arrays', () => {
    const source = { list: [1, 2, 3] }
    const template = { list: [''] }

    const result = trimObjectToType(source, template)

    expect(result).to.deep.eq({ list: [1, 2, 3] })
  })

  it('Dynamic Key Handling Object Types (sphinx_all_keys)', () => {
    const source = {
      dynamic: { key1: { content: 'text1' }, key2: { content: 'text2' } },
    }
    const template = { dynamic: { sphinx_all_keys: { content: '' } } }

    const result = trimObjectToType(source, template)

    expect(result).to.deep.eq({
      dynamic: { key1: { content: 'text1' }, key2: { content: 'text2' } },
    })
  })

  it('Dynamic Key Handling Primitive Types (sphinx_all_keys)', () => {
    const source = {
      dynamic: { key1: 'text1', key2: 'text2' },
    }
    const template = { dynamic: { sphinx_all_keys: '' } }

    const result = trimObjectToType(source, template)

    expect(result).to.deep.eq(source)
  })

  it('Correct Handling of Dynamic Keys in Nested Objects', () => {
    const nestedSource = {
      nested: {
        dynamicKey1: {
          content: {
            dynamicKey3: 'value1',
          },
        },
        dynamicKey2: {
          content: {
            dynamicKey4: 'value2',
          },
        },
      },
    }

    const nestedTemplate = {
      nested: {
        sphinx_all_keys: {
          content: {
            sphinx_all_keys: '',
          },
        },
      },
    }

    const result = trimObjectToType(nestedSource, nestedTemplate)

    expect(result).to.deep.eq(nestedSource)
  })

  it('Correct Handling of Doubly Nested Dynamic Keys', () => {
    const nestedSource = {
      nested: {
        dynamicKey1: {
          dynamicKey3: {
            content: 'value1',
          },
        },
        dynamicKey2: {
          dynamicKey4: {
            content: 'value2',
          },
        },
      },
    }

    const nestedTemplate = {
      nested: {
        sphinx_all_keys: {
          sphinx_all_keys: {
            content: '',
          },
        },
      },
    }

    const result = trimObjectToType(nestedSource, nestedTemplate)

    expect(result).to.deep.eq(nestedSource)
  })

  it('Complete Structure Matching (Full BuildInfoTemplate Test)', () => {
    const sourceForBuildInfo = {
      id: 'build-123',
      solcVersion: '0.8.0',
      solcLongVersion: '0.8.0+commit.c7dfd78e',
      input: {
        language: 'Solidity',
        sources: {
          'file1.sol': { content: 'pragma solidity ^0.8.0;' },
          'file2.sol': { content: 'contract Test {}' },
        },
        settings: {
          viaIR: true,
          optimizer: {
            runs: 200,
            enabled: true,
            details: {
              yulDetails: {
                optimizerSteps: 'steps',
              },
            },
          },
          metadata: {
            useLiteralContent: true,
          },
          outputSelection: {
            '*': {
              '*': ['abi', 'evm.bytecode'],
            },
          },
          evmVersion: 'istanbul',
          libraries: {
            'file1.sol': {
              LibraryName: '0x...',
            },
          },
          remappings: ['some-remapping'],
        },
      },
      output: {
        contracts: {
          'file1.sol': {
            ContractName: {
              abi: ['...'],
              evm: {
                bytecode: {
                  object: '0x...',
                  linkReferences: {},
                  immutableReferences: {},
                },
                deployedBytecode: {
                  object: '0x...',
                  linkReferences: {},
                  immutableReferences: {},
                },
              },
              metadata: 'metadata-string',
            },
          },
        },
      },
    }

    const result = trimObjectToType(sourceForBuildInfo, BuildInfoTemplate)

    expect(result).to.deep.eq(sourceForBuildInfo)
  })
})
