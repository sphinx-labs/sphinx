# Deploying owned contracts (e.g. `Ownable` or `AccessControl`)

Deploying owned contracts with Sphinx requires some extra configuration because your contracts are deployed by your `SphinxManager`[TODO(md)] contract instead of a deployer private key. This means you'll need to explicitly revoke . The rest of this guide will cover how to call permissioned functions on your owned contract during the deployment process.

Sometimes you might need to write a deployment script that involves calling some permissioned functions on your contracts. This is often the case if you are using OpenZeppelin's `Ownable` or `AccessControl` contracts.

Calling permissioned functions requires some additional configuration since your deployments are executed by your `SphinxManager`[TODO(md)] contract. To call permissioned functions on a contract, your `SphinxManager` must be the initial owner of the contract. You must transfer ownership from the `SphinxManager` to your final owner at the end of your deployment. This guide will show you how to do that.

## Sample Contract
The following contract is a simple `PermissionedBox` contract which inherits from `Ownable` and stores a single `value` state variable. Only the owner can set the value by calling `setValue`.

```
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PermissionedBox is Ownable {
    uint public value;

    constructor(address _owner) {
        _transferOwnership(_owner);
    }

    setValue(uint _value) onlyOwner {
        value = _value;
    }
}
```

TODO(md): mention OZ's ownable's default behavior

## Deployment Script
Say that you want to deploy the `PermissionedBox` contract, then call the `setValue` function, then transfer ownership to a new owner. To do this, you must set the `SphinxManager` contract as the ini

> When using `Ownable`, you must **always** explicitly call `_transferOwnership` in the constructor of your contract.This is because the default behavior of `Ownable` is to set the owner of the contract to the deployer, however we cannot do that when deploying with Sphinx because the deployer of the contract will not be your wallet. So instead, we've configured the constructor to accept an address which we then transfer ownership of the contract too.

With this setup, we can deploy the contract and if we pass a wallet address we own into the constructor then the contract will be transferred to me. However, if we then try to call the `setValue` function from the same deployment script it will fail. This is because ownership of the contract has been transferred to our wallet, but your `SphinxManager` is attempting to call the `setValue` function during the deployment.

> The `SphinxManager` is a contract that is deployed on your behalf during the deployment and is controlled by the set of owners you define in your Sphinx configuration options.

So if we would like call a permissioned function during our deployment script, we need to follow a three step process:
1. Deploy the contract and set the contracts owner to be the `SphinxManager`
2. Call the permissioned function
3. Transfer ownership of the contract to the final owner

Here is an example deployment script that performs that full process with `PermissionedBox`:
```
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { SphinxClient } from "../client/SphinxClient.sol";
import { Network } from "../contracts/foundry/SphinxPluginTypes.sol";
import { PermissionedBoxClient } from "../clients/PermissionedBox.c.sol";

contract Sample is Script, SphinxClient {
    address public projectOwner;

    function setUp() public {
        projectOwner = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        sphinxConfig.projectName = "My Project";
        sphinxConfig.owners = [projectOwner];
        sphinxConfig.threshold = 1;
    }

    function deploy(Network _network) public override sphinx(_network) {
      // We first deploy PermissionedBox, setting the manager as its owner.
      // Note that the `sphinxManager` is a utility function implemented on the SphinxClient
      // contract that this script inherits from. So it will be available to you automatically.
      PermissionedBoxClient permissionedBoxClient = deployPermissionedBox(sphinxManager(sphinxConfig));

      // Then we call the permissioned function
      permissionedBoxClient.setValue(5);

      // Finally, we transfer ownership of the contract to the intended owner
      permissionedBoxClient.transferOwnership(projectOwner);
    }

    function run() public {
        deploy(Network.anvil);
    }
}
```

This setup works for essentially all ownership and access control schemes including both OpenZeppelin Ownable and AccessControl. If you have any questions or run into problems, please reach out in the [Discord](https://discord.gg/7Gc3DK33Np).
