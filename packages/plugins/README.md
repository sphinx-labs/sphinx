# ChugSplash Tutorial

This tutorial will walk you through the process of deploying your first smart contract using the ChugSplash Hardhat plugin.

## Installation

With Yarn:
```
yarn add --dev @chugsplash/plugins @chugsplash/core
```
With npm:
```
npm install --save-dev @chugsplash/plugins @chugsplash/core
```

## Setup
In `hardhat.config.ts`, import `chugsplash/plugins`:
```ts
import '@chugsplash/plugins'
```

Update the `outputSelection` setting in `hardhat.config.ts`:
```ts
const config: HardhatUserConfig = {
    ...
    solidity: {
        ...
        settings: {
            // you must include the following
            outputSelection: {
                '*': {
                  '*': ['storageLayout']
                }
            }
        }
    }
}
export default config
```

## Tutorial
1. In your existing contracts folder, create a contract called `SimpleStorage.sol`. Copy and paste its contents:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract SimpleStorage {
    uint8 public number;
    bool public stored;
    address public otherStorage;
    string public storageName;
}
```

2. Create a `chugsplash/` folder, and a ChugSplash config file inside it. We'll call the config file `SimpleStorage.config.ts`.
```
mkdir chugsplash && echo > chugsplash/SimpleStorage.config.ts
```

3. Copy and paste the following into your ChugSplash config file:
```typescript
import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'My First Project',
  },
  // Below, we define all of the contracts in the deployment along with their state variables.
  contracts: {
    FirstSimpleStorage: {
      contract: 'SimpleStorage',
      variables: {
        number: 1,
        stored: true,
        storageName: 'First',
        otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  }
}
export default config
```

Take a moment to familiarize yourself with the layout of the ChugSplash config file. Notice that we assign values directly to the state variables, so there is no need for a constructor or initializer function in the contract.

4. Deploy the contracts locally:
```
npx hardhat chugsplash-deploy --config-path chugsplash/SimpleStorage.config.ts
```

Note: If you'd like to deploy on a live network, please [reach out](https://discord.com/channels/1053048300565188729/1053048301143986219)!

### Testing your deployments

1. In your existing test folder, create a new test file called `SimpleStorage.spec.ts`.

2. Copy and paste the following into your test file:
```typescript
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('SimpleStorage', () => {
  let FirstSimpleStorage: Contract
  beforeEach(async () => {
    // You must reset your ChugSplash deployments to their initial state here
    await chugsplash.reset()

    FirstSimpleStorage = await chugsplash.getContract('FirstSimpleStorage')
  })

  it('initializes correctly', async () => {
    expect(await FirstSimpleStorage.number()).equals(1)
    expect(await FirstSimpleStorage.stored()).equals(true)
    expect(await FirstSimpleStorage.storageName()).equals('First')
    expect(await FirstSimpleStorage.otherStorage()).equals('0x1111111111111111111111111111111111111111')
  })
})
```

3. Run the test:
```
npx hardhat test test/SimpleStorage.spec.ts
```

### Immutable variables
You can define immutable variables in your ChugSplash config file the exact same way that you define regular state variables. However, there is one caveat: you must instantiate the immutable variables in your constructor or else the Solidity compiler will throw an error. If we wanted to change the state variables in our `SimpleStorage` example to be immutable, we can keep the ChugSplash config file unchanged and update `SimpleStorage.sol`:
```solidity
contract SimpleStorage {
    // Define immutable variables
    uint8 public immutable number;
    bool public immutable stored;
    address public immutable otherStorage;
    // Leave `storageName` unchanged since Solidity doesn't support immutable strings
    string public storageName;

    // We must instantiate the immutable variables in the constructor so that
    // Solidity doesn't throw an error.
    constructor(
      uint8 _number,
      bool _stored,
      address _otherStorage
    ) {
      number = _number;
      stored = _stored;
      otherStorage = _otherStorage;
    }
}
```

## How it works

ChugSplash allows you to assign values to your state variables directly (without using a constructor) by compiling your config file down to individual SSTORE actions. These actions are then executed in a standard EIP-1967 proxy.

An important point to mention is that the values of state variables are set in the proxy, **not** in the implementation contract. For example, the `number` variable from the `FirstSimpleStorage` contract is set to `1` **only** in the proxy contract. If you call `number` on the implementation contract, it would return the default value, `0`. This is standard behavior for proxies, but it can be surprising if you haven't used proxies before. You can always set the owner of the proxy to be `address(0)` if you want the proxy to be non-upgradeable.

## Reach out

If you need anything before you can start using ChugSplash for your projects, please [reach out](https://discord.com/channels/1053048300565188729/1053048301143986219) and it will be prioritized.
