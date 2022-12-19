# ChugSplash File

A ChugSplash file contains all of the information necessary to define a deployment or upgrade. It includes configuration settings, contract definitions, and state variables. The ChugSplash file replaces deployment scripts, which are used in other tools like [Hardhat](https://hardhat.org/hardhat-runner/docs/guides/deploying) and [Foundry](https://book.getfoundry.sh/tutorials/solidity-scripting).

## Table of Contents

- [Layout of a ChugSplash File](#layout-of-a-chugsplash-file)
  - [Configuration settings](#configuration-settings)
  - [Contract definitions](#contract-definitions)
  - [State variables](#state-variables)

## Layout of a ChugSplash File

```ts
{
    // Configuration settings:
    options: {
        projectName: 'My ERC20 Project',
    },
    // Contract definitions:
    contracts: {
        // First contract definition:
        MyToken: {
            contract: 'ERC20', // Contract name in your Solidity file
            variables: {
                name: 'My Token',
                symbol: 'MYT',
                decimals: 18,
                totalSupply: 1000,
            }
        },
        // Second contract definition:
        MyTokenRegistry: {
            contract: 'ERC20Registry',
            variables: {
                tokenAddress: '{{ MyToken }}', // MyToken's address
                ...
            }
        },
        // Other contract definitions:
        ...
    }
}
```

### Configuration settings

The `options` property in your ChugSplash file contains only a single field, `projectName`. The project name can be any name you choose.

### Contract definitions

The `contracts` property in your ChugSplash file contains all of your contract definitions and each of their state variables.

Each contract definition is keyed by a **contract reference name**, which can be any name you choose. In the sample ChugSplash file above, the first contract's reference name is `MyToken`.

### State variables

The `variables` property contains the state variables and their values. For example, `MyToken` has a `symbol` variable with a value of `'MYT'`.

> Note: ChugSplash assigns values directly to the state variables in your contracts, so you do not need a constructor or initializer function in your contracts.

For a comprehensive reference that explains how to assign values to every variable type in a ChugSplash file, click [here](https://github.com/chugsplash/chugsplash/blob/develop/docs/variables.md).