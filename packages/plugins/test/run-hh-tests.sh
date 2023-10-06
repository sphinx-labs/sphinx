#!/bin/bash

# TODO: change naem of this file

# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
# set -e # TODO: undo

# We spin up a few nodes to simulate a multi-chain deployment
anvil --silent --chain-id 5 --port 42005 &
anvil --silent --chain-id 420 --port 42420 &
anvil --silent --chain-id 10200 --port 42200 &
anvil --silent --chain-id 421613 --port 42613 &
anvil --silent --chain-id 84531 --port 42531 &
# forge test --match-path test/foundry/Proposal.t.sol -vvv # TODO: make more generic
# yarn test:kill

# TODO
# # We spin up a few nodes to test multi-chain overrides
# anvil --silent &
# anvil --silent --chain-id 5 --port 42005 &
# anvil --silent --chain-id 420 --port 42420 &
# anvil --silent --chain-id 10200 --port 42200 &
# anvil --silent --chain-id 421613 --port 42613 &
# anvil --silent --chain-id 84531 --port 42531 &
# npx hardhat test test/ChainOverrides.spec.ts
# yarn test:kill

# # Spin up a few nodes to test post-deployment actions
# anvil --silent &
# anvil --silent --chain-id 5 --port 42005 &
# anvil --silent --chain-id 420 --port 42420 &
# anvil --silent --chain-id 10200 --port 42200 &
# anvil --silent --chain-id 421613 --port 42613 &
# anvil --silent --chain-id 84531 --port 42531 &
# npx hardhat test test/PostDeploymentActions.spec.ts
# yarn test:kill
