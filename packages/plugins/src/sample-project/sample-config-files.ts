export const sampleSphinxFileTypeScript = `import { UserSphinxConfig } from '@sphinx-labs/core'

const config: UserSphinxConfig = {
  projectName: 'MyProject',
  contracts: {
    ContractOne: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _number: 1,
        _contractOne: '{{ ContractOne }}',
      },
    },
    ContractTwo: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _number: 2,
        _contractOne: '{{ ContractOne }}',
      },
    },
  },
}

export default config
`

export const sampleSphinxFileJavaScript = `module.exports = {
  projectName: 'MyProject',
  contracts: {
    ContractOne: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _number: 1,
        _contractOne: '{{ ContractOne }}',
      },
    },
    ContractTwo: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _number: 2,
        _contractOne: '{{ ContractOne }}',
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
goerli = "https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"
optimism_goerli = "https://goerli.optimism.io"
arbitrum_goerli = "https://goerli-rollup.arbitrum.io/rpc"
bnb_smart_chain_testnet = "https://rpc.ankr.com/bsc_testnet_chapel"
gnosis_chiado = "https://rpc.chiadochain.net"
polygon_mumbai = "https://rpc-mumbai.maticvigil.com"

[etherscan]
goerli = { key = "\${ETHERSCAN_API_KEY}" }
`

export const sampleDotEnvFile = `PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
GOERLI_RPC_URL=
ETHERSCAN_API_KEY=
`
