# ChugSplash Tutorial

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

2. Create a `chugsplash/` folder, and a config file for your first ChugSplash project. We'll call it `SimpleStorage.config.ts`.
```
mkdir chugsplash
```

3. Copy and paste the following into your ChugSplash config file:
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
npx hardhat chugsplash-deploy chugsplash/SimpleStorage.config.ts
```

### Immutable variables
ChugSplash supports all immutable variables except for [user defined value types](https://docs.soliditylang.org/en/latest/types.html#user-defined-value-types). You can define immutable variables in your ChugSplash config file the exact same way that you define regular state variables. However, there is one caveat: you must instantiate the immutable variables in your constructor or else the Solidity compiler will throw an error. If we wanted to change the state variables in our `SimpleStorage` example to be immutable, we can keep the ChugSplash config file unchanged and update `SimpleStorage.sol` to include the following:
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

## How it works

ChugSplash allows you to assign values to your state variables directly (without using a constructor) by compiling your config file down to individual SSTORE actions. These actions are then executed in a standard EIP-1967 proxy.

An important point to mention is that the values of state variables are set in the proxy, **not** in the implementation contract. For example, the `number` variable from the `FirstSimpleStorage` contract is set to `1` **only** in the proxy contract. If you call `number` on the implementation contract, it would return the default value, `0`. This is standard behavior for proxies, but it can be surprising if you haven't used proxies before. You can always set the owner of the proxy to be `address(0)` if you want the proxy to be non-upgradeable.

## Coming soon...
* ChugSplash will automatically distribute the source code and ABI for deployments via `npm`.

## Supported variable types
* Booleans
* Integers (signed and unsigned)
* Addresses
* Contract types
* Structs
* Enums
* Mappings
* Arrays (including dynamic and nested arrays)
* Bytes value types, i.e. bytes1, bytes2, …, bytes32
* Dynamic bytes that are <= 31 bytes
* Strings that are <= 31 characters

## Current limitations
* ChugSplash does not currently support the following variable types:
  * Strings that are > 31 characters
* You cannot call contracts inside the constructor of any of your deployed contracts.
* References to contracts in other ChugSplash config files are not supported (i.e. `{"!Ref: MyOtherProject.OtherContract "}`)

These features will be supported in the near future. If you need any of these features before you can start using ChugSplash for your projects, please reach out to [@samgoldman0](https://t.me/samgoldman0) on Telegram and it will be prioritized.
