import { resolve } from 'path'
import child_process from 'child_process'

import sinon from 'sinon'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { ConstructorFragment, ethers } from 'ethers'
import {
  AccountAccessKind,
  ContractArtifact,
  LinkReferences,
  MAX_CONTRACT_SIZE_LIMIT,
  parseFoundryContractArtifact,
  remove0x,
} from '@sphinx-labs/contracts'
import {
  GetConfigArtifacts,
  SphinxJsonRpcProvider,
  getBytesLength,
} from '@sphinx-labs/core'

chai.use(chaiAsPromised)
const expect = chai.expect

import {
  convertLibraryFormat,
  getCurrentGitCommitHash,
  isInitCodeMatch,
  messageArtifactNotFound,
  readContractArtifact,
  replaceEnvVariables,
} from '../../../src/foundry/utils'
import { getFoundryToml } from '../../../src/foundry/options'
import * as MyContract1Artifact from '../../../out/artifacts/MyContracts.sol/MyContract1.json'
import * as MyContract2Artifact from '../../../out/artifacts/MyContracts.sol/MyContract2.json'
import * as MyContractWithLibrariesArtifact from '../../../out/artifacts/MyContracts.sol/MyContractWithLibraries.json'
import * as MyImmutableContractArtifact from '../../../out/artifacts/MyContracts.sol/MyImmutableContract.json'
import * as MyLargeContractArtifact from '../../../out/artifacts/MyContracts.sol/MyLargeContract.json'
import * as ExceedsContractMaxSizeLimitArtifact from '../../../out/artifacts/MyContracts.sol/ExceedsContractMaxSizeLimit.json'
import {
  encodeFunctionCalldata,
  getAnvilRpcUrl,
  killAnvilNodes,
  makeAddress,
  runForgeScript,
  startAnvilNodes,
} from '../common'
import { FoundryToml } from '../../../src/foundry/types'
import {
  assertContractSizeLimitNotExceeded,
  assertNoLinkedLibraries,
  makeGetConfigArtifacts,
  parseScriptFunctionCalldata,
  validateProposalNetworks,
} from '../../../dist'
import {
  InvalidFirstSigArgumentErrorMessage,
  SigCalledWithNoArgsErrorMessage,
  SphinxConfigMainnetsContainsTestnetsErrorMessage,
  SphinxConfigTestnetsContainsMainnetsErrorMessage,
  getFailedRequestErrorMessage,
  getMissingEndpointErrorMessage,
  getMixedNetworkTypeErrorMessage,
  getUnsupportedNetworkErrorMessage,
} from '../../../src/foundry/error-messages'
import { contractsExceedSizeLimitErrorMessage } from '../../../src/error-messages'
import { dummyUnlabeledAddress } from '../dummy'
import { getFakeConfigArtifacts, getFakeParsedAccountAccess } from '../fake'

describe('Utils', async () => {
  let foundryToml: FoundryToml

  before(async () => {
    foundryToml = await getFoundryToml()
  })

  describe('getCurrentGitCommitHash', () => {
    it('should not output to stderr when execSync fails', () => {
      const execSyncStub = sinon.stub(child_process, 'execSync')
      execSyncStub.throws(new Error('execSync failed'))
      const result = getCurrentGitCommitHash()

      // Check that `execSync` was called with "2>/dev/null", discards the `stderr`. We do this
      // instead of explicitly checking that nothing was written to `stderr` since because
      // overriding `stderr` would require a more complex setup involving a spy or mock on the
      // stderr stream itself, which is outside the scope of typical unit testing practices.
      sinon.assert.calledWith(execSyncStub, 'git rev-parse HEAD 2>/dev/null')

      expect(result).to.be.null

      execSyncStub.restore()
    })

    it('should return a commit hash when in a git repository', () => {
      const commitHash = getCurrentGitCommitHash()

      // Narrow the TypeScript type.
      if (typeof commitHash !== 'string') {
        throw new Error(`Git commit hash isn't a string.`)
      }

      expect(commitHash.length).equals(40)
    })
  })

  describe('readContractArtifact', async () => {
    const projectRoot = process.cwd()

    let artifactFolder: string

    before(async () => {
      artifactFolder = foundryToml.artifactFolder
    })

    it('Errors if artifact is not found', async () => {
      const fullyQualifiedName =
        'contracts/DoesNotExist.sol:NonExistentContract'
      await expect(
        readContractArtifact(fullyQualifiedName, projectRoot, artifactFolder)
      ).to.be.rejectedWith(messageArtifactNotFound(fullyQualifiedName))
    })

    it('Gets the artifact for a fully qualified name', async () => {
      const fullyQualifiedName = 'script/BridgeFunds.s.sol:SphinxScript'
      const artifact = await readContractArtifact(
        fullyQualifiedName,
        projectRoot,
        artifactFolder
      )
      expect(artifact.contractName).equals('SphinxScript')
    })
  })

  describe('convertLibraryFormat', () => {
    it('should handle an empty array', () => {
      const librariesArray: string[] = []

      const expectedOutput: string[] = []

      const result = convertLibraryFormat(librariesArray)
      expect(result).to.deep.equal(expectedOutput)
    })

    it('should correctly convert library formats', () => {
      const librariesArray = [
        'script/Counter.s.sol:MyLibrary:0x5FbDB2315678afecb367f032d93F642f64180aa3',
        'file.sol:Math=0x1234567890123456789012345678901234567890',
      ]

      const expectedOutput = [
        'script/Counter.s.sol:MyLibrary=0x5FbDB2315678afecb367f032d93F642f64180aa3',
        'file.sol:Math=0x1234567890123456789012345678901234567890',
      ]

      const result = convertLibraryFormat(librariesArray)
      expect(result).to.deep.equal(expectedOutput)
    })

    it('should normalize Ethereum addresses', () => {
      // This address is lowercase (not in checksum format).
      const librariesArray = [
        'script/Counter.s.sol:MyLibrary:0x8ba1f109551bd432803012645ac136ddd64dba72',
      ]

      // This uses a checksum address.
      const expectedOutput = [
        'script/Counter.s.sol:MyLibrary=0x8ba1f109551bD432803012645Ac136ddd64DBA72',
      ]

      const result = convertLibraryFormat(librariesArray)
      expect(result).to.deep.equal(expectedOutput)
    })

    it('should throw an error for invalid formats', () => {
      const librariesArray = ['invalidformat']

      expect(() => convertLibraryFormat(librariesArray)).to.throw(
        'Invalid library string format.'
      )
    })
  })

  describe('replaceEnvVariables', () => {
    before(() => {
      process.env['TEST_VAR'] = 'TestValue'
      process.env['ANOTHER_VAR'] = 'AnotherValue'
      process.env['RPC_API_KEY'] = 'MockApiKey'
      process.env['ETHERSCAN_API_KEY_OPTIMISM'] = 'MockEtherscanKey'
    })

    after(() => {
      delete process.env['TEST_VAR']
      delete process.env['ANOTHER_VAR']
      delete process.env['RPC_API_KEY']
      delete process.env['ETHERSCAN_API_KEY_OPTIMISM']
    })

    it('should replace environment variables in a string', () => {
      const input = `URL is \${TEST_VAR}`
      const expected = 'URL is TestValue'
      expect(replaceEnvVariables(input)).to.equal(expected)
    })

    it('should work with nested objects', () => {
      const input = {
        level1: {
          level2: `Nested \${TEST_VAR}`,
        },
      }
      const expected = {
        level1: {
          level2: 'Nested TestValue',
        },
      }
      expect(replaceEnvVariables(input)).to.deep.equal(expected)
    })

    it('should work with arrays', () => {
      const input = [`\${TEST_VAR}`, 'static', `\${ANOTHER_VAR}`]
      const expected = ['TestValue', 'static', 'AnotherValue']
      expect(replaceEnvVariables(input)).to.deep.equal(expected)
    })

    it('should ignore strings without environment variables', () => {
      const input = 'This is a test string'
      expect(replaceEnvVariables(input)).to.equal(input)
    })

    it('should replace environment variables in a nested object and trim the string', () => {
      const input = {
        outerField: {
          innerField: `      untrimmed    \${TEST_VAR}           `,
        },
      }
      const expected = {
        outerField: {
          innerField: 'untrimmed    TestValue', // Expected to be trimmed
        },
      }
      expect(replaceEnvVariables(input)).to.deep.equal(expected)
    })

    it('should work for sample foundry.toml', () => {
      const input = {
        src: 'src',
        test: 'test',
        script: 'script',
        out: 'out',
        libs: ['node_modules'],
        remappings: [
          '@sphinx-labs/plugins/=node_modules/@sphinx-labs/plugins/contracts/foundry/',
          '@sphinx-labs/contracts/=node_modules/@sphinx-labs/contracts/',
          'forge-std/=node_modules/forge-std/src/',
          'sphinx-forge-std/=node_modules/@sphinx-labs/plugins/node_modules/sphinx-forge-std/src/',
          'sphinx-solmate/=node_modules/@sphinx-labs/plugins/node_modules/sphinx-solmate/src/',
          'ds-test/=node_modules/ds-test/src/',
          '@openzeppelin/contracts-upgradeable/=../../node_modules/@openzeppelin/contracts-upgradeable/',
          '@openzeppelin/contracts/=../../node_modules/@openzeppelin/contracts/',
          'solidity-stringutils=../../node_modules/solidity-stringutils/src/',
          'solmate/src/=../../node_modules/solmate/src/',
        ],
        auto_detect_remappings: true,
        libraries: [],
        cache: true,
        cache_path: 'cache',
        broadcast: 'broadcast',
        allow_paths: ['../..'],
        include_paths: [],
        force: false,
        evm_version: 'paris',
        gas_reports: ['*'],
        gas_reports_ignore: [],
        solc: null,
        auto_detect_solc: true,
        offline: false,
        optimizer: false,
        optimizer_runs: 200,
        optimizer_details: null,
        model_checker: null,
        verbosity: 0,
        eth_rpc_url: null,
        eth_rpc_jwt: null,
        etherscan_api_key: null,
        etherscan: {
          optimism_sepolia: {
            url: 'https://api-optimistic.etherscan.io/api?',
            key: `\${ETHERSCAN_API_KEY_OPTIMISM}`,
          },
        },
        ignored_error_codes: ['license', 'code-size', 'init-code-size'],
        deny_warnings: false,
        match_test: null,
        no_match_test: null,
        match_contract: null,
        no_match_contract: null,
        match_path: null,
        no_match_path: null,
        fuzz: {
          runs: 256,
          max_test_rejects: 65536,
          seed: null,
          dictionary_weight: 40,
          include_storage: true,
          include_push_bytes: true,
          max_fuzz_dictionary_addresses: 15728640,
          max_fuzz_dictionary_values: 6553600,
        },
        invariant: {
          runs: 256,
          depth: 15,
          fail_on_revert: false,
          call_override: false,
          dictionary_weight: 80,
          include_storage: true,
          include_push_bytes: true,
          max_fuzz_dictionary_addresses: 15728640,
          max_fuzz_dictionary_values: 6553600,
          shrink_sequence: true,
          shrink_run_limit: 262144,
        },
        ffi: false,
        sender: '0x1804c8ab1f12e6bbf3894d4083f33e07309d1f38',
        tx_origin: '0x1804c8ab1f12e6bbf3894d4083f33e07309d1f38',
        initial_balance: '0xffffffffffffffffffffffff',
        block_number: 1,
        fork_block_number: null,
        chain_id: null,
        gas_limit: 9223372036854775807,
        code_size_limit: null,
        gas_price: null,
        block_base_fee_per_gas: 0,
        block_coinbase: '0x0000000000000000000000000000000000000000',
        block_timestamp: 1,
        block_difficulty: 0,
        block_prevrandao:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
        block_gas_limit: null,
        memory_limit: 134217728,
        extra_output: ['storageLayout'],
        extra_output_files: [],
        names: false,
        sizes: false,
        via_ir: false,
        rpc_storage_caching: {
          chains: 'all',
          endpoints: 'all',
        },
        no_storage_caching: false,
        no_rpc_rate_limit: false,
        rpc_endpoints: {
          anvil: 'http://127.0.0.1:8545',
          arbitrum_sepolia: `https://arb-sepolia.g.alchemy.com/v2/\${RPC_API_KEY}`,
          optimism_sepolia: `https://opt-sepolia.g.alchemy.com/v2/\${RPC_API_KEY}`,
          sepolia: `https://eth-sepolia.g.alchemy.com/v2/\${RPC_API_KEY\}`,
        },
        use_literal_content: false,
        bytecode_hash: 'ipfs',
        cbor_metadata: true,
        revert_strings: null,
        sparse_mode: false,
        build_info: true,
        build_info_path: null,
        fmt: {
          line_length: 120,
          tab_width: 4,
          bracket_spacing: false,
          int_types: 'long',
          multiline_func_header: 'attributes_first',
          quote_style: 'double',
          number_underscore: 'preserve',
          hex_underscore: 'remove',
          single_line_statement_blocks: 'preserve',
          override_spacing: false,
          wrap_comments: false,
          ignore: [],
          contract_new_lines: false,
          sort_imports: false,
        },
        doc: {
          out: 'docs',
          title: '',
          book: 'book.toml',
          homepage: 'README.md',
          ignore: [],
        },
        fs_permissions: [
          {
            access: true,
            path: './',
          },
        ],
        cancun: false,
      }

      const expected = {
        src: 'src',
        test: 'test',
        script: 'script',
        out: 'out',
        libs: ['node_modules'],
        remappings: [
          '@sphinx-labs/plugins/=node_modules/@sphinx-labs/plugins/contracts/foundry/',
          '@sphinx-labs/contracts/=node_modules/@sphinx-labs/contracts/',
          'forge-std/=node_modules/forge-std/src/',
          'sphinx-forge-std/=node_modules/@sphinx-labs/plugins/node_modules/sphinx-forge-std/src/',
          'sphinx-solmate/=node_modules/@sphinx-labs/plugins/node_modules/sphinx-solmate/src/',
          'ds-test/=node_modules/ds-test/src/',
          '@openzeppelin/contracts-upgradeable/=../../node_modules/@openzeppelin/contracts-upgradeable/',
          '@openzeppelin/contracts/=../../node_modules/@openzeppelin/contracts/',
          'solidity-stringutils=../../node_modules/solidity-stringutils/src/',
          'solmate/src/=../../node_modules/solmate/src/',
        ],
        auto_detect_remappings: true,
        libraries: [],
        cache: true,
        cache_path: 'cache',
        broadcast: 'broadcast',
        allow_paths: ['../..'],
        include_paths: [],
        force: false,
        evm_version: 'paris',
        gas_reports: ['*'],
        gas_reports_ignore: [],
        solc: null,
        auto_detect_solc: true,
        offline: false,
        optimizer: false,
        optimizer_runs: 200,
        optimizer_details: null,
        model_checker: null,
        verbosity: 0,
        eth_rpc_url: null,
        eth_rpc_jwt: null,
        etherscan_api_key: null,
        etherscan: {
          optimism_sepolia: {
            url: 'https://api-optimistic.etherscan.io/api?',
            key: 'MockEtherscanKey', // This is the replaced value
          },
        },
        ignored_error_codes: ['license', 'code-size', 'init-code-size'],
        deny_warnings: false,
        match_test: null,
        no_match_test: null,
        match_contract: null,
        no_match_contract: null,
        match_path: null,
        no_match_path: null,
        fuzz: {
          runs: 256,
          max_test_rejects: 65536,
          seed: null,
          dictionary_weight: 40,
          include_storage: true,
          include_push_bytes: true,
          max_fuzz_dictionary_addresses: 15728640,
          max_fuzz_dictionary_values: 6553600,
        },
        invariant: {
          runs: 256,
          depth: 15,
          fail_on_revert: false,
          call_override: false,
          dictionary_weight: 80,
          include_storage: true,
          include_push_bytes: true,
          max_fuzz_dictionary_addresses: 15728640,
          max_fuzz_dictionary_values: 6553600,
          shrink_sequence: true,
          shrink_run_limit: 262144,
        },
        ffi: false,
        sender: '0x1804c8ab1f12e6bbf3894d4083f33e07309d1f38',
        tx_origin: '0x1804c8ab1f12e6bbf3894d4083f33e07309d1f38',
        initial_balance: '0xffffffffffffffffffffffff',
        block_number: 1,
        fork_block_number: null,
        chain_id: null,
        gas_limit: 9223372036854775807,
        code_size_limit: null,
        gas_price: null,
        block_base_fee_per_gas: 0,
        block_coinbase: '0x0000000000000000000000000000000000000000',
        block_timestamp: 1,
        block_difficulty: 0,
        block_prevrandao:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
        block_gas_limit: null,
        memory_limit: 134217728,
        extra_output: ['storageLayout'],
        extra_output_files: [],
        names: false,
        sizes: false,
        via_ir: false,
        rpc_storage_caching: {
          chains: 'all',
          endpoints: 'all',
        },
        no_storage_caching: false,
        no_rpc_rate_limit: false,
        rpc_endpoints: {
          anvil: 'http://127.0.0.1:8545',
          arbitrum_sepolia: 'https://arb-sepolia.g.alchemy.com/v2/MockApiKey',
          optimism_sepolia: 'https://opt-sepolia.g.alchemy.com/v2/MockApiKey',
          sepolia: 'https://eth-sepolia.g.alchemy.com/v2/MockApiKey',
        },
        use_literal_content: false,
        bytecode_hash: 'ipfs',
        cbor_metadata: true,
        revert_strings: null,
        sparse_mode: false,
        build_info: true,
        build_info_path: null,
        fmt: {
          line_length: 120,
          tab_width: 4,
          bracket_spacing: false,
          int_types: 'long',
          multiline_func_header: 'attributes_first',
          quote_style: 'double',
          number_underscore: 'preserve',
          hex_underscore: 'remove',
          single_line_statement_blocks: 'preserve',
          override_spacing: false,
          wrap_comments: false,
          ignore: [],
          contract_new_lines: false,
          sort_imports: false,
        },
        doc: {
          out: 'docs',
          title: '',
          book: 'book.toml',
          homepage: 'README.md',
          ignore: [],
        },
        fs_permissions: [
          {
            access: true,
            path: './',
          },
        ],
        cancun: false,
      }
      expect(replaceEnvVariables(input)).to.deep.equal(expected)
    })
  })

  describe('getConfigArtifacts', () => {
    let getConfigArtifacts: GetConfigArtifacts

    before(() => {
      getConfigArtifacts = makeGetConfigArtifacts(
        foundryToml.artifactFolder,
        foundryToml.buildInfoFolder,
        process.cwd(),
        foundryToml.cachePath
      )
    })

    // Test that this function returns an empty object if it can't find an artifact for the given
    // init code. This ensures the user can deploy contracts that are defined as inline bytecode,
    // like a `CREATE3` proxy.
    it('returns empty object for init code that does not belong to a source file', async () => {
      const artifacts = await getConfigArtifacts([
        '0x67363d3d37363d34f03d5260086018f3', // `CREATE3` proxy initcode
      ])
      expect(artifacts).deep.equals({
        buildInfos: {},
        configArtifacts: {},
      })
    })
  })

  describe('isInitCodeMatch', () => {
    const coder = ethers.AbiCoder.defaultAbiCoder()

    /**
     * A helper function that creates the artifact parameter passed into `isInitCodeMatch`.
     */
    const makeArtifactParam = (
      artifact: ContractArtifact
    ): {
      bytecode: string
      linkReferences: LinkReferences
      constructorFragment?: ethers.ConstructorFragment
    } => {
      const iface = new ethers.Interface(artifact.abi)
      const constructorFragment = iface.fragments.find(
        ConstructorFragment.isFragment
      )

      return {
        bytecode: artifact.bytecode,
        linkReferences: artifact.linkReferences,
        constructorFragment,
      }
    }

    it('returns false for different contracts', () => {
      const artifactOne = parseFoundryContractArtifact(MyContract1Artifact)
      const artifactTwo = parseFoundryContractArtifact(MyContract2Artifact)

      expect(
        isInitCodeMatch(artifactOne.bytecode, makeArtifactParam(artifactTwo))
      ).to.equal(false)
    })

    it('returns false if artifact bytecode length is greater than actual bytecode length', () => {
      const artifact = parseFoundryContractArtifact(MyContract2Artifact)
      const actualInitCode = '0x22'
      expect(getBytesLength(artifact.bytecode)).gt(
        getBytesLength(actualInitCode)
      )

      expect(
        isInitCodeMatch(actualInitCode, makeArtifactParam(artifact))
      ).to.equal(false)
    })

    it('returns false if constructor cannot be ABI decoded', () => {
      const artifact = parseFoundryContractArtifact(MyContract1Artifact)

      // Encode an incorrect number of constructor args. (There should be 4, but we only encode 3).
      const encodedConstructorArgs = coder.encode(
        ['int256', 'uint256', 'address'],
        [3, 4, makeAddress(5)]
      )

      // Sanity check that we're encoding the wrong number of constructor args.
      const constructorFragment = new ethers.Interface(
        artifact.abi
      ).fragments.find(ConstructorFragment.isFragment)
      // Narrow the TypeScript type of the constructor fragment.
      if (!constructorFragment) {
        throw new Error(`Could not find constructor fragment.`)
      }
      expect(constructorFragment.inputs.length).does.not.equal(3)

      const initCodeWithArgs = ethers.concat([
        artifact.bytecode,
        encodedConstructorArgs,
      ])

      expect(
        isInitCodeMatch(initCodeWithArgs, makeArtifactParam(artifact))
      ).to.equal(false)
    })

    it('returns true for contract with no constructor args', () => {
      const artifact = parseFoundryContractArtifact(MyContract2Artifact)

      expect(
        isInitCodeMatch(artifact.bytecode, makeArtifactParam(artifact))
      ).to.equal(true)
    })

    it('returns true for contract with constructor args', () => {
      const artifact = parseFoundryContractArtifact(MyContract1Artifact)

      const encodedConstructorArgs = coder.encode(
        ['int256', 'uint256', 'address', 'address'],
        [3, 4, makeAddress(5), makeAddress(6)]
      )
      const initCodeWithArgs = ethers.concat([
        artifact.bytecode,
        encodedConstructorArgs,
      ])

      expect(
        isInitCodeMatch(initCodeWithArgs, makeArtifactParam(artifact))
      ).to.equal(true)
    })

    it('returns true for large contract', () => {
      const artifact = parseFoundryContractArtifact(MyLargeContractArtifact)

      expect(
        isInitCodeMatch(artifact.bytecode, makeArtifactParam(artifact))
      ).to.equal(true)
    })

    it('returns true for contract with libraries', async () => {
      const artifact = parseFoundryContractArtifact(
        MyContractWithLibrariesArtifact
      )

      const chainId = BigInt(31337)
      // Start an Anvil node, then deploy the contract and its libraries, then kill the Anvil node.
      // We must deploy the contract so that its bytecode contains the actual library addresses
      // instead of placeholders.
      await startAnvilNodes([chainId])
      const broadcast = await runForgeScript(
        'contracts/test/script/Libraries.s.sol',
        foundryToml.broadcastFolder,
        getAnvilRpcUrl(chainId),
        'MyContractWithLibraries_Script'
      )
      await killAnvilNodes([chainId])

      const initCodeWithArgs =
        broadcast.transactions[broadcast.transactions.length - 1].transaction
          .input
      // Narrow the TypeScript type.
      if (!initCodeWithArgs) {
        throw new Error(`Could not find init code.`)
      }

      expect(
        isInitCodeMatch(initCodeWithArgs, makeArtifactParam(artifact))
      ).to.equal(true)
    })

    it('returns true for contract with immutable variables', async () => {
      const artifact = parseFoundryContractArtifact(MyImmutableContractArtifact)

      // Create the contract's init code. We don't need to deploy the contract because immutable
      // variable references only exist in the runtime bytecode and not the init code. This is
      // different from library placeholders, which exist in both the runtime bytecode and the init
      // code.
      const encodedConstructorArgs = coder.encode(['uint256', 'uint8'], [1, 2])
      const initCodeWithArgs = ethers.concat([
        artifact.bytecode,
        encodedConstructorArgs,
      ])

      expect(
        isInitCodeMatch(initCodeWithArgs, makeArtifactParam(artifact))
      ).to.equal(true)
    })
  })

  describe('assertNoLinkedLibraries', () => {
    const projectRoot = process.cwd()

    it('throws error if sourceName without targetContract contains linked library', async () => {
      const sourceName = 'contracts/test/MyLinkedLibraryContract.sol'

      await expect(
        assertNoLinkedLibraries(
          sourceName,
          foundryToml.cachePath,
          foundryToml.artifactFolder,
          projectRoot
        )
      ).to.be.rejectedWith(
        `Detected linked library in: ${sourceName}:MyLinkedLibraryContract\n` +
          `You must remove all linked libraries in this file because Sphinx currently doesn't support them.`
      )
    })

    it('throws error if sourceName with targetContract contains linked library', async () => {
      const sourceName = 'contracts/test/MyContracts.sol'
      const targetContract = 'MyContractWithLibraries'

      const fullyQualifiedName = `${sourceName}:${targetContract}`

      await expect(
        assertNoLinkedLibraries(
          sourceName,
          foundryToml.cachePath,
          foundryToml.artifactFolder,
          projectRoot,
          targetContract
        )
      ).to.be.rejectedWith(
        `Detected linked library in: ${fullyQualifiedName}\n` +
          `You must remove all linked libraries in this file because Sphinx currently doesn't support them.`
      )
    })

    it('succeeds if sourceName without targetContract does not contain linked library', async () => {
      const sourceName = 'contracts/test/SimpleStorage.sol'

      await expect(
        assertNoLinkedLibraries(
          sourceName,
          foundryToml.cachePath,
          foundryToml.artifactFolder,
          projectRoot
        )
      ).to.eventually.be.fulfilled
    })

    it('succeeds if sourceName with targetContract does not contain linked library', async () => {
      const sourceName = 'contracts/test/MyContracts.sol'
      const targetContract = 'MyContract1'

      await expect(
        assertNoLinkedLibraries(
          sourceName,
          foundryToml.cachePath,
          foundryToml.artifactFolder,
          projectRoot,
          targetContract
        )
      ).to.eventually.be.fulfilled
    })

    it('succeeds if sourceName is an absolute path and does not contain linked library', async () => {
      const sourceName = resolve('contracts/test/SimpleStorage.sol')

      await expect(
        assertNoLinkedLibraries(
          sourceName,
          foundryToml.cachePath,
          foundryToml.artifactFolder,
          projectRoot
        )
      ).to.eventually.be.fulfilled
    })

    it('succeeds if sourceName starts with a period and does not contain linked library', async () => {
      const sourceName = './contracts/test/SimpleStorage.sol'

      await expect(
        assertNoLinkedLibraries(
          sourceName,
          foundryToml.cachePath,
          foundryToml.artifactFolder,
          projectRoot
        )
      ).to.eventually.be.fulfilled
    })
  })

  describe('validateProposalNetworks', () => {
    const validMainnetOne = 'mainnet-1'
    const validMainnetTwo = 'other-mainnet-2'
    const validTestnetOne = 'testnet'
    const validNetworks = [validMainnetOne, validMainnetTwo, validTestnetOne]
    const unsupportedNetworkOne = 'unsupported1'
    const unsupportedNetworkTwo = 'unsupported2'

    let rpcEndpoints: FoundryToml['rpcEndpoints']
    let getNetworkStub: sinon.SinonStub

    beforeEach(() => {
      rpcEndpoints = {
        [validMainnetOne]: 'http://mainnet.rpc',
        [validTestnetOne]: 'http://testnet.rpc',
        [validMainnetTwo]: 'http://other-mainnet.rpc',
        [unsupportedNetworkOne]: 'http://unsupported-1.rpc',
        [unsupportedNetworkTwo]: 'http://unsupported-2.rpc',
      }

      getNetworkStub = sinon.stub()

      sinon
        .stub(SphinxJsonRpcProvider.prototype, 'getNetwork')
        .callsFake(getNetworkStub)
    })

    afterEach(() => {
      sinon.restore()
    })

    it('throws an error if no CLI networks are provided', async () => {
      await expect(
        validateProposalNetworks([], [], [], rpcEndpoints)
      ).to.be.rejectedWith(
        `Expected at least one network, but none were supplied.`
      )
    })

    it('throws an error for missing RPC endpoints', async () => {
      const unknownNetworks = ['unknown1', 'unknown2']
      await expect(
        validateProposalNetworks(unknownNetworks, [], [], rpcEndpoints)
      ).to.be.rejectedWith(getMissingEndpointErrorMessage(unknownNetworks))
    })

    it('throws an error for failed requests to RPC endpoints', async () => {
      getNetworkStub.rejects(new Error('Request failed'))
      await expect(
        validateProposalNetworks(validNetworks, [], [], rpcEndpoints)
      ).to.be.rejectedWith(getFailedRequestErrorMessage(validNetworks))
    })

    it('throws an error for unsupported networks', async () => {
      const unsupportedChainIdOne = '-1'
      const unsupportedChainIdTwo = '-2'
      const unsupportedNetworks = [
        { networkName: unsupportedNetworkOne, chainId: unsupportedChainIdOne },
        { networkName: unsupportedNetworkTwo, chainId: unsupportedChainIdTwo },
      ]

      getNetworkStub
        .onFirstCall()
        .resolves({ chainId: BigInt(unsupportedChainIdOne) })
      getNetworkStub
        .onSecondCall()
        .resolves({ chainId: BigInt(unsupportedChainIdTwo) })

      await expect(
        validateProposalNetworks(
          [unsupportedNetworkOne, unsupportedNetworkTwo],
          [],
          [],
          rpcEndpoints
        )
      ).to.be.rejectedWith(
        getUnsupportedNetworkErrorMessage(unsupportedNetworks)
      )
    })

    it('throws an error for mixed network types (test and production)', async () => {
      const mixedNetworks = [
        { networkType: 'Mainnet', network: validMainnetOne },
        { networkType: 'Mainnet', network: validMainnetTwo },
        { networkType: 'Testnet', network: validTestnetOne },
      ]

      getNetworkStub.onFirstCall().resolves({ chainId: BigInt(1) }) // Production network (Ethereum)
      getNetworkStub.onSecondCall().resolves({ chainId: BigInt(10) }) // Production network (Optimism)
      getNetworkStub.onThirdCall().resolves({ chainId: BigInt(11155111) }) // Test network (Sepolia)

      await expect(
        validateProposalNetworks(validNetworks, [], [], rpcEndpoints)
      ).to.be.rejectedWith(getMixedNetworkTypeErrorMessage(mixedNetworks))
    })

    it('throws an error if sphinxConfig.mainnets contains all testnets', async () => {
      getNetworkStub.resolves({ chainId: BigInt(11155111) }) // Test network (Sepolia)

      await expect(
        validateProposalNetworks(
          ['mainnets'],
          [],
          [validTestnetOne],
          rpcEndpoints
        )
      ).to.be.rejectedWith(SphinxConfigMainnetsContainsTestnetsErrorMessage)
    })

    it('throws an error if sphinxConfig.testnets contains all mainnets', async () => {
      getNetworkStub.resolves({ chainId: BigInt(1) }) // Production network

      await expect(
        validateProposalNetworks(
          ['testnets'],
          [validMainnetOne, validMainnetTwo],
          [],
          rpcEndpoints
        )
      ).to.be.rejectedWith(SphinxConfigTestnetsContainsMainnetsErrorMessage)
    })

    it('validates CLI networks correctly', async () => {
      getNetworkStub.onFirstCall().resolves({ chainId: BigInt(1) }) // Production network (Ethereum)
      getNetworkStub.onSecondCall().resolves({ chainId: BigInt(10) }) // Production network (Optimism)

      const result = await validateProposalNetworks(
        [validMainnetOne, validMainnetTwo],
        [],
        [],
        rpcEndpoints
      )
      expect(result.rpcUrls).to.deep.equals([
        rpcEndpoints[validMainnetOne],
        rpcEndpoints[validMainnetTwo],
      ])
      expect(result.isTestnet).to.be.false
    })

    it('validates config mainnets correctly', async () => {
      getNetworkStub.onFirstCall().resolves({ chainId: BigInt(1) }) // Production network (Ethereum)
      getNetworkStub.onSecondCall().resolves({ chainId: BigInt(10) }) // Production network (Optimism)

      const result = await validateProposalNetworks(
        ['mainnets'],
        [],
        [validMainnetOne, validMainnetTwo],
        rpcEndpoints
      )
      expect(result.rpcUrls).to.deep.equals([
        rpcEndpoints[validMainnetOne],
        rpcEndpoints[validMainnetTwo],
      ])
      expect(result.isTestnet).to.be.false
    })

    it('validates config testnets correctly', async () => {
      getNetworkStub.resolves({ chainId: BigInt(11155111) }) // Test network (Sepolia)

      const result = await validateProposalNetworks(
        ['testnets'],
        [validTestnetOne],
        [],
        rpcEndpoints
      )
      expect(result.rpcUrls).to.deep.equals([rpcEndpoints[validTestnetOne]])
      expect(result.isTestnet).to.be.true
    })
  })

  describe('parseScriptFunctionCalldata', () => {
    let spawnAsyncStub: sinon.SinonStub

    beforeEach(() => {
      spawnAsyncStub = sinon.stub()
    })

    afterEach(() => {
      sinon.restore()
    })

    it('throws an error if called with no arguments', async () => {
      await expect(parseScriptFunctionCalldata([])).to.be.rejectedWith(
        SigCalledWithNoArgsErrorMessage
      )
    })

    it('throws an error if spawnAsync fails on selector retrieval', async () => {
      const mockSig = ['testFunc(uint256)']
      const errorMessage = 'spawnAsync failed on selector retrieval'

      spawnAsyncStub
        .onFirstCall()
        .resolves({ code: 1, stdout: '', stderr: errorMessage })

      await expect(
        parseScriptFunctionCalldata(mockSig, spawnAsyncStub)
      ).to.be.rejectedWith(errorMessage)
    })

    it('throws an error if spawnAsync fails on abi-encode', async () => {
      const mockSig = ['testFunc(uint256)', '1234']
      const errorMessage = 'spawnAsync failed on abi-encode'

      spawnAsyncStub
        .onFirstCall()
        .resolves({ code: 0, stdout: 'selector', stderr: '' })
      spawnAsyncStub
        .onSecondCall()
        .resolves({ code: 1, stdout: '', stderr: errorMessage })

      await expect(
        parseScriptFunctionCalldata(mockSig, spawnAsyncStub)
      ).to.be.rejectedWith(errorMessage)
    })

    it('throws an error if the first argument is a function with no parentheses', async () => {
      const invalidSig = ['invalidSig']
      await expect(parseScriptFunctionCalldata(invalidSig)).to.be.rejectedWith(
        InvalidFirstSigArgumentErrorMessage
      )
    })

    it('throws an error if the first argument is a hex string with odd number of bytes', async () => {
      const invalidSig = ['0x111']
      await expect(parseScriptFunctionCalldata(invalidSig)).to.be.rejectedWith(
        InvalidFirstSigArgumentErrorMessage
      )
    })

    it('should handle valid function signature with parentheses', async () => {
      const sig = ['testFunc(uint256)', '1234']
      const expectedCalldata = encodeFunctionCalldata(sig)

      const actualCalldata = await parseScriptFunctionCalldata(sig)
      expect(actualCalldata).to.equal(expectedCalldata)
    })

    it("should return the input if it's an 0x-prefixed hex string", async () => {
      const calldata = encodeFunctionCalldata(['testFunc(uint256)', '1234'])

      const actualCalldata = await parseScriptFunctionCalldata([calldata])
      expect(actualCalldata).to.equal(calldata)
    })

    it('should return the 0x-prefixed input if the input is a hex string that is not 0x-prefixed', async () => {
      const with0x = encodeFunctionCalldata(['testFunc(uint256)', '1234'])
      const calldata = remove0x(with0x)

      const actualCalldata = await parseScriptFunctionCalldata([calldata])
      expect(actualCalldata).to.equal(with0x)
    })

    it('should trim strings surrounding hex string', async () => {
      const calldata = encodeFunctionCalldata(['testFunc(uint256)', '1234'])
      const withStrings = `""""""${calldata}""""""`

      const actualCalldata = await parseScriptFunctionCalldata([withStrings])
      expect(actualCalldata).to.equal(calldata)
    })
  })

  describe('assertContractSizeLimitNotExceeded', () => {
    it('does not throw an error when contract size is less than the size limit', async () => {
      const artifact = parseFoundryContractArtifact(MyContract2Artifact)
      const address = makeAddress(1)
      const fullyQualifiedName = `${artifact.sourceName}:${artifact.contractName}`

      const accesses = [
        getFakeParsedAccountAccess({
          kind: AccountAccessKind.Create,
          data: artifact.bytecode,
          account: address,
          deployedCode: artifact.deployedBytecode,
        }),
      ]
      const configArtifacts = await getFakeConfigArtifacts(
        [fullyQualifiedName],
        foundryToml.artifactFolder
      )

      expect(() =>
        assertContractSizeLimitNotExceeded(accesses, configArtifacts)
      ).to.not.throw
    })

    it('throws an error when a labeled and unlabeled contract exceed the size limit', async () => {
      const exceedsMaxSizeAddress = '0x' + '11'.repeat(20)
      const exceedsMaxSizeArtifact = parseFoundryContractArtifact(
        ExceedsContractMaxSizeLimitArtifact
      )
      const exceedsMaxSizeFullyQualifiedName = `${exceedsMaxSizeArtifact.sourceName}:${exceedsMaxSizeArtifact.contractName}`

      const expectedErrorMessageInput = [
        {
          address: dummyUnlabeledAddress,
        },
        {
          address: exceedsMaxSizeAddress,
          fullyQualifiedName: exceedsMaxSizeFullyQualifiedName,
        },
      ]

      const accesses = [
        getFakeParsedAccountAccess({
          kind: AccountAccessKind.Create,
          data: '', // Empty so that the initCodeWithArgs doesn't match a labeled contract
          account: dummyUnlabeledAddress,
          deployedCode: '0x' + '00'.repeat(MAX_CONTRACT_SIZE_LIMIT + 1),
        }),
        getFakeParsedAccountAccess({
          kind: AccountAccessKind.Create,
          data: ExceedsContractMaxSizeLimitArtifact.bytecode.object,
          account: exceedsMaxSizeAddress,
          deployedCode:
            ExceedsContractMaxSizeLimitArtifact.deployedBytecode.object,
        }),
      ]
      const configArtifacts = await getFakeConfigArtifacts(
        [exceedsMaxSizeFullyQualifiedName],
        foundryToml.artifactFolder
      )

      expect(() =>
        assertContractSizeLimitNotExceeded(accesses, configArtifacts)
      ).to.throw(
        contractsExceedSizeLimitErrorMessage(expectedErrorMessageInput)
      )
    })
  })
})
