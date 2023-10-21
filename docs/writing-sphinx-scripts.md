# Writing Deployment Scripts with Sphinx
Sphinx is built on the Sphinx Protocol which is a smart contract deployment protocol that provides benefits like idempotent deployments and consistent addresses across networks using Create3. The Sphinx Protocol also makes your scripts trustlessly executable by third party platforms like the Sphinx DevOps Platform.

Deploying using Sphinx is different from other tools because of the use of its protocol. To use Sphinx, you ust write your deployment scripts using Sphinx client contracts. These client contracts are automatically generated and make it easy for you to deploy and interact with your contracts using the Sphinx Protocol.

If you haven't already, we recommend running through the [Integrate Sphinx into an Existing Foundry Project](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-existing-project.md) guide, or setting up a fresh project using the [Quickstart](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-quickstart.md).

## Table of Contents

1. [Script Setup](#1-setup-a-new-sphinx-deployment-script)
2. [Required Configuration Options](#2-required-configuation-options)
3. [DevOps Platform Options](#3-install-sphinx)
4. [Generating Clients](#4-generating-clients)
5. [Sphinx Deploy Function](#5-sphinx-deploy-function)
6. [Deploying Contracts](#6-deploying-contracts)
7. [Calling Contract Functions](#7-calling-contract-functions)
8. [Defining Contracts](#8-defining-contracts)
9. [Permissioned Functions](#9-permissioned-functions)
10. [Importing External Contracts](#10-importing-external-contracts)
11. [Learn more](#11-learn-more)

## 1. Setup a new Sphinx Deployment Script
Create a new script file and paste in the following template:
```
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { SphinxClient } from "../client/SphinxClient.sol";
import { Network } from "../contracts/foundry/SphinxPluginTypes.sol";

contract Sample is Script, SphinxClient {
    function setUp() public {
        // Required for all projects
        sphinxConfig.projectName = "My Project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;

        // Sphinx DevOps platform options
        sphinxConfig.proposers = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.testnets = [Network.goerli, Network.arbitrum_goerli];
        sphinxConfig.orgId = "<org id>";
    }

    function deploy(Network _network) public override sphinx(_network) {

    }

    function run() public {
        deploy(Network.anvil);
    }
}
```

Depending on the location of your script folder, you may need to update some of the import paths.

## 2. Required Configuation Options
You notice a number of configuration options defined in the above sample. Lets look at each of those in more detail:

### Project Name
```
sphinxConfig.projectName = "My Project";
```

The `projectName` is the name of your project. It can be any name you choose. Note that the project name is case-sensitive.

You should not change the project name once you've deployed a project on a live network. This is because a new `SphinxManager` contract will be deployed. See [here](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md) for more info on the `SphinxManager`.

### Owners
```
sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
```

The list of addresses that own this project. Owners can perform permissioned actions such as approving deployments via the Sphinx UI. If you are deploying using the local CLI, you are limited to a single owner address. If you would like to use a multisig, you will need to define all the owner addresses here and will only be able to deploy using the Sphinx DevOps platform. We recommend that the owner accounts are hardware wallets.

### Threshold
```
sphinxConfig.threshold = 1;
```

The number of owner signatures required to approve a deployment. If you are deploying using the local CLI, then this should be 1.

## 3. DevOps Platform Options
If you are using the Sphinx DevOps platform there are several additional options you might want to configure. You can learn more about them in the [Sphinx DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/writing-sphinx-scripts.md) guide.

## 4. Generating Clients
Now that you've setup your script configuration, you're almost ready to start writing your script. But first, you'll need to generate your Sphinx clients. You can do so with the following command:
```
npx sphinx generate
```

This command analyzes all your source contracts and generates Sphinx clients for each contract. These clients can be used to take three basic actions:
1. Deploy a new instance of a contract
2. Calling contract functions
3. Define that a contract exists at a given address

## 5. Sphinx Deploy Function
You may have noticed in the sample above, we've defined a `deploy` function. This function is required and is where you must define your Sphinx deployment script. Note that we include a modifier `sphinx(_network)`. This modifier must be included on your Sphinx deploy function or Sphinx will not work properly.

Note that the Sphinx deployment function also includes a Network enum parameter `_network`. This parameter can be used to easily customize your deployment for a given network.

## 6. Deploying Contracts
To deploy a contract using Sphinx, you'll need to call a deployment function on the `SphinxClient` contract. You might have noticed in the sample above we inherited from `SphinxClient`, so now you can simply call one of the deployment functions that are implemented in it to deploy a contract. For example, if you are using the sample project you can deploy the `HelloSphinx` contract using the autogenerated `deployHelloSphinx` function like so:

```
function deploy(Network _network) public override sphinx(_network) {
  deployHelloSphinx("Hello!", 2);
}
```

To deploy your own custom smart contracts, you'll need to use the appropriate autogenerated deployment function. You can examine the `SphinxClient` contract to see what functions are available to you. Typically the deployment function for a given contract will follow the format: `deploy<contract name>`. Sometimes if you have multiple contracts with the same name, we may generate the deployment function using the full path to the contract file: `deployPathToContract_ContractName`

### Contract Deployment Options (optional)
In some specific situations you may need to configure some additional options when deploying contract using Sphinx. Typically you'll need to do this if you either want to use a custom salt to change the address your contracts are deployed at, or you need to deploy multiple instances of the same contract. In these cases, you can pass an additional `DeployOptions` struct into the deploy function for the desired contract. There are two deploy options you can configure the reference name and the salt.

#### Reference Name
A string reference name for the contract. The reference name is used as part of the salt which determines the contracts address. The reference name is also used as the display name for the contract in the deployment preview, website UI, etc. By default the reference name is the name of the contract being deployed. If you deploy multiple instances of the same contract, you will be required to define a separate reference name for each instance.

#### Salt
A bytes32 salt value. Changing the salt, results in a different contract address while allowing you to maintain the same reference name. The salt is 0 by default. Typically the salt is used if you intend to deploy multiple seperate copies of your protocol which should be at different addresses.

#### Example DeployOptions Usage
```
// Import the DeployOptions type
import { DeployOptions } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";

function deploy(Network _network) public override sphinx(_network) {
  deployHelloSphinx(
    "Hello!",
    2,
    DeployOptions({ salt: 1, referenceName: "DifferentContractName" })
  );
}
```

## 7. Calling Contract Functions
To call a function on one of your contracts, you'll need to use its associated client contract. When you deploy a contract using it's deployment function and instance of the contracts client will be returned, so you can simply store that in a variable and then call functions on it.

```
// Import the client contract
import { HelloSphinxClient } from "../client/HelloSphinx.c.sol";

function deploy(Network _network) public override sphinx(_network) {
  HelloSphinxClient helloSphinxClient = deployHelloSphinx("Hello!", 2);
  helloSphinxClient.add(1);
}
```

Contract clients automatically include functions for every mutable function on your contracts. We also include all pure functions on your contracts, so you can make use of any utility functions you've defined. However, we do not support view functions and mutable functions do not return values when called on the clinets. If either of these are limitations that prevent you from using Sphinx, please let us know.

## 8. Defining Contracts
Sometimes you may need to interact with a contract that has already been deployed. In this case, you can use the contracts define function. The define function is similar to the deploy function and can also be found on the `SphinxClient` contract. However, the define function accepts an address and returns a client contract with that address without actually deploying the contract to that address. This allows you to interact with contracts that were not deployed using Sphinx.

You can define a contract like so:
```
// Import the client contract
import { HelloSphinxClient } from "../client/HelloSphinx.c.sol";

function deploy(Network _network) public override sphinx(_network) {
  address helloSphinxAddress = address(0);
  HelloSphinxClient helloSphinxClient = defineHelloSphinx(helloSphinxAddress);
  helloSphinxClient.add(1);
}
```

> If you're project includes any Solidity interfaces, we'll automatically generate clients for them along with the rest of your contracts. However, we will only generate a `define` function for interfaces.

### Contract Define Options (optional)
Like deploying contracts, you also have the option of inputting a `DefineOptions` object when defining a contract. The only option available is the reference name which is used in the deployment preview, website UI, etc.

#### Example DefineOptions Usage
```
// Import the DeployOptions type
import { DefineOptions } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";

function deploy(Network _network) public override sphinx(_network) {
  address helloSphinxAddress = address(0);
  defineHelloSphinx(helloSphinxAddress, DefineOptions({ referenceName: "DifferentContractName" }));
}
```

## 9. Ownable, Access Control, and Permissioned Functions
Often times, you might have a contract that has some type of ownership or access control scheme implemented on it such as OpenZeppelin AccessControl or Ownable. When using Sphinx, it is important that you explicitly set the owner of your contracts in the contract constructor and that you *do not* use `msg.sender`. This is because your contracts are deployed through the Sphinx Protocol contracts. So if you use `msg.sender` to assign the ownership if your contracts, the owner will end up being one of the Sphinx Protocol contracts. When using an ownership or access control scheme, you should *always* pass an address into the contract constructor directly and use that to set the owner and/or admin roles.

> When deploying with Sphinx, `msg.sender` is one of the Sphinx Protocol contracts. So you should never use `msg.sender` to set the owner of your contracts.

Sometimes you may need to call functions that require the caller have a certain set of permissions such as if you are using OpenZeppelin AccessControl or Ownable. This will not work out of the box when using Sphinx because the Sphinx Protocol contracts will not have the required permissions, however you can still use Sphinx in these cases with some additional configuration. We've put together a separate guide on this topic.

[Calling Permissioned Functions with Sphinx](https://github.com/sphinx-labs/sphinx/blob/develop/docs/permissioned-functions.md)

## 10. Importing External Contracts
Sometimes you may want to deploy or interact with a contract which has source code that is not included in your main project source folder. For example, you may have a dependency such as LayerZero and want to interact with the LayerZero contracts using an interface that is stored in a dependency of your project.

To generate Sphinx clients for external contracts, you can use the `SphinxExternals` file. First create a new file in your contract source directory named `SphinxExternals.sol`, then import any contracts you would like to generate clients for into that contract.

## 11. Learn more
With the tools listed above, you can now write custom scripts to deploy and interact with your contracts using Sphinx. If you have questions, please reach out in the [Discord](https://discord.gg/7Gc3DK33Np).

[Getting Started with the Sphinx DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-proposals.md): Learn to trigger gasless and multichain deployments using the Sphinx DevOps Platform
