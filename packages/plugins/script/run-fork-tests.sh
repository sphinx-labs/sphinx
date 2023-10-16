#!/bin/bash

# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

# Kill any existing anvil processes
yarn test:kill > /dev/null

anvil --silent --chain-id 1 --port 42001 &
anvil --silent --chain-id 5 --port 42005 &
anvil --silent --chain-id 10 --port 42010 &
sleep 1

forge test --match-contract Fork

yarn test:kill > /dev/null
