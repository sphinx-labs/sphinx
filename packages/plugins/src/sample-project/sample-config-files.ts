export const sampleSphinxFileTypeScript = `import { UserConfig } from '@sphinx/core'

const config: UserConfig = {
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

export const sampleSphinxFileJavaScript = `
module.exports = {
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
  'forge-std/=node_modules/@sphinx/plugins/node_modules/forge-std/src/',
  'ds-test/=node_modules/@sphinx/plugins/node_modules/ds-test/src/',
  '@sphinx/plugins=node_modules/@sphinx/plugins/contracts/foundry',
  '@sphinx/contracts=node_modules/@sphinx/contracts/'
]

[rpc_endpoints]
anvil = "http://127.0.0.1:8545"
goerli = "\${GOERLI_RPC_URL}"

[etherscan]
goerli = { key = "\${ETHERSCAN_API_KEY}" }
`

export const sampleDotEnvFile = `PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
GOERLI_RPC_URL=
ETHERSCAN_API_KEY=
`
