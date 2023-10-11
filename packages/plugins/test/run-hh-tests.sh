#!/bin/bash

# TODO(refactor): change naem of this file
# TODO(refactor): explain what this file does and clean it up


# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

source .env

yarn test:kill # TODO: rm
# TODO: uncomment
# Spin up a few nodes to simulate a multi-chain deployment
anvil --silent --chain-id 5 --port 42005 &
anvil --silent --chain-id 420 --port 42420 &
anvil --silent --chain-id 10200 --port 42200 &
anvil --silent --chain-id 421613 --port 42613 &
forge test --match-contract Proposal_Test # TODO: make more generic
npx sphinx deploy test/foundry/Proposal.t.sol --network optimism_goerli  --confirm --target-contract Proposal_Test
npx sphinx deploy test/foundry/Proposal.t.sol --network goerli  --confirm --target-contract Proposal_Test
forge test --match-contract ProposalSecond_Test # TODO: make more generic
forge test --match-contract ProposalThird_Test # TODO: make more generic
npx ts-node test/script/AddVersion.ts
SPHINX_INTERNAL__TEST_VERSION_UPGRADE=true forge test --match-contract ProposalFourth_Test # TODO: make more generic
# TODO(docs): explain why we don't do this in solidity
cast rpc --rpc-url http://127.0.0.1:42005 anvil_setStorageAt 0xA460E134B1925c980Da2E1930dc44eae4Fe026D5 0x0000000000000000000000000000000000000000000000000000000000000099 0x1111111111111111111111111111111111111111111111111111111111111111
cast rpc --rpc-url http://127.0.0.1:42420 anvil_setStorageAt 0xA460E134B1925c980Da2E1930dc44eae4Fe026D5 0x0000000000000000000000000000000000000000000000000000000000000099 0x1111111111111111111111111111111111111111111111111111111111111111
cast rpc --rpc-url http://127.0.0.1:42005 anvil_mine
cast rpc --rpc-url http://127.0.0.1:42420 anvil_mine
forge test --match-contract ProposalFifth_Test # TODO: make more generic
# yarn test:kill

# anvil --silent --port 42010 --fork-url https://opt-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY &
# anvil --silent --port 42420 --fork-url https://opt-goerli.g.alchemy.com/v2/$ALCHEMY_API_KEY &
# anvil --silent --port 42001 --fork-url https://eth-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY &
# anvil --silent --port 42005 --fork-url https://eth-goerli.g.alchemy.com/v2/$ALCHEMY_API_KEY &
# anvil --silent --port 42161 --fork-url https://arb-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY &
# anvil --silent --port 42613 --fork-url https://arb-goerli.g.alchemy.com/v2/$ALCHEMY_API_KEY &
# sleep 3

# onlyOptimismDeployedBytecode=$(forge inspect contracts/test/ChainSpecific.sol:OnlyOptimism deployedBytecode)
# cast rpc --rpc-url http://127.0.0.1:42010 anvil_setCode 0x0000000000000000000000000000000000000100 $onlyOptimismDeployedBytecode
# cast rpc --rpc-url http://127.0.0.1:42420 anvil_setCode 0x0000000000000000000000000000000000000100 $onlyOptimismDeployedBytecode

# npx sphinx deploy script/ChainSpecificConfiguration.s.sol --network optimism --confirm
# npx sphinx deploy script/ChainSpecificConfiguration.s.sol --network optimism_goerli --confirm
# npx sphinx deploy script/ChainSpecificConfiguration.s.sol --network ethereum --confirm
# npx sphinx deploy script/ChainSpecificConfiguration.s.sol --network goerli --confirm
# npx sphinx deploy script/ChainSpecificConfiguration.s.sol --network arbitrum --confirm
# npx sphinx deploy script/ChainSpecificConfiguration.s.sol --network arbitrum_goerli --confirm
# forge test --match-contract Broadcast
# # yarn test:kill

# # Spin up a few nodes to test post-deployment actions
# anvil --silent &
# anvil --silent --chain-id 5 --port 42005 &
# anvil --silent --chain-id 420 --port 42420 &
# anvil --silent --chain-id 10200 --port 42200 &
# anvil --silent --chain-id 421613 --port 42613 &
# anvil --silent --chain-id 84531 --port 42531 &
# npx hardhat test test/PostDeploymentActions.spec.ts
# yarn test:kill
