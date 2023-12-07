#!/bin/bash

# Check if at least one argument is provided
if [ "$#" -eq 0 ]; then
    echo "Please provide at least one argument."
    exit 1
fi

# Find process ID (PID) listening on port 8545
pid=$(lsof -t -i:8545)
# Check if PID is not empty and kill the process
if [ ! -z "$pid" ]; then
  echo "Killing process on port 8545"
  kill $pid
else
  echo "No process running on port 8545"
fi

# Check if the first argument is "all"
if [ "$1" == "all" ]; then
  all_chain_ids=(1 11155111 10 11155420 10200 42161 421614)

  for chain_id in "${all_chain_ids[@]}"
  do
      port=$(( 42000 + (chain_id % 1000) ))
      pid=$(lsof -t -i:$port)
      if [ ! -z "$pid" ]
      then
        echo "Killing process for chain ID $chain_id on port $port"
        kill $pid
      else
        echo "No process running for chain ID $chain_id on port $port"
      fi
  done
else
  # Loop through the chain IDs
  for chain_id in "$@"; do
      port=$(( 42000 + (chain_id % 1000) ))
      pid=$(lsof -t -i:$port)

      if [ ! -z "$pid" ]
      then
        echo "Killing process on port $port"
        kill $pid
      else
        echo "No process running on port $port"
      fi
  done
fi
