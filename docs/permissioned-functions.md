# Calling Permissioned Functions with Sphinx
Sometimes you might need to write a deployment script that involves calling some permissioned functions on your contracts to perform additional configuration. This is often the case if you are using OpenZeppelins Ownable or AccessControl contracts.

Calling permissioned functions is possible with Sphinx, but requires some custom configuration since you're deployments are executed through the Sphinx Protocol. In this guide we'll walk you through how to call a permissioned function using an example contract that inherits from OpenZeppelin Ownable.

## Sample Contract
The following contract is a simple `PermissionedBox` contract which inherits from `Ownable` and stores a single `value` state variable. Only owner can set the value by calling `setValue`.

```
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PermissionedBox is Ownable {
    uint public value;

    // Note, here we pass the owner into the constructor and transfer
    // ownership to them as is the best practice when using Sphinx
    constructor (address owner) {
        transferOwnership(owner);
    }

    setValue(uint _value) onlyOwner {
        value = _value;
    }
}
```

## Deployment Script
Say for example, that we wanted to deploy the `PermissionedBox` and then immediately call the `setValue` function to store a value in the contract. The default behavior of `Ownable` is to set the owner of the contract to the deployer, however we cannot do that when deploying with Sphinx because the deployer of the contract will not be your wallet. So instead, we've configured the constructor to accept an address which we then transfer ownership of the contract too.

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
      // Note that the `sphinxManager` variable is automatically calculated and stored
      // in the `SphinxClient` contract that this script inherits from. So it will be
      // available to you automatically.
      PermissionedBoxClient permissionedBoxClient = deployPermissionedBox(sphinxManager);

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
