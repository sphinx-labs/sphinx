#!/bin/bash

# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

# Check if the target directory actually contains contracts. This prevents us from moving the
# contacts to a different location and disabling this test accidentally.
CORE_DIRECTORY="contracts/core"
PLUGIN_DIRECTORY="contracts/foundry"
EXTENSION="sol"
if ! (find "$CORE_DIRECTORY" -maxdepth 1 -name "*.$EXTENSION" -print -quit | grep -q '.') || ! (find "$PLUGIN_DIRECTORY" -maxdepth 1 -name "*.$EXTENSION" -print -quit | grep -q '.'); then
  echo "No Solidity files detected in core or foundry directories. Did you move them and forget to update solc.sh?"
  exit 1
fi

# Compile the core contracts with and without the optimizer. This ensures that we don't release
# contracts that lead to a "Stack too deep" error. In rare situations, it's possible for this error
# to occur when the optimizer is enabled, but not when it's disabled. More commonly, it happens
# when the optimizer is disabled, but not when it's enabled.
FOUNDRY_PROFILE=lite forge build --contracts contracts/core --skip test --skip script
forge build --contracts contracts/core --skip test --skip script --optimize --optimizer-runs 99999999

# This script compiles the prod contracts in our Foundry plugin using the lowest solc version that
# we support, v0.8.0. Without this, it'd be possible for us to accidentally write contracts that
# don't compile with this Solidity version. We don't compile with the earliest version by default
# because we use certain features in our test suite that are only available in newer versions.
forge build --use '0.8.0' --contracts contracts/foundry --skip test --skip script --deny-warnings

# This script compiles the prod contracts in our Foundry plugin using the optimizer. Since the
# optimizer is off in our repo by default, this ensures that we don't release contracts that lead to
# a "Stack too deep" error. In rare situations, it's possible for a "Stack too deep" error to occur
# when the optimizer is enabled, but not when it's disabled.
forge build --optimize --optimizer-runs 200 --contracts contracts/foundry --skip test --skip script

# This script compiles the prod contracts with the optimizer disabled. This ensures we don't release
# contracts that cannot be compiled without the optimizer enabled. Technically this isn't necessary
# because the optimizer is disabled in our repo by default. However, we run this test explicitly just
# in case we at some point enable to optimizer we'll still have coverage for this case.
export FOUNDRY_PROFILE=lite
forge build --contracts contracts/foundry --skip test --skip script
