# ChugSplash File

A ChugSplash config file contains all of the information necessary to deploy and upgrade a project. It includes configuration settings, contract definitions, and state variable definitions. ChugSplash config files replace deployment scripts, which are used in other tools like [hardhat-deploy](https://github.com/wighawag/hardhat-deploy) and [OpenZeppelin Upgrades](https://docs.openzeppelin.com/upgrades-plugins/1.x/#hardhat-usage).

> Note: We recommend that you put all of the contracts in a project into a single ChugSplash config file. To upgrade contracts in a project, you should modify its existing ChugSplash config file. Don't create a new one. You should only create a second ChugSplash config file if you're creating a new project that is entirely distinct from the first (i.e. no overlapping contract definitions).

## Table of Contents

- [Layout of a ChugSplash File](#layout-of-a-chugsplash-file)
  - [Configuration settings](#configuration-settings)
  - [Contract definitions](#contract-definitions)
  - [State variables](#state-variables)

## Layout of a ChugSplash File

ChugSplash config files can be defined in TypeScript, JavaScript, or JSON. A sample ChugSplash config file in TypeScript is shown below.

```ts
{
    // Configuration settings:
    options: {
        projectName: 'My ERC20 Project',
        organizationId: '0x0000000000000000000000000000000000000000000000000000000000000000'
    },
    // Contract definitions:
    contracts: {
        // First contract definition:
        MyToken: {
            contract: 'ERC20', // Contract name in your Solidity source file
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

The `options` property in your ChugSplash config file contains two fields, `projectName` and `organizationId`. The project
name can be any name you choose and should uniquely identify a project within your organization. The Organization Id is a
unique 32 byte hex string that identifies your organization. If you're using ChugSplash managed, we will provide you with
an organization id. If not, then you will need to generate one yourself using ethers:
```
organizationID: ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(projectName)
),
```

Once you've deployed a project using ChugSplash, you must keep the same `organizationId` and `projectName` for subsequent upgrades. Note that both project names and organization ids are case sensitive.

### Contract definitions

The `contracts` property in your ChugSplash config file contains all of your contract definitions and each of their state variables.

Each contract definition is keyed by a **reference name**, which can be any name you choose. In the sample ChugSplash config file above, the first contract's reference name is `MyToken`.

Each contract definition has the following fields:
* `contract`: The contract name in your Solidity source file. For example: `'ERC20'`
* `variables`: Object containing the contract's state variables and their values.
* `constructorArgs`: Object containing the contract's constructor arguments and their values.
* `proxy` (optional): The address of your proxy. This is only required if the proxy was originally deployed using a tool other than ChugSplash. Otherwise, leave it blank.

### State variables

Inside each contract definition, the `variables` property contains the contract's state variables and their values. For example, the `MyToken` contract has a `symbol` variable with a value of `'MYT'`.

For an API reference that explains how to assign values to every variable type in a ChugSplash config file, click [here](https://github.com/chugsplash/chugsplash/blob/develop/docs/variables.md).

> Note: You do not need a constructor or initializer function in your contracts. This is because ChugSplash converts the variable definitions into `SSTORE` actions, which are executed in each proxy. This allows us to guarantee that the deployment or upgrade is deterministic (i.e. it can't halt for any reason), unlike standard deployment scripts. Removing the need for constructors and initializers also ensures that the proxies can't accidentally remain in an uninitialized state, which is often the cause of on-chain security vulnerabilities.
