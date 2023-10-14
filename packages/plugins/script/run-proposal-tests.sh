#!/bin/bash

# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

source .env

yarn test:kill > /dev/null

anvil --silent --chain-id 5 --port 42005 &
anvil --silent --chain-id 420 --port 42420 &
anvil --silent --chain-id 10200 --port 42200 &
anvil --silent --chain-id 421613 --port 42613 &
forge test --match-contract Proposal_Initial_Test

# The rest of the tests in this file are meant to occur after a deployment has been completed on the
# networks in `Proposal_Initial_Test`.
npx sphinx deploy test/foundry/Proposal.t.sol --network optimism_goerli  --confirm --target-contract Proposal_Initial_Test --silent
npx sphinx deploy test/foundry/Proposal.t.sol --network goerli  --confirm --target-contract Proposal_Initial_Test --silent

forge test --match-contract Proposal_AddContract_Test
forge test --match-contract Proposal_NewChains_Test

# Run the test for a SphinxManager/SphinxAuth version upgrade.
npx ts-node script/AddVersion.ts
SPHINX_INTERNAL__TEST_VERSION_UPGRADE=true forge test --match-contract Proposal_VersionUpgrade_Test

# Run the test that that cancels a previous deployment. First, we set the storage value of the
# `activeDeploymentId` in the SphinxManager to be non-zero. This replicates what happens when a
# previous deployment is 'stuck' and needs to be cancelled.
cast rpc --rpc-url http://127.0.0.1:42005 anvil_setStorageAt 0xA460E134B1925c980Da2E1930dc44eae4Fe026D5 0x0000000000000000000000000000000000000000000000000000000000000099 0x1111111111111111111111111111111111111111111111111111111111111111 > /dev/null
cast rpc --rpc-url http://127.0.0.1:42420 anvil_setStorageAt 0xA460E134B1925c980Da2E1930dc44eae4Fe026D5 0x0000000000000000000000000000000000000000000000000000000000000099 0x1111111111111111111111111111111111111111111111111111111111111111 > /dev/null
# Bump the block number on both networks. Necessary to make the previous RPC methods take effect.
cast rpc --rpc-url http://127.0.0.1:42005 anvil_mine > /dev/null
cast rpc --rpc-url http://127.0.0.1:42420 anvil_mine > /dev/null
forge test --match-contract Proposal_CancelExistingDeployment_Test

yarn test:kill > /dev/null
