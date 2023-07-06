npx hardhat test test/ManagerUpgrade.spec.ts --config-path chugsplash/manager-upgrade.config.ts \
  --signer 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f &&
npx hardhat test test/main/* --config-path chugsplash/main.config.ts --projects 'Create3, Storage' --use-default-signer
