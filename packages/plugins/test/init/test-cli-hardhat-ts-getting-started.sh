# TODO(docs)
set -e

cd ../../..
mkdir hello_hardhat && cd hello_hardhat

yarn init -y
yarn add --dev @sphinx-labs/plugins

yarn add --dev "hardhat" "ethers" "@nomicfoundation/hardhat-toolbox" "@nomicfoundation/hardhat-network-helpers@^1.0.0" "@nomicfoundation/hardhat-chai-matchers@^2.0.0" "@nomicfoundation/hardhat-ethers@^3.0.0" "@nomicfoundation/hardhat-verify@^1.0.0" "@types/chai@^4.2.0" "@types/mocha@>=9.1.0" "@typechain/ethers-v6@^0.4.0" "@typechain/hardhat@^8.0.0" "chai@^4.2.0" "hardhat-gas-reporter@^1.0.8" "solidity-coverage@^0.8.1" "typechain@^8.2.0"

# Update hardhat.config.ts
touch hardhat.config.ts
echo \
"""
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@sphinx-labs/plugins'

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.19',
        settings: {
          outputSelection: {
            '*': {
              '*': ['storageLayout', 'evm.gasEstimates'],
            },
          },
        },
      },
    ]
  }
}

export default config;
""" \
>> hardhat.config.ts
npx hardhat sphinx-init
npx hardhat test test/HelloSphinx.spec.ts --signer 0 --config-path sphinx/HelloSphinx.config.ts
npx hardhat sphinx-deploy --signer 0 --config-path sphinx/HelloSphinx.config.ts --confirm
anvil --silent & # TODO(docs): we use anvil here b/c...
npx hardhat sphinx-deploy --signer 0 --network localhost --config-path sphinx/HelloSphinx.config.ts --confirm

# TODO(docs)
kill $(lsof -t -i:8545)
