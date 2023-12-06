#!/bin/bash

# Check if at least one argument is provided
if [ "$#" -eq 0 ]; then
    echo "Please provide at least one ID as an argument."
    exit 1
fi

# Check if the first argument is "all"
if [ "$1" == "all" ]; then
  all_chain_ids=(1 11155111 10 11155420 10200 421614)

  for chain_id in "${all_chain_ids[@]}"
  do
      port=$(( 42000 + (chain_id % 1000) ))
      pid=$(lsof -t -i:$port)
      if [ ! -z "$pid" ]
      then
        echo "Port for chain ID $chain_id is already running"
      else
        echo "Starting node for chain ID $chain_id on port $port"
        anvil --silent --chain-id "$chain_id" --port "$port" &
      fi
  done
else
  # Loop through the chain IDs
  for chain_id in "$@"; do
    # Compute the port
    port=$(( 42000 + (chain_id % 1000) ))

    echo "Starting node with chain ID $chain_id on port $port"
    # Start the node. We put `> /dev/null 2>&1` at the end of the script to silence both regular
    # output and error messages by sending them to the "black hole" that is /dev/null. This is
    # necessary to invoke this script via FFI from Forge. If we don't do this, the FFI call will
    # never return.
    anvil --silent --chain-id "$chain_id" --port "$port" > /dev/null 2>&1 &
  done
fi
