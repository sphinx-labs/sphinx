npx hardhat test test/ManagerUpgrade.spec.ts --config-path \
  sphinx/manager-upgrade.config.ts --signer 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f &&
npx hardhat test test/Validation.spec.ts test/Create3.spec.ts
npx hardhat test test/Storage.spec.ts --log --config-path sphinx/Storage.config.ts --use-default-signer

# We spin up a few nodes to simulate a multi-chain environment
anvil --silent --chain-id 5 --port 42005 --host 0.0.0.0 &
anvil --silent --chain-id 420 --port 42420 --host 0.0.0.0 &
anvil --silent --chain-id 10200 --port 42102 --host 0.0.0.0 &
anvil --silent --chain-id 421613 --port 42613 --host 0.0.0.0 &
npx hardhat test test/MultiChain.spec.ts
yarn test:kill
