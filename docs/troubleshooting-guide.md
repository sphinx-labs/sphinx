# Troubleshooting Guide

This guide covers some common issues you might encounter using Sphinx. If your question isn't answered here, please reach out in the [Discord](https://discord.gg/7Gc3DK33Np).

## Table of Contents

TODO(md-end)

## General

### `Ineffective mark-compacts near heap limit allocation failed` error
This bug can occur in repositories that have a very large number of contracts in them. This causes your build info artifact files to be extremely large, which can cause memory issues when using Sphinx. You can resolve this issue by running `forge clean`, which clears the artifacts directory, including the build info files.

