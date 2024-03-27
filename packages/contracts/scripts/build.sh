#!/bin/bash

# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

forge clean
forge build --build-info --contracts contracts/core --extra-output storageLayout --skip test --skip script
forge build --build-info --contracts contracts/periphery --extra-output storageLayout --skip test --skip script
yarn generate
forge build
yarn build:ts
