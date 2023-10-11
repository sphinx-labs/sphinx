#!/bin/bash

killPorts=(42161 42001 42005 42010 42420 42200 42613 42531 8545)
for i in "${killPorts[@]}"
do
    pid=$(lsof -t -i:$i)
    if [ ! -z "$pid" ]
    then
      echo "Killing process $pid listening on port $i"
      kill $pid
    else
      echo "No process running on port $i"
    fi
done
