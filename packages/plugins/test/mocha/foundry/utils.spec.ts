import { resolve } from 'path'
import { existsSync } from 'fs'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

chai.use(chaiAsPromised)
const expect = chai.expect

import {
  convertLibraryFormat,
  messageArtifactNotFound,
  readContractArtifact,
  replaceEnvVariables,
} from '../../../src/foundry/utils'
import { getFoundryToml } from '../../../src/foundry/options'

describe('Utils', async () => {
  describe('readContractArtifact', async () => {
    const projectRoot = process.cwd()

    let artifactFolder: string

    before(async () => {
      const foundryToml = await getFoundryToml()
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

    // Tests scenarios where there are multiple contracts with the same name but located in
    // different directories or with different source file names.
    it('Gets artifacts for contracts with the same name', async () => {
      // The source name and contract name of this contract match.
      const contractOne =
        'contracts/test/DuplicateContractName.sol:DuplicateContractName'
      // The source name and contract name of this contract don't match.
      const contractTwo = 'contracts/test/MyContracts.sol:DuplicateContractName'
      // This contract's source file is nested one level. We use the absolute path because it's
      // possible that the artifact path is an absolute path in production. This isn't strictly
      // necessary to test, but it adds variety to this test case.
      const absolutePath = resolve(
        'contracts/test/deep/DuplicateContractName.sol'
      )
      const contractThree = `${absolutePath}:DuplicateContractName`
      // This contract's source file is nested two levels.
      const contractFour =
        'contracts/test/deep/deeper/DuplicateContractName.sol:DuplicateContractName'
      // This contract is nested only one level, but it shares a parent source directory with the
      // previous contract. (They both exist in a `deeper` directory).
      const contractFive =
        'contracts/test/deeper/DuplicateContractName.sol:DuplicateContractName'

      const artifactOne = await readContractArtifact(
        contractOne,
        projectRoot,
        artifactFolder
      )
      const artifactTwo = await readContractArtifact(
        contractTwo,
        projectRoot,
        artifactFolder
      )
      const artifactThree = await readContractArtifact(
        contractThree,
        projectRoot,
        artifactFolder
      )
      const artifactFour = await readContractArtifact(
        contractFour,
        projectRoot,
        artifactFolder
      )
      const artifactFive = await readContractArtifact(
        contractFive,
        projectRoot,
        artifactFolder
      )

      // Check that the location of the artifact files is correct.
      // First contract:
      expect(
        existsSync(
          `${artifactFolder}/DuplicateContractName.sol/DuplicateContractName.json`
        )
      ).equals(true)
      // Second contract:
      expect(
        existsSync(
          `${artifactFolder}/MyContracts.sol/DuplicateContractName.json`
        )
      ).equals(true)
      // Third contract:
      expect(
        existsSync(
          `${artifactFolder}/deep/DuplicateContractName.sol/DuplicateContractName.json`
        )
      ).equals(true)
      // Fourth contract:
      expect(
        existsSync(
          `${artifactFolder}/deeper/DuplicateContractName.sol/DuplicateContractName.json`
        )
      ).equals(true)
      // Fifth contract:
      expect(
        existsSync(
          `${artifactFolder}/test/deeper/DuplicateContractName.sol/DuplicateContractName.json`
        )
      ).equals(true)

      // Check that we retrieved the correct artifacts.
      expect(
        artifactOne.abi.some((e) => e.name === 'duplicateContractOne')
      ).equals(true)
      expect(
        artifactTwo.abi.some((e) => e.name === 'duplicateContractTwo')
      ).equals(true)
      expect(
        artifactThree.abi.some((e) => e.name === 'duplicateContractThree')
      ).equals(true)
      expect(
        artifactFour.abi.some((e) => e.name === 'duplicateContractFour')
      ).equals(true)
      expect(
        artifactFive.abi.some((e) => e.name === 'duplicateContractFive')
      ).equals(true)
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
})
