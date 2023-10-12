#!/bin/bash

# TODO(refactor): explain what this file does and clean it up


# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

source .env

yarn test:kill

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

yarn test:kill
