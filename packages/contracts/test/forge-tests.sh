#!/bin/bash

# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

# Kill any Anvil nodes that may be running.
kill $(lsof -t -i:42001)
kill $(lsof -t -i:42005)
kill $(lsof -t -i:42010)

# Spin up a few Anvil nodes to test multi-chain deployments
anvil --chain-id 1 --port 42001 --silent &
anvil --chain-id 5 --port 42005 --silent &
anvil --chain-id 10 --port 42010 --silent &

# TODO: rm
# forge test
forge test --match-test test_multichain_execute_success_different -vvvv

# Kill the Anvil nodes
kill $(lsof -t -i:42001)
kill $(lsof -t -i:42005)
kill $(lsof -t -i:42010)
