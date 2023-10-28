export const forgeConfig = `[profile.default]
script = 'script'
test = 'test'
ffi = true
build_info = true
extra_output = ['storageLayout', 'evm.gasEstimates']
fs_permissions = [{ access = "read-write", path = "./"}]
allow_paths = ["../.."]
# We highly recommend setting the optimizer to 'false' for development because
# this makes compilation happen ~5x faster. See here for more details:
# https://book.getfoundry.sh/reference/forge/forge-build?highlight=optimizer#conditional-optimizer-usage
optimizer = false
remappings=[
  '@sphinx-labs/plugins/=node_modules/@sphinx-labs/plugins/contracts/foundry/',
  '@sphinx-labs/contracts/=node_modules/@sphinx-labs/contracts/',
  'sphinx-forge-std/=node_modules/sphinx-forge-std/src/',
  'sphinx-solmate/=node_modules/sphinx-solmate/src/'
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

export const sampleGitIgnoreFile = `# Compiler files
cache/
out/

# Ignores development broadcast logs
!/broadcast
/broadcast/*/31337/
/broadcast/**/dry-run/

# Docs
docs/

# Dotenv file
.env

# Yarn
node_modules/

# Sphinx
client/
`
