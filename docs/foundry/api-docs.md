# ChugSplash API Documentation

This document is a work in progress.

## Table of Contents

- [Deploy](#Deploy)
- [Get Address](#Get-Address)

## Deploy
Performs a complete deployment of a ChugSplash config file against the specified rpc url.
```
deploy('./chugsplash.config.ts', 'http://localhost:8545');
deploy('./chugsplash.config.ts', vm.rpcUrl("anvil"));
```

## Get Address
Fetches a contract address using the config, the contracts reference name, and an optional salt. Note that this function will only work if the config and contract were deployed previously in the same script.

```
getAddress('./chugsplash.config.ts', 'TestContract');
getAddress('./chugsplash.config.ts', 'TestContract', 1)
```
