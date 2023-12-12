#!/bin/bash

# This script creates a temporary placeholder file for the `sphinx` binary in the `plugins` package.
# This prevents the Yarn installation process from failing in CI and local setups that are building
# the monorepo from scratch. This prevents an error that would occur during `yarn install`.
# Specifically, the `demo` package requires the `sphinx` binary to exist in the `plugins` package
# during `yarn install`. However, the `sphinx` binary is created during `yarn build`, which occurs
# after `yarn install`. If we don't use a placeholder file, the installation  would fail because of
# the missing `sphinx` binary. The placeholder file is overwritten after the build process finishes.

# Path to the placeholder file
placeholderFile="packages/plugins/dist/cli/index.js"

# Check if the file exists, if not create it
if [ ! -f "$placeholderFile" ]; then
    echo "Creating placeholder file at $placeholderFile"
    mkdir -p $(dirname "$placeholderFile")
    touch "$placeholderFile"
fi
