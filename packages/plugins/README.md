# ChugSplash Hardhat plugin

ChugSplash is a smart contract deployment tool that lets you define your deployments declaratively inside of a single configuration file. No deployment scripts necessary. ChugSplash automatically verifies your source code on Etherscan and generates deployment artifacts in the same format as hardhat-deploy.

## Installation
Install the ChugSplash packages.

With Yarn:
```
yarn add --dev @chugsplash/plugins @chugsplash/core
```
With NPM:
```
npm install --save-dev @chugsplash/plugins @chugsplash/core
```

## Setup
Import the ChugSplash plugin in your `hardhat.config.ts` file:
```
import '@chugsplash/plugins'
```

Update the `outputSelection` setting in your `hardhat.config.ts` file:
```typescript
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
1. In your existing contracts folder, create a contract called `SimpleStorage.sol`. Copy and paste:
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

2. Compile your contract:
```
npx hardhat compile
```

3. Create a `chugsplash/` folder, and a config file for your first ChugSplash project. We'll call it `SimpleStorage.config.ts`.
```
mkdir chugsplash && echo > chugsplash/MyFirstProject.config.ts
```

4. Copy and paste the following deployment information into your ChugSplash config file. You will deploy two instances of the `SimpleStorage` contract.
```typescript
import { ChugSplashConfig } from '@chugsplash/core'

const config: ChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'My First Project',
  },
  // Below, we define all of the contracts in the deployment along with their state variables.
  contracts: {
    // First contract config:
    FirstSimpleStorage: {
      contract: 'SimpleStorage',
      variables: {
        number: 1,
        stored: true,
        storageName: 'First',
        storageName: 'First',
        otherStorage: { '!Ref': 'SecondSimpleStorage' }, // Reference to SecondSimpleStorage
      },
    },
    // Second contract config:
    SecondSimpleStorage: {
      contract: 'SimpleStorage',
      variables: {
        number: 2,
        stored: true,
        storageName: 'Second',
        otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}
export default config
```

Take a moment to familiarize yourself with the ChugSplash config file. Notice that we assign values directly to the state variables, so there is no need for a constructor or initializer function in the contract.

6. Deploy the contracts locally:
```
npx hardhat chugsplash-deploy
```

### Immutable variables
You can define immutable variables in your ChugSplash config file the exact same way that you define regular state variables. However, there is one caveat: you must instantiate the immutable variables in your constructor or else the Solidity compiler will throw an error. If we wanted to change the state variables in our `SimpleStorage` example to be immutable, we can keep the ChugSplash config file unchanged and update `SimpleStorage.sol` to include the following:
```solidity
contract SimpleStorage {
    // Define immutable variables
    uint8 internal immutable number;
    bool internal immutable stored;
    address internal immutable otherStorage;
    // Leave `storageName` unchanged since Solidity doesn't support immutable strings
    string internal storageName;

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

    ...
}
```

### Testing your deployments

1. In your existing test folder, create a new test file called `SimpleStorage.spec.ts`.

2. Copy and paste the following into your test file:
```typescript
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('SimpleStorage', () => {
  let FirstSimpleStorage: Contract
  let SecondSimpleStorage: Contract
  beforeEach(async () => {
    // You must reset your ChugSplash deployments to their initial state here
    await chugsplash.reset()

    FirstSimpleStorage = await chugsplash.getContract('FirstSimpleStorage')
    SecondSimpleStorage = await chugsplash.getContract('SecondSimpleStorage')
  })

  it('initializes correctly', async () => {
    expect(await FirstSimpleStorage.number()).equals(1)
    expect(await FirstSimpleStorage.otherStorage()).equals(SecondSimpleStorage.address)
    expect(await SecondSimpleStorage.stored()).equals(true)
    expect(await SecondSimpleStorage.storageName()).equals('Second')
  })
})
```

3. Run the test:
```
npx hardhat test test/SimpleStorage.spec.ts
```

## How it works

ChugSplash uses deterministic proxies to deploy contracts and set their state variables. An important point to mention is that the values of state variables are set in the proxy, **not** in the implementation contract. For example, the `number` variable from the `FirstSimpleStorage` contract is set to `1` **only** in the proxy contract. If you call `number` on the implementation contract, it would return the default value, `0`. This is standard behavior for proxies, but it can be surprising if you haven't used proxies before.

## Reach out

Hit up [@samgoldman0](https://t.me/samgoldman0) on Telegram if you have any requests for features or questions!
