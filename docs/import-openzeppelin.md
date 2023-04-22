# Import Contracts from the OpenZeppelin Hardhat Upgrades API

Read this guide if you want to use ChugSplash to upgrade an existing proxy that was deployed using the [OpenZeppelin Hardhat Upgrades API](https://docs.openzeppelin.com/upgrades-plugins/1.x/api-hardhat-upgrades).

Currently, ChugSplash only integrates with Transparent proxies, which is the default proxy type used by OpenZeppelin. If you want us to support another proxy type, please let us know in our [Discord](https://discord.gg/7Gc3DK33Np)!

## Prerequisites

* You must own an existing proxy that was deployed using the OpenZeppelin Hardhat Upgrades API
* Have a ChugSplash project set up using either the ChugSplash Foundry Library ([Foundry Getting Started Guide](https://github.com/chugsplash/chugsplash/blob/develop/docs/foundry/getting-started.md)) or Hardhat Plugin ([Hardhat Getting Started Guide](https://github.com/chugsplash/chugsplash/blob/develop/docs/hardhat/setup-project.md))

## Create a Project Name

Navigate to your project directory that has ChugSplash set up.

First, you'll need to decide on a project name. Once you've done this, create a ChugSplash config file for your project in the `chugsplash/` folder. Copy and paste the following contents into it:

```json
{
  "options": {
    "projectName": "<your project name>"
  },
  "contracts": {}
}
```

If you prefer javascript:
```js
require('@chugsplash/core')

module.exports = {
  options: {
    projectName: "<your project name>",
  },
  contracts: {},
}
```


It's fine to leave the `"contracts"` object empty for now.

## Register a ChugSplash Project

Next, you'll need to register your new project with ChugSplash. This will create a `ChugSplashManager` contract, which will replace the `ProxyAdmin` contract that OpenZeppelin uses to manage your proxy. You can register your project using either the ChugSplash Foundry Library or Hardhat plugin. The address of the `ChugSplashManager` is deterministically calculated based on your project name via `CREATE2`, so make sure you've chosen a project name that you'll use in the future!

> Note: You own the `ChugSplashManager` contract, so you can transfer ownership of your proxy away from it anytime. However, we recommend keeping it as the proxy's owner unless you stop using ChugSplash entirely. Otherwise, you'll need to repeat these steps every time you perform a new upgrade.

### Register Using Hardhat Plugin
To register a project using the ChugSplash Hardhat plugin, run the following command:
```
npx hardhat chugsplash-register --network <network> --config-path <path/to/chugsplash/file>
```

You should see the following output:
```
✔ Project successfully registered on <network>. Owner: <your address>
```

### Register Using Foundry Library
To register your project using the ChugSplash Foundry library, create a new Foundry script in the folder that contains your scripts (usually `script/`).

In your script, copy and paste the following:
```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "forge-std/Script.sol";
import "chugsplash/ChugSplash.sol";

contract ChugSplashScript is Script {
    function run() public {
        ChugSplash chugsplash = new ChugSplash();

        // Define the path from the project root to your ChugSplash config file
        string memory chugsplashFilePath = "./chugsplash/my-chugsplash-file.json";

        // Register the project
        chugsplash.register(chugsplashFilePath);
    }
}
```

Make sure that you update the `chugsplashFilePath` variable to be the path from the project root to your ChugSplash config file.

Then, run this script using the command:
```bash
forge script --rpc-url <rpcUrl> path/to/script
```

You should see the following output:

```
== Logs ==
  -- ChugSplash Register --
- Registering Hello ChugSplash...
✔ Project successfully registered on <network>. Owner: <your address>
```

## Transfer Proxy Ownership

Next, you'll need to transfer ownership of your proxy from OpenZeppelin's `ProxyAdmin` contract to the newly created `ChugSplashManager` contract. To do this, navigate to the repository that contains your OpenZeppelin deployments. This directory should have a `.openzeppelin/` folder, which contains your artifacts.

Install the `@chugsplash/core` package using Yarn or npm. If it's already installed, you should still run one of these commands to ensure you're using the latest version.

Yarn:
```
yarn add --dev @chugsplash/core@latest
```

npm:
```
npm install --save-dev @chugsplash/core@latest
```

Then, create a new JavaScript or TypeScript file. In this guide, we'll use JavaScript.

Inside your file, copy and paste the following:
```js
const hre = require('hardhat')
require('@openzeppelin/hardhat-upgrades')
const { getChugSplashManagerProxyAddress } = require('@chugsplash/core')
// Import your ChugSplash config file below:
const { options } = require(path/to/chugsplash/file.json)

// The address of the contract you're importing into ChugSplash
const proxyAddress = 'your proxy address'

// Check that the ChugSplash config file has a project name field.
if (options.projectName === undefined) {
  throw new Error(`You must enter a project name.`)
}
const projectName = options.projectName

const main = async () => {
  // Transfer ownership from the ProxyAdmin to the ChugSplashManager.
  await hre.upgrades.admin.changeProxyAdmin(
    proxyAddress,
    getChugSplashManagerProxyAddress(projectName)
  )
  console.log('Transferred ownership!')
}
main()
```

Make sure to enter your ChugSplash config file path and proxy address in the missing fields.

If you have multiple proxies that you'd like to import, we recommend transferring ownership of all of them in this script. To do this, simply add a `hre.upgrades.admin.changeProxyAdmin` call for each proxy that you'd like to import.

When you're ready, run the following command:
```bash
npx hardhat run --network <networkName> path/to/file
```

You should see a `'Transferred ownership!'` log appear.

Congrats! You're ready to upgrade this proxy with ChugSplash.

## Using ChugSplash's Storage Layout Safety Checker

If you'd like to use ChugSplash's storage layout safety checker, you'll need to put the `.openzeppelin/` folder in the  root of your Foundry project. This is because the file contains the artifacts of your contracts. Once you've done this, ChugSplash will detect this folder and use it in the storage layout checker automatically.

## Next Steps

When you're ready to upgrade your proxy, you'll fill out the ChugSplash config file that you created earlier in this guide. You'll need to use the same project name that you selected earlier.

If you haven't already read the [ChugSplash File guide](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md), you should do so next. Note that you'll need to enter a `proxy` field in your contract definition, as explained in [this section](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md#contract-definitions) of the ChugSplash File guide.

If you have any questions, let us help you in our [Discord](https://discord.gg/7Gc3DK33Np)!
