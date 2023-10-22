# Writing Deployment Scripts with Sphinx

This guide will describe how to define deployments with Sphinx.

Before continuing, please complete either the [quickstart guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-quickstart.md) to setup a project in a new repository, or the guide to [integrate Sphinx into an existing repository](https://github.com/sphinx-labs/sphinx/blob/develop/docs/cli-existing-project.md).

## Table of Contents

TODO(md-end): check table of contents everywhere

## Sample Sphinx Script

A Sphinx deployment script has the following format:

```
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { SphinxClient } from "../client/SphinxClient.sol";
import { Network } from "../contracts/foundry/SphinxPluginTypes.sol";

contract Sample is Script, SphinxClient {
    function setUp() public {
        // Required configuration options:
        sphinxConfig.projectName = "My Project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;

        // Sphinx DevOps platform options:
        sphinxConfig.proposers = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.mainnets = [Network.ethereum, Network.arbitrum];
        sphinxConfig.testnets = [Network.goerli, Network.arbitrum_goerli];
        sphinxConfig.orgId = "<org id>";
    }

    function deploy(Network _network) public override sphinx(_network) {
        // Your deployment goes here:
        HelloSphinxClient helloSphinxClient = deployHelloSphinx("Hello!", 2);
        helloSphinxClient.add(1);
    }
}
```

You'll notice some differences between the sample script above and a vanilla Forge script. There are three main differences:

- There are a few configuration options that you must specify in your `setUp()` function.
- The entry point for the deployment is the `deploy(Network _network)` function defined above instead of a `run()` function.
- In your `deploy(Network _network)` function, you interact with **clients** instead of interacting directly with your contracts.

We'll go into detail on each of these below.

## Required Configuration Options
In the `setUp()` function, you'll assign values to a `sphinxConfig` struct to configure your project's settings. We'll go through its fields one by one.

### Project Name
```
sphinxConfig.projectName = "My Project";
```

TODO(md): answer the question: how are addresses generated with sphinx?

The `projectName` is the name of your project, and it can be any name you choose. It's case-sensitive.

### Owners
```
sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
```

The list of addresses that own this project. Owners can perform permissioned actions such as approving deployments. If you are deploying using the CLI, you are limited to a single owner address. To use multiple owners, you'll need to deploy using the Sphinx DevOps platform. We recommend that the owner accounts are hardware wallets.

### Threshold
```
sphinxConfig.threshold = 1;
```

The number of owner signatures required to approve a deployment. If you are deploying using the CLI, then this needs to be 1.

### DevOps Platform Options
If you are using the Sphinx DevOps platform, there are several additional options you'll need to configure. You can learn more about them in the [Sphinx DevOps Platform](https://github.com/sphinx-labs/sphinx/blob/develop/docs/writing-sphinx-scripts.md) guide.

## Sphinx Deploy Function

The entry point for Sphinx deployments must always be:

```sol
function deploy(Network _network) public override sphinx(_network) {
    ...
}
```

You must include the modifier `sphinx(_network)` shown above for the deployment to work properly.

You'll notice that the function has a `Network _network` argument. This is an enum that you can optionally use to customize your deployments on different networks. For example:

```sol
function deploy(Network _network) public override sphinx(_network) {
    if (_network == Network.ethereum) {
      ...
    } else if (_network == Network.optimism) {
      ...
    }
}
```

## Interacting with Clients

During your deployment, you'll interact with clients instead of interacting directly with your contracts. Sphinx uses clients to ensure that your deployment process is idempotent, which means that each transaction in your deployment will be executed exactly once, even if you run the script multiple times.

You can generate your clients with the command:
```
npx sphinx generate
```

TODO(md): left off: converting the numbers to nested tags

Sphinx generates a client for each contract in the `src` directory defined your `foundry.toml`, which defaults to `src/`. Sphinx skips generating clients for any files ending in `.t.sol` or `.s.sol`, which are meant to be test file and script files, respectively.

The interface of a client is generated based on its corresponding contract. This means that if you change the interface of a contract during development, you may need to re-generate your clients using the command above.

Clients serve three purposes:
1. Deploy a new instance of a contract
2. Call functions on a contract
3. Define a contract that already exists a given address

We'll explain each of these below.

### Deploying Contracts

To deploy a contract using Sphinx, you'll use slightly different syntax compared to a standard deployment. Instead of using the `new` keyword (e.g. `new MyContract(...)`), you'll need to call a deployment function.

For example, say you have a contract called `HelloSphinx` that you'd normally deploy via `new HelloSphinx("Hello!", 2)`. Using Sphinx, you'd deploy this contract by calling the function:

```
deployHelloSphinx("Hello!", 2);
```

Sphinx autogenerates a deployment function like this for each of your contracts. These autogenerated functions exist in your `SphinxClient` contract, which is inherited by your script. There is one deployment function per contract.

We use this custom syntax because your contracts are deployed via `CREATE3`, which results in different addresses than the `new` keyword.

Typically, the deployment function for a contract will follow the format: `deploy<ContractName>`. If your repository contains more than one contract with the same name, Sphinx will resolve this ambiguity by incorporating the full path to the contract with the format: `deploy<PathToContract>_<ContractName>`. For example, say your repository contains more than one contract with the name `ERC20`. If one of these contracts is located at `src/tokens/MyTokens.sol`, then its deployment function would be called: `deploySrcTokensMyTokens_ERC20`.

### Contract Deployment Options

Sometimes, it may be necessary to configure additional options when deploying contracts using Sphinx. For example, you may want to use a custom salt to determine your contract's `CREATE3` address, or you may want to deploy multiple instances of a contract. You can do this by entering a `DeployOptions` struct as the last argument of the appropriate deployment function. The structure of the `DeployOptions` struct is:

```sol
struct DeployOptions {
    string referenceName;
    bytes32 salt;
}
```

The fields of the `DeployOptions` struct are explained in detail below.

TODO(md): mention that changing the reference name or salt will result in a different Create3 address.

#### Reference Name

A string label for the contract. The reference name is displayed in the deployment preview, website UI, etc. By default, the reference name is the name of the contract being deployed. It determines a contract's address along with the `salt`.

We recommend specifying the reference name when you want to deploy multiple instances of the same contract in the same deployment. For example, if you want to deploy two instances of `MyContract`, where one is called "MyFirstContract" and the other is called "MySecondContract", you can write:

```sol
deployMyContract(..., DeployOptions({ referenceName: "MyFirstContract", salt: bytes32(0) }));
deployMyContract(..., DeployOptions({ referenceName: "MySecondContract", salt: bytes32(0) }));
```

#### Salt

A `bytes32` salt value. Along with the reference name, the `salt` determines a contract's `CREATE3` address. The salt is `bytes32(0)` by default. We recommend changing the salt when you need to re-deploy a contract to a new address. Example usage:

```sol
deployMyContract(..., DeployOptions({ referenceName: "MyContract", salt: bytes32(123) }));
```

## 7. Defining Existing Contracts

Sometimes you may need to call functions on a contract that has already been deployed outside of the Sphinx system. To support this, Sphinx autogenerates functions that are prefixed with `define`, e.g. `defineMyContract`. Like the deployment functions, these functions exist in your `SphinxClient` contract, which is inherited by your script. The syntax is slightly different because you're defining a contract that already exists instead of deploying a new one.

If a contract called `MyContract` already exists at address `0x123`, you can define it via:

```
MyContractClient myContractClient = defineMyContract(address(0x123));
```

Then, you can call functions on the contract like normal.

> If your project includes any Solidity interfaces, we'll automatically generate clients for them along with the rest of your contracts. However, we will only generate a `define` function for interfaces.

### Options for Defining Existing Contracts (optional)

If you'd like to change the name that's displayed for contracts using the `define<contract>` syntax, you can pass in a `DefineOptions` struct. For example:

```
defineHelloSphinx(address(0x123), DefineOptions({ referenceName: "DifferentContractName" }));
```

## 8. Calling Contract Functions

To call a function on one of your contracts, you'll need to use its associated client contract, which is returned whenever you deploy or define a contract using the syntax described above. For example, if you deploy a contract then call a function on it, your deployment would look something like:

```
// Import the client contract
import { HelloSphinxClient } from "../client/HelloSphinx.c.sol";

function deploy(Network _network) public override sphinx(_network) {
  HelloSphinxClient helloSphinxClient = deployHelloSphinx("Hello!", 2);
  helloSphinxClient.add(1);
}
```

You can call any state-changing function or `pure` function on your contract client. However, you cannot call `view` functions, and you also cannot use the returned values of state-changing functions. We have restricted the interface of the contract clients to account for these limitations. If either of these limitations prevent you from using Sphinx, please let us know.

## 9. Owned Contracts

There are two things to keep in mind when deploying contracts that use an ownership mechanism such as OpenZeppelin's `AccessControl` or `Ownable`.

1. You must explicitly set the owner of your contract in its constructor. When doing this, you *must not* use `msg.sender`. This is because the `msg.sender` of each contract is a minimal `CREATE3` proxy that has no logic to execute transactions. This means that if the `msg.sender` owns your contracts, you won't be able to execute any permissioned functions or transfer ownership to a new address.
2. If you need to call permissioned functions on your contract after it's deployed, you must grant the appropriate role to your `SphinxManager`, which is the contract that executes your deployment. See [this guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/permissioned-functions.md) for instructions on how to do that.

## 10. Importing External Contracts
If you need to deploy or interact with a contract that is not included in your contract source folder, you'll need to generate a contract client for it. You can do this by creating a file in your source folder that imports the contract you need.

For example, say you need to interact with a LayerZero interface that's stored in their package, which is a dependency of your project. You can create a file called `SphinxExternals.sol` in your source directory that imports the interface you need:

```sol
import { ILayerZeroEndpoint } from "@layerzero/contracts/interfaces/ILayerZeroEndpoint.sol";
```

## 11. Learn more
You should now be able to write scripts to deploy and interact with your contracts using Sphinx. If you have questions, please reach out in the [Discord](https://discord.gg/7Gc3DK33Np).

If you'd like to try the Sphinx DevOps Platform, which includes features such as gasless and multichain deployments, see [this guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/ci-foundry-proposals.md).
