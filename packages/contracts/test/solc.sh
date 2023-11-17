#!/bin/bash

# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

# This script compiles the core contracts using the lowest solc version that we support, v0.8.2.
# Without this, it'd be possible for us to accidentally write contracts that don't compile with this
# Solidity version. We don't compile with the earliest version by default because we use certain
# features in our test suite that are only available in newer versions of Solidity.
forge build --use '0.8.2' --deny-warnings --contracts contracts/core --skip test --skip script

# Compile the core contracts with and without the optimizer. This ensures that we don't release
# contracts that lead to a "Stack too deep" error. In rare situations, it's possible for this error
# to occur when the optimizer is enabled, but not when it's disabled. More commonly, it happens
# when the optimizer is disabled, but not when it's enabled.
FOUNDRY_PROFILE=lite forge build --contracts contracts/core --skip test --skip script
forge build --contracts contracts/core --skip test --skip script --optimize --optimizer-runs 99999999
