# TODO(docs)
# TODO: make sure this is in every bash script:
set -e

# TODO(docs)
cd ../../..
forge init hello_foundry && cd hello_foundry

# TODO(docs)
yarn add --dev @sphinx-labs/plugins
echo "node_modules" >> .gitignore # Write "node_modules" to `.gitignore`
forge install foundry-rs/forge-std --no-commit
# Write settings, rpc endpoint, and remappings to `foundry.toml`:
# (Note that the settings are applied even though they're not written to `[profile.default]`).
echo \
"""
ffi = true
build_info = true
extra_output = ['storageLayout', 'evm.gasEstimates']
fs_permissions = [{ access = 'read', path = './'}]
remappings=[
  '@sphinx-labs/plugins=node_modules/@sphinx-labs/plugins/contracts/foundry',
  '@sphinx-labs/contracts=node_modules/@sphinx-labs/contracts/'
]

[rpc_endpoints]
anvil = 'http://127.0.0.1:8545'

""" \
>> foundry.toml
npx sphinx init --ts
forge test --match-contract HelloSphinxTest
npx sphinx deploy --config sphinx/HelloSphinx.config.ts --confirm
anvil --silent & # TODO(docs):
npx sphinx deploy --config sphinx/HelloSphinx.config.ts --broadcast --rpc \
  http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --confirm # TODO(docs)

# TODO(docs)
kill $(lsof -t -i:8545)
