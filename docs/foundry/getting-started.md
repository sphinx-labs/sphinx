# Getting Started

In this guide, you'll learn how to deploy, upgrade, and test an upgradeable contract using ChugSplash.

## Table of Contents

1. [Setup a Foundry project](#1-setup-a-foundry-project)
2. [Install ChugSplash](#2-install-chugsplash)
3. [Configure your `foundry.toml` file](#3-configure-your-foundrytoml-file)
4. [Update remappings](#4-update-remappings)
5. [Create a contract](#5-create-a-contract)
6. [Create a ChugSplash config file](#6-create-a-chugsplash-file)
7. [Create your deployment script](#7-create-your-deployment-script)
8. [Deploy with ChugSplash](#8-deploy-with-chugsplash)
9. [Test with ChugSplash](#9-test-with-chugsplash)
10. [Upgrade with ChugSplash](#10-upgrade-with-chugsplash)

## Prerequisites

The following must be installed on your machine:
- [Node.js >=v15 and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)

You must also have a basic understanding of how to use Foundry. [See here](https://book.getfoundry.sh/getting-started/first-steps) for a brief introduction.

## 1. Setup a Foundry project

If you have an existing foundry project, navigate to it then [skip to step #2](#2-install-chugsplash).

If you're starting a new project, run:

```
forge init hello_foundry && cd hello_foundry && forge install Arachnid/solidity-stringutils
```

Then, delete the files that come with the default Foundry project:
```
rm src/Counter.sol script/Counter.s.sol test/Counter.t.sol
```

## 2. Install ChugSplash

In your project root, run:

```
npm install @chugsplash/plugins
```

or

```
yarn add @chugsplash/plugins
```

You may also want to add `node_modules` to your .gitignore file.

## 3. Configure your `foundry.toml` file

Edit your `foundry.toml` file to include all of the following options. If you leave any of these out, ChugSplash will not work properly.

```
[profile.default]
out = 'out'
ffi = true
build_info = true
extra_output = ['storageLayout']
force = true
fs_permissions = [{ access = "read", path = "./"}]

[rpc_endpoints]
localhost = "http://127.0.0.1:8545"
```

## 4. Update remappings

In your project root run:

```
echo > remappings.txt
```

Inside the newly created file, remappings.txt, copy paste the following:

```
ds-test/=lib/forge-std/lib/ds-test/src/
forge-std/=lib/forge-std/src/
chugsplash/=node_modules/@chugsplash/plugins/dist/contracts/
```

## 5. Create a contract

We'll now setup a ChugSplash project to deploy a single upgradeable contract, `HelloChugSplash.sol`.

> Note: All contracts deployed using ChugSplash are upgradeable by default.

First, define `HelloChugSplash.sol` in your contract source folder (usually, this is `src/`).

Copy and paste its contents:
```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract HelloChugSplash {
    uint public number;
    bool public stored;
    address public otherStorage;
    string public storageName;
}
```

## 6. Create a ChugSplash config file

Next, we'll create a ChugSplash config file, which contains all of the information necessary to deploy and upgrade your project. A ChugSplash config file can be written in JavaScript or JSON. In this guide, it'll be a JSON file. ChugSplash config files are the only files in your project that are not written in Solidity.

In your project root:

```
mkdir chugsplash && echo > chugsplash/hello-chugsplash.json
```

Inside your newly created ChugSplash config file, `hello-chugsplash.json`, copy and paste the following:

```json
{
  "options": {
    "projectName": "Hello ChugSplash",
    "organizationId": "0x0000000000000000000000000000000000000000000000000000000000000000"
  },
  "contracts": {
    "HelloChugSplash": {
      "contract": "HelloChugSplash",
      "variables": {
        "number": 1,
        "stored": true,
        "storageName": "First",
        "otherStorage": "0x1111111111111111111111111111111111111111"
      }
    }
  }
}
```

We'll explain the details of the ChugSplash config file in the next guide.

## 7. Create your deployment script

In the folder that contains your Foundry scripts (usually `script/`), create your deployment script. We'll call it `MyFirstProject.s.sol`.

Inside, copy and paste the following:
```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "forge-std/Script.sol";
import "chugsplash/ChugSplash.sol";

// You *must* import the source files of all contracts you're deploying into your deployment script.
import "../src/HelloChugSplash.sol";

contract ChugSplashScript is Script {
    function run() public {
        // Create a ChugSplash instance
        ChugSplash chugsplash = new ChugSplash();

        // Define the path from the project root to your ChugSplash config file.
        string memory chugsplashFilePath = "./chugsplash/hello-chugsplash.json";

        // Deploy all contracts in your ChugSplash config file (in this case, just HelloChugSplash.sol)
        chugsplash.deploy(chugsplashFilePath);
    }
}
```

Take a moment to read the comments in the file. In particular, note that it's required for you to import the source files of all the contracts you're deploying into your deployment script. For this project, the only file you need to import is `HelloChugSplash.sol`. This ensures that the latest artifacts of your contracts are included in the script. Don't worry if you forget to do this; we'll detect it and throw an error before the deployment is executed.

## 8. Deploy with ChugSplash

> Note: When deploying, upgrading, or testing your contracts locally, you must always use an Anvil node running as a stand-alone process.

To create an Anvil node in a stand-alone process, run:

```
anvil
```

In another terminal window, run the following command to deploy your upgradeable contract:

```
forge script --rpc-url http://localhost:8545 script/MyFirstProject.s.sol
```

You should see the following output:
```
== Logs ==
  Success!
  HelloChugSplash: 0x...
```

You've deployed your first upgradeable contract locally!

## 9. Test with ChugSplash

In the folder that contains your Foundry tests (usually `test/`), create your test file. We'll call it `MyFirstProject.t.sol`.

Inside, copy and paste the following:
```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "forge-std/Test.sol";
import "chugsplash/ChugSplash.sol";
import "../src/HelloChugSplash.sol";

contract ChugSplashTest is Test {
    // Your upgradeable contract
    HelloChugSplash helloChugSplash;

    function setUp() public {
        // Create a ChugSplash instance
        ChugSplash chugsplash = new ChugSplash();

        // Define the path from the project root to your ChugSplash config file.
        string memory chugsplashFilePath = "./chugsplash/hello-chugsplash.json";

        // Deploy all contracts in your ChugSplash config file (in this case, just HelloChugSplash.sol)
        chugsplash.deploy(chugsplashFilePath, true);

        // You *must* refresh EVM state after calling `chugsplash.deploy`.
        chugsplash.refresh();

        // Connect to the deployed contract
        helloChugSplash = HelloChugSplash(chugsplash.getAddress(chugsplashFilePath, "HelloChugSplash"));
    }

    function testNumber() public {
        assertEq(helloChugSplash.number(), 1);
    }

    function testStored() public {
        assertEq(helloChugSplash.stored(), true);
    }

    function testStorageName() public {
        assertEq(helloChugSplash.storageName(), "First");
    }

    function testOtherStorage() public {
        assertEq(helloChugSplash.otherStorage(), 0x1111111111111111111111111111111111111111);
    }
}
```

Notice that you need to call `chugsplash.refresh()` after calling `chugsplash.deploy(...)`.

Run your tests using the command:
```
forge test --rpc-url http://localhost:8545
```

## 10. Upgrade with ChugSplash

Upgrades are defined in exactly the same format as deployments.

To upgrade our contract, we'll first change its source code. You can change it to be anything you'd like, but for the purpose of this guide, we'll simply add a new variable, `newInt`, to the end of the contract. Open `HelloChugSplash.sol`, then copy and paste the following:

```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract HelloChugSplash {
    uint public number;
    bool public stored;
    address public otherStorage;
    string public storageName;

    // New variable:
    int public newInt;
}
```

Then, update your existing ChugSplash config file, `hello-chugsplash.json`, to assign a value to this new variable:
```json
{
  "options": {
    "projectName": "Hello ChugSplash"
  },
  "contracts": {
    "HelloChugSplash": {
      "contract": "HelloChugSplash",
      "variables": {
        "number": 1,
        "stored": true,
        "storageName": "First",
        "otherStorage": "0x1111111111111111111111111111111111111111",
        "newInt": -1
      }
    }
  }
}
```

Optionally, you can change the values of the other variables. For example, you can change `"number"` from `1` to `2`, or `"storageName"` from `"First"` to `"Second"`.

Then, run the same script that you used to deploy the contract initially:
```
forge script --rpc-url http://localhost:8545 script/MyFirstProject.s.sol
```

You should see the same output as before:
```
== Logs ==
  Success!
  HelloChugSplash: 0x...
```

If you update your tests in your test file, you'll be able to confirm that the contract was upgraded correctly.

That's all it takes to do an upgrade!
