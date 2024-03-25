#!/bin/bash

# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

# Function to kill process if running on a given port
kill_if_running() {
    local port=$1
    local pid

    # Find process ID (PID) listening on the port. We append `|| true` so that
    # this statement doesn't error if the port isn't active.
    pid=$(lsof -t -i:$port || true)

    # If a PID is found, kill the process
    if [ ! -z "$pid" ]; then
        echo "Killing process on port $port"
        kill $pid
    else
        echo "No process found on port $port"
    fi
}

# Kill any Anvil nodes that may be running on specified ports
kill_if_running 42001
kill_if_running 42005
kill_if_running 42010

# Spin up a few Anvil nodes to test multi-chain deployments
anvil --chain-id 1 --port 42001 --silent &
anvil --chain-id 5 --port 42005 --silent &
anvil --chain-id 10 --port 42010 --silent &

# Define the dummy deployment info path, which will contain data after running
# the Forge tests. We use an environment variable so we can access it in our
# tests, and so we can delete the file contents when the tests finish.
export DUMMY_DEPLOYMENT_INFO_PATH="dummyDeploymentInfoPath.json"

forge test

# Kill the Anvil nodes
kill $(lsof -t -i:42001)
kill $(lsof -t -i:42005)
kill $(lsof -t -i:42010)

# Delete the dummy deployment info file, which was written during the Forge tests.
rm "$DUMMY_DEPLOYMENT_INFO_PATH"
