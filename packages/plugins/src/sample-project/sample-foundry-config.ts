import { RECOMMENDED_REMAPPING } from '@sphinx-labs/contracts'

const standardRemappings = [
  'forge-std/=node_modules/forge-std/src/',
  'ds-test/=node_modules/ds-test/src/',
]

export const fetchRemappings = (includeStandard: boolean) => [
  ...(includeStandard ? standardRemappings : []),
  RECOMMENDED_REMAPPING,
]

const fetchConfigRemappings = (includeStandard: boolean) => {
  const remappings = fetchRemappings(includeStandard)

  return `remappings=[
  ${remappings.map((remapping) => `'${remapping}',`).join('\n  ')}
]`
}

export const fetchForgeConfig = (
  includeStandard: boolean
): string => `[profile.default]
script = 'script'
test = 'test'
extra_output = ['storageLayout']
fs_permissions=[{access="read", path="./out"}, {access="read-write", path="./cache"}, { access = "read", path="./sphinx.lock" }]
allow_paths = ["../.."]
${fetchConfigRemappings(includeStandard)}

[rpc_endpoints]
anvil = "http://127.0.0.1:8545"
sepolia = "https://eth-sepolia.g.alchemy.com/v2/\${RPC_API_KEY}"
optimism_sepolia = "https://opt-sepolia.g.alchemy.com/v2/\${RPC_API_KEY}"
arbitrum_sepolia = "https://arb-sepolia.g.alchemy.com/v2/\${RPC_API_KEY}"
`

export const sampleGitIgnoreFile = `# Compiler files
cache/
out/

# Ignores development broadcast logs
!/broadcast
/broadcast/*/31337/
/broadcast/**/dry-run/

# Dotenv file
.env

# Node
node_modules/
dist/
`

export const fetchDotEnvFile = (
  sphinxApiKey: string,
  sphinxOrgId: string,
  alchemyApiKey: string
): string => {
  return `SPHINX_API_KEY=${sphinxApiKey}\n` + `RPC_API_KEY=${alchemyApiKey}`
}
