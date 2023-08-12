export const sampleSphinxFileTypeScript = `import { UserSphinxConfig } from '@sphinx-labs/core'

const config: UserSphinxConfig = {
  projectName: 'MyProject',
  contracts: {
    MyFirstContract: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _myNumber: 1,
        _myAddress: '{{ MyFirstContract }}',
      },
    },
    MySecondContract: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _myNumber: 2,
        _myAddress: '{{ MySecondContract }}',
      },
    },
  },
}

export default config
`

export const sampleSphinxFileJavaScript = `module.exports = {
  projectName: 'MyProject',
  contracts: {
    MyFirstContract: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _myNumber: 1,
        _myAddress: '{{ MyFirstContract }}',
      },
    },
    MySecondContract: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _myNumber: 2,
        _myAddress: '{{ MySecondContract }}',
      },
    },
  },
}
`

export const forgeConfig = `[profile.default]
ffi = true
build_info = true
extra_output = ['storageLayout', 'evm.gasEstimates']
fs_permissions = [{ access = "read", path = "./"}]
remappings=[
  'forge-std/=node_modules/forge-std/src/',
  'ds-test/=node_modules/ds-test/src/',
  '@sphinx/=node_modules/@sphinx-labs/plugins/contracts/foundry/'
]

[rpc_endpoints]
anvil = "http://127.0.0.1:8545"
goerli = "https://eth-goerli.g.alchemy.com/v2/demo"
optimism_goerli = "https://opt-goerli.g.alchemy.com/v2/demo"
arbitrum_goerli = "https://arb-goerli.g.alchemy.com/v2/demo"
bnb_smart_chain_testnet = "https://bsc-testnet.publicnode.com"
gnosis_chiado = "https://rpc.chiadochain.net"
polygon_mumbai = "https://polygon-mumbai.g.alchemy.com/v2/demo"

[etherscan]
goerli = { key = "\${ETHERSCAN_API_KEY}" }
`

export const sampleDotEnvFile = `PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
GOERLI_RPC_URL=
ETHERSCAN_API_KEY=
`
