#!/bin/bash

killPorts=(42005 42420 42102 42613)
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
