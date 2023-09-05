# Post-Deployment Actions

It's common for a project to need to execute transactions after a deployment has occurred. This guide will show you how to do that with Sphinx.

## Table of Contents

- [Standard usage](#standard-usage)
- [Calling external contracts](#calling-external-contracts)
- [Chain-specific addresses](#chain-specific-addresses)
- [Chain-specific function arguments](#chain-specific-function-arguments)
- [Using contract references](#using-contract-references)
- [Executing permissioned actions](#executing-permissioned-actions)
  - [OpenZeppelin's `Ownable.sol`](#openzeppelins-ownablesol)
  - [OpenZeppelin's `AccessControl.sol`](#openzeppelins-accesscontrolsol)

## Standard usage

Say you're deploying a contract called `MyContract`, and you'd like to call a function on it called `increment()` after it's deployed. You can do this by updating your config file to include the following:

```ts
// Import Sphinx types.
import { Contract, UserSphinxConfig } from '@sphinx-labs/core'

// Create a new Contract object for 'MyContract'. The contract reference `{{ MyContract }}` resolves
// to the address of 'MyContract'.
const MyContract = new Contract('{{ MyContract }}')

const config: UserSphinxConfig = {
  // Your existing config fields:
  projectName: ...
  contracts: { MyContract: { ... } },
  // Define your post-deployment actions:
  postDeploy: [
    // Call the `increment()` function on `MyContract`:
    MyContract.increment()
  ]
}
```

The `increment()` function will be called on `MyContract` for every chain that you deploy to.

It's important to note that the post-deployment actions are executed after **all** of the contracts in the config file have been deployed.

You can put as many function calls as you'd like in the `postDeploy` array. For example:
```ts
postDeploy: [
  MyContract.increment(),
  MyContract.setMyValue(2),
  MyContract.transferOwnership('0x1234...')
]
```

The post-deployment actions are executed in the order they're defined in the `postDeploy` array. So, in the example above, the order would be: `increment`, `setMyValue`, then `transferOwnership`.

Like contract deployments, your post-deployment actions are idempotent. This means that they'll only be executed once per chain, even if you re-deploy your config file. However, if you change an aspect of a post-deployment action between deployments, such as a function parameter, then that action will be re-executed.

## Calling external contracts

You may want to call a function on a contract that you're not deploying in your config file. Here's how to do this in your config file:

```ts
// Import Sphinx types.
import { Contract, UserSphinxConfig } from '@sphinx-labs/core'
import { ExternalContractABI } from './path/to/abi'

// Create a new Contract object for 'ExternalContract' using its address and ABI.
const MyExternalContract = new Contract('0x1234...', {
  abi: ExternalContractABI,
})

const config: UserSphinxConfig = {
  // Existing config fields:
  ...
  // Add your function calls:
  postDeploy: [
    MyExternalContract.myExternalFunction(1234),
    MyExternalContract.myOtherExternalFunction('hello')
  ]
}
```

It's required to pass in the ABI when creating a `Contract` object for an external contract. Otherwise, Sphinx won't know how to encode the function arguments.

## Chain-specific addresses

You'll often find that external contracts have different addresses across chains. Here's how to override the default address on a chain-by-chain basis for an external contract:

```ts
// Create a new Contract object with '0x1234...' as the default address.
const MyExternalContract = new Contract('0x1234...', {
  abi: ExternalContractABI,
  overrides: [
    // Use address '0x1111...' for 'optimism-goerli'.
    {
      chains: ['optimism-goerli'],
      address: '0x1111...',
    },
    // Use address '0x2222...' for 'goerli' and 'arbitrum-goerli'.
    {
      chains: ['goerli', 'arbitrum-goerli'],
      address: '0x2222...',
    },
    // More overrides can go here:
    // ...
  ],
})
```

The default address is used for any chains that aren't specified in the `overrides` array. In the example above, the default address is `0x1234...`. So, `0x1234...` will be used for any chains that aren't `optimism-goerli`, `goerli`, or `arbitrum-goerli`.

## Chain-specific function arguments

You can also specify chain-specific arguments for functions that you're calling. For example, say you have the following function in your Solidity contract:
```sol
contract MyContract {
  function myFunction(
      uint _myUint,
      string _myStr,
      address _myAddr
  ) public {
      ...
  }
}
```

Here's how to do this in your config file:

```ts
const MyContract = new Contract(...)

const config: UserSphinxConfig = {
  ...
  postDeploy: [
    MyContract.myFunction(
      // Default arguments:
      123,
      'hello',
      '0x1111...',
      // Options object that contains chain-specific overrides:
      {
        overrides: [
          // Override the default value of `_myUint` for 'optimism-goerli' and 'goerli'.
          {
            args: { _myUint: 456 },
            chains: ['optimism-goerli', 'goerli'],
          },
          // Override the default value of `_myAddr` and `_myStr` for 'arbitrum-goerli'.
          {
            args: { _myAddr: '0x4444...', _myStr: 'hey-arbitrum' },
            chains: ['arbitrum-goerli'],
          },
        ],
      }
    ),
  ],
}
```

The default values are used for any chains that aren't specified in the `overrides` array. In the example above, the default values are `123`, `hello`, and `0x1111...`. So, `123`, `hello`, and `0x1111...` will be used for any chains that aren't `optimism-goerli`, `goerli`, or `arbitrum-goerli`.

## Using contract references

You can put [contract references](https://github.com/sphinx-labs/sphinx/blob/develop/docs/variables.md#contract-references) anywhere in the `postDeploy` array. For example:

```ts
const MyContractObject = new Contract(...)

const config: UserSphinxConfig = {
  contracts: {
    MyContract: { ... },
    MyOtherContract: { ... }
  },
  postDeploy: [
    // Uses the address of 'MyOtherContract' as the argument.
    MyContractObject.setAddress('{{ MyOtherContract }}'),
    // Uses a default argument of '0x1111...' for the variable '_myAddr' and overrides
    // it for 'optimism-goerli' with the address of 'MyContract'.
    MyContractObject.setChainSpecificAddress('0x1111...', {
      overrides: [
        {
          args: { _myAddr: '{{ MyContract }}' },
          chains: ['optimism-goerli'],
        },
      ],
    }),
  ],
}
```

## Executing permissioned actions

Your post-deployment actions may involve sending permissioned transactions that use access control modules like OpenZeppelin's `Ownable.sol` or `AccessControl.sol`. To do this, you simply need to make sure that your `SphinxManager` contract has the necessary permissions to call these functions. (To learn about the `SphinxManager` contract, [click here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md)).

You must transfer ownership of your contracts to the final owner (e.g. your team's multi-sig) at the end of the `postDeploy` array in your config file. This ensures that your `SphinxManager` no longer has permission to call these functions after the actions have been executed.

We highly recommend testing post-deployment actions by deploying your config file locally. The post-deployment actions will be executed automatically when you deploy your config. If you need to refresh your memory on how to deploy locally with Sphinx, see any of the [Getting Started guides](https://github.com/sphinx-labs/sphinx/blob/develop/README.md#getting-started) to set up a basic testing structure.

### OpenZeppelin's `Ownable.sol`

Your contract's constructor should look something like this:

```sol
constructor(address _sphinxManager) {
    _transferOwnership(_sphinxManager);
}
```

> Technical note: You may be curious why it's necessary to call `_transferOwnership` in your constructor since `Ownable` automatically transfers ownership to the deployer of your contract, and the `SphinxManager` is meant to be your contract's deployer. The answer is that the deployer of your contract is technically *not* the `SphinxManager`. Instead, it's a mini `CREATE3` proxy that's deployed via `delegatecall` from your `SphinxManager`. The upshot is that if you don't call `_transferOwnership` in your constructor, then the `CREATE3` proxy will retain ownership of your contract, which effectively disables any ownership functionality.

Your config file should look something like this:

```ts
const MyOwnableContract = new Contract('{{ MyOwnableContract }}')

const config: UserSphinxConfig = {
  contracts: {
    MyOwnableContract: {
      constructorArgs: {
        // This contract reference resolves to the address of the
        // SphinxManager contract:
        _sphinxManager: '{{ SphinxManager }}'
      },
      ...
    },
  },
  postDeploy: [
    // Your permissioned actions go here:
    MyOwnableContract.myPermissionedAction(),
    ...
    // Transfer ownership to your final owner at the end:
    MyOwnableContract.transferOwnership('0x1234...')
  ]
}
```

### OpenZeppelin's `AccessControl.sol`

Your contract will look something like this:

```sol
contract MyAccessControlContract is AccessControl {
    constructor(address _sphinxManager) {
        // Grant the SphinxManager the `DEFAULT_ADMIN_ROLE`, which is `bytes32(0)`.
        _setupRole(DEFAULT_ADMIN_ROLE, _sphinxManager);
    }

    function myAccessControlFunction(...) external onlyRole(DEFAULT_ADMIN_ROLE) { ... }
}
```

Your config file should look something like this:

```ts
const MyAccessControlContract = new Contract('{{ MyAccessControlContract }}')

const userConfig: UserConfig = {
  contracts: {
    MyAccessControlContract: {
      constructorArgs: {
        _sphinxManager: '{{ SphinxManager }}',
      },
      ...
    },
  },
  postDeploy: [
    // Your permissioned actions go here:
    MyAccessControlContract.myAccessControlFunction(...),
    ...
    // Grant the `DEFAULT_ADMIN_ROLE` to the final owner:
    MyAccessControlContract.grantRole(ethers.ZeroHash, finalOwner),
    // Revoke the `DEFAULT_ADMIN_ROLE` from the SphinxManager:
    MyAccessControlContract.renounceRole(
      ethers.ZeroHash,
      '{{ SphinxManager }}'
    ),
  ],
}
```
