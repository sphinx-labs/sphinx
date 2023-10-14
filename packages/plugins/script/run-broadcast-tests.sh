#!/bin/bash

# This file contains integration tests for broadcasting deployments onto forks of networks.
# We silence all of the output to make the testing logs easier to read.

# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

source .env

# Kill any existing anvil processes
yarn test:kill > /dev/null

anvil --silent --port 42010 --fork-url https://opt-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY &
anvil --silent --port 42420 --fork-url https://opt-goerli.g.alchemy.com/v2/$ALCHEMY_API_KEY &
anvil --silent --port 42001 --fork-url https://eth-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY &
anvil --silent --port 42005 --fork-url https://eth-goerli.g.alchemy.com/v2/$ALCHEMY_API_KEY &
anvil --silent --port 42161 --fork-url https://arb-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY &
anvil --silent --port 42613 --fork-url https://arb-goerli.g.alchemy.com/v2/$ALCHEMY_API_KEY &
sleep 3

onlyOptimismDeployedBytecode=$(forge inspect contracts/test/ChainSpecific.sol:OnlyOptimism deployedBytecode)
cast rpc --rpc-url http://127.0.0.1:42010 anvil_setCode 0x0000000000000000000000000000000000000100 $onlyOptimismDeployedBytecode > /dev/null
cast rpc --rpc-url http://127.0.0.1:42420 anvil_setCode 0x0000000000000000000000000000000000000100 $onlyOptimismDeployedBytecode > /dev/null

npx sphinx deploy script/ChainSpecific.s.sol --network optimism --confirm --silent
npx sphinx deploy script/ChainSpecific.s.sol --network optimism_goerli --confirm --silent
npx sphinx deploy script/ChainSpecific.s.sol --network ethereum --confirm --silent
npx sphinx deploy script/ChainSpecific.s.sol --network goerli --confirm --silent
npx sphinx deploy script/ChainSpecific.s.sol --network arbitrum --confirm --silent
npx sphinx deploy script/ChainSpecific.s.sol --network arbitrum_goerli --confirm --silent
forge test --match-contract Broadcast

yarn test:kill > /dev/null
