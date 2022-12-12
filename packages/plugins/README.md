# ChugSplash Hardhat plugin

ChugSplash is a modern smart contract deployment system that lets you to define your deployments inside of a configuration file instead of writing scripts. ChugSplash automatically verifies your source code on Etherscan and generates deployment artifacts in the same format as hardhat-deploy.

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
1. In your existing contracts folder, create a contract called `SimpleStorage.sol`. Copy and paste its contents:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract SimpleStorage {
    uint8 internal number;
    bool internal stored;
    address internal otherStorage;
    string internal storageName;

    function getNumber() external view returns (uint8) {
        return number;
    }

    function isStored() external view returns (bool) {
        return stored;
    }

    function getOtherStorage() external view returns (address) {
        return otherStorage;
    }

    function getStorageName() external view returns (string memory) {
        return storageName;
    }
}
```

2. Compile your contract:
```
npx hardhat compile
```

3. Make a `chugsplash/` folder in your project root:
```
mkdir chugsplash
```

4. In your `chugsplash/` folder, create a config file for your first ChugSplash project. We'll call it `SimpleStorage.config.ts`.
```
echo > chugsplash/MyFirstProject.config.ts
```

5. Copy and paste the following deployment information into your ChugSplash config file. You will deploy two instances of the `SimpleStorage` contract.
```typescript
import { ChugSplashConfig } from '@chugsplash/core'

const config: ChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'My First Project',
    projectOwner: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
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

Take a moment to familiarize yourself with the layout of the ChugSplash config file. Notice that we assign values directly to the state variables, so there is no need for a constructor or initializer function in the contract.

6. Deploy the contracts locally:
```
npx hardhat chugsplash-deploy
```

### Immutable variables
ChugSplash supports all immutable variables except for [user defined value types](https://docs.soliditylang.org/en/latest/types.html#user-defined-value-types). You can define immutable variables in your ChugSplash config file the exact same way that you define regular state variables. However, there is one caveat: you must instantiate the immutable variables in your constructor or else the Solidity compiler will throw an error. If we wanted to change the state variables in our `SimpleStorage` example to be immutable, we can keep the ChugSplash config file unchanged and update `SimpleStorage.sol` to include the following:
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
    expect(await FirstSimpleStorage.getNumber()).equals(1)
    expect(await FirstSimpleStorage.getOtherStorage()).equals(SecondSimpleStorage.address)
    expect(await SecondSimpleStorage.isStored()).equals(true)
    expect(await SecondSimpleStorage.getStorageName()).equals('Second')
  })
})
```

3. Run the test:
```
npx hardhat test test/SimpleStorage.spec.ts
```

## How it works

ChugSplash uses deterministic proxies to deploy contracts and set their state variables. An important point to mention is that the values of state variables are set in the proxy, **not** in the implementation contract. For example, the `number` variable from the `FirstSimpleStorage` contract is set to `1` **only** in the proxy contract. If you call `getNumber` on the implementation contract, it would return the default value, `0`. This is standard behavior for proxies, but it can be surprising if you haven't used proxies before. If you want the proxy to be non-upgradeable, you can set the `projectOwner` parameter in the ChugSplash config file to the zero-address.


## Reach out

Hit up [@samgoldman0](https://t.me/samgoldman0) on Telegram if you have any questions/comments!
