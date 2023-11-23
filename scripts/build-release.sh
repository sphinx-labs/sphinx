#!/bin/bash

xargs -n 1 cp -v README.md<<<'./packages/core/ ./packages/plugins/ ./packages/contracts/ ./packages/demo/'
