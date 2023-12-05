const standardRemappings = [
  'forge-std/=node_modules/forge-std/src/',
  'ds-test/=node_modules/ds-test/src/',
]

export const fetchPNPMRemappings = (
  plugins: string | undefined,
  contracts: string | undefined,
  includeStandard: boolean
) => {
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

const fetchConfigRemappings = (
  pnpm: boolean,
  plugins: string | undefined,
  contracts: string | undefined,
  includeStandard: boolean
) => {
  const remappings = pnpm
    ? fetchPNPMRemappings(plugins, contracts, includeStandard)
    : fetchNPMRemappings(includeStandard)

  return `remappings=[
  ${remappings.map((remapping) => `'${remapping}',`).join('\n  ')}
]`
}

export const fetchForgeConfig = (
  pnpm: boolean,
  plugins: string | undefined,
  contracts: string | undefined,
  includeStandard: boolean
) => `[profile.default]
script = 'script'
test = 'test'
ffi = true
build_info = true
extra_output = ['storageLayout']
fs_permissions = [{ access = "read-write", path = "./"}]
allow_paths = ["../.."]
${fetchConfigRemappings(pnpm, plugins, contracts, includeStandard)}

[rpc_endpoints]
anvil = "http://127.0.0.1:8545"
`

export const sampleDotEnvFile = `PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
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
