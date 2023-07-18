npx hardhat test test/ManagerUpgrade.spec.ts --project ManagerUpgrade --config-path \
  sphinx/manager-upgrade.config.ts  --signer 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f &&
npx hardhat test test/main/* --config-path sphinx/main.config.ts --projects 'Create3, Storage' --use-default-signer
npx hardhat test test/Validation.spec.ts --disable-sphinx

# We spin up two nodes to simulate a multi-chain environment
anvil --silent --chain-id 5 --port 8545 --host 0.0.0.0 &
anvil --silent --chain-id 420 --port 8546 --host 0.0.0.0 &
npx hardhat test test/Org.spec.ts
yarn test:kill
