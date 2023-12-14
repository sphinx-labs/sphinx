#!/bin/bash

# This setting ensures that this script will exit if any subsequent command in this script fails.
# Without this, the CI process will pass even if tests in this script fail.
set -e

# Compile the core contracts with and without the optimizer. This ensures that we don't release
# contracts that lead to a "Stack too deep" error. In rare situations, it's possible for this error
# to occur when the optimizer is enabled, but not when it's disabled. More commonly, it happens
# when the optimizer is disabled, but not when it's enabled.
FOUNDRY_PROFILE=lite forge build --contracts contracts/core --skip test --skip script
forge build --contracts contracts/core --skip test --skip script --optimize --optimizer-runs 99999999
