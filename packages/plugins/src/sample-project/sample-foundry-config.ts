import { readdirSync } from 'fs'

const standardRemappings = [
  'forge-std/=node_modules/forge-std/src/',
  'ds-test/=node_modules/ds-test/src/',
]

export const fetchPNPMRemappings = (includeStandard: boolean) => {
  const contracts = readdirSync('./node_modules/.pnpm').find((dir) =>
    dir.startsWith('@sphinx-labs+contracts')
  )
  const plugins = readdirSync('./node_modules/.pnpm').find((dir) =>
    dir.startsWith('@sphinx-labs+plugins')
  )

  if (!plugins || !contracts) {
    throw new Error(
      'Missing pnpm package names. This is likely a bug. Please report it to the Sphinx team.'
    )
  }

  return [
    ...(includeStandard ? standardRemappings : []),
    '@sphinx-labs/plugins/=node_modules/@sphinx-labs/plugins/contracts/foundry/',
    `@sphinx-labs/contracts/=node_modules/.pnpm/${contracts}/node_modules/@sphinx-labs/contracts/`,
    `sphinx-forge-std/=node_modules/.pnpm/${plugins}/node_modules/sphinx-forge-std/src/`,
    `sphinx-solmate/=node_modules/.pnpm/${plugins}/node_modules/sphinx-solmate/src/`,
  ]
}

export const fetchNPMRemappings = (includeStandard: boolean) => [
  ...(includeStandard ? standardRemappings : []),
  '@sphinx-labs/plugins/=node_modules/@sphinx-labs/plugins/contracts/foundry/',
  '@sphinx-labs/contracts/=node_modules/@sphinx-labs/contracts/',
  'sphinx-forge-std/=node_modules/sphinx-forge-std/src/',
  'sphinx-solmate/=node_modules/sphinx-solmate/src/',
]

const fetchConfigRemappings = (pnpm: boolean, includeStandard: boolean) => {
  const remappings = pnpm
    ? fetchPNPMRemappings(includeStandard)
    : fetchNPMRemappings(includeStandard)

  return `remappings=[
  ${remappings.map((remapping) => `'${remapping}',`).join('\n  ')}
]`
}

export const fetchForgeConfig = (
  pnpm: boolean,
  includeStandard: boolean
): string => `[profile.default]
script = 'script'
test = 'test'
build_info = true
extra_output = ['storageLayout']
fs_permissions=[{access="read", path="./out"}, {access="read-write", path="./cache"}]
allow_paths = ["../.."]
${fetchConfigRemappings(pnpm, includeStandard)}

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
  alchemyApiKey: string
): string => {
  return `SPHINX_API_KEY=${sphinxApiKey}\n` + `RPC_API_KEY=${alchemyApiKey}`
}
