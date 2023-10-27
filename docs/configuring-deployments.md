# Configuring Deployments

There are a few minor differences between deployments with Sphinx and deployments with vanilla Forge scripts. This guide will cover these differences.

## Table of Contents

- [Sample Sphinx Script](#sample-sphinx-script)
- [Configuration Options](#configuration-options)
  - [Required Configuration Options](#required-configuration-options)
    - [Project Name (`string`)](#project-name-string)
    - [Owners (`address[]`)](#owners-address)
    - [Threshold (`uint256`)](#threshold-uint256)
  - [DevOps Platform Options](#devops-platform-options)
    - [Proposers (`address[]`)](#proposers-address)
    - [Production networks (`Network[]`)](#production-networks-network)
    - [Test networks (`Network[]`)](#test-networks-network)
    - [Organization ID (`string`)](#organization-id-string)
- [The `run()` function](#the-run-function)
- [Deploying Contracts](#deploying-contracts)
  - [Contract Deployment Options](#contract-deployment-options)
    - [Reference Name](#reference-name)
    - [Salt](#salt)

## Sample Sphinx Script

A Sphinx deployment script has the following format:

```
import { Script } from "forge-std/Script.sol";
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
        sphinxConfig.orgId = "abcd-1234";
    }

    // Your deployment goes here:
    function run() public sphinx override {
        MyContract myContract = deployMyContract("Hello!", 2);
        myContract.add(1);
    }
}
```

There are three main differences between this script and a vanilla Forge script:

1. There are a few configuration options that you must specify in your `setUp()` function. These options exist on the `sphinxConfig` struct.
2. The `run()` function, which is the entry point for the deployment, must include a `sphinx` modifier.
3. Instead of using standard contract deployment syntax (i.e. `new MyContract(...)`), you'll need to call deployment functions like `deployMyContract(...)`. These deployment functions are automatically generated when you run the `sphinx generate` command. They exist in the `SphinxClient` contract, which must be inherited by your script.

We'll go into detail on each of these below.

## Configuration Options

In the `setUp()` function, you'll configure your project's settings by setting fields on a `sphinxConfig` struct. We'll go through its fields one by one.

### Required Configuration Options

#### Project Name (`string`)
```
sphinxConfig.projectName = "My Project";
```

The name of your project, which can be any name you choose. It's case-sensitive.

#### Owners (`address[]`)
```
sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
```

The list of addresses that own this project. Owners must approve deployments before they can be executed.

#### Threshold (`uint256`)
```
sphinxConfig.threshold = 1;
```

The number of owners required to approve a deployment.

### DevOps Platform Options
There are a few additional options that you'll need to configure before you can use the Sphinx DevOps Platform.

#### Proposers (`address[]`)

```
sphinxConfig.proposers = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
```

An array of proposer addresses. We recommend that you use a dedicated EOA for your proposer that does not store any funds and is not used for any other purpose besides proposing.

#### Production networks (`Network[]`)

```
sphinxConfig.mainnets = [Network.ethereum, Network.arbitrum];
```

The list of production networks to deploy on.

Valid values:

| Network | `Network` enum |
| ----------- | ----------- |
| Ethereum | `Network.ethereum` |
| Optimism | `Network.optimism` |
| Arbitrum | `Network.arbitrum` |
| Polygon POS | `Network.polygon` |
| Binance Smart Chain | `Network.bnb` |
| Gnosis Chain | `Network.gnosis` |
| Linea | `Network.linea` |
| Polygon ZKEVM | `Network.polygon_zkevm` |
| Avalanche C Chain | `Network.avalanche` |
| Fantom | `Network.fantom` |
| Base | `Network.base` |

#### Test networks (`Network[]`)
```
sphinxConfig.testnets = [Network.goerli, Network.arbitrum_goerli];
```

The list of testnets to deploy on.

Valid values:

| Network | `Network` enum |
| ----------- | ----------- |
| Ethereum Goerli | `Network.goerli` |
| Optimism Goerli | `Network.optimism_goerli` |
| Arbitrum Goerli | `Network.arbitrum_goerli` |
| Polygon Mumbai | `Network.polygon_mumbai` |
| Binance Smart Chain Testnet | `Network.bnb_testnet` |
| Gnosis Chiado | `Network.gnosis_chiado` |
| Linea Goerli | `Network.linea_goerli` |
| Polygon ZKEVM Goerli | `Network.polygon_zkevm_goerli` |
| Avalanche Fuji | `Network.avalanche_fuji` |
| Fantom Testnet | `Network.fantom_testnet` |
| Base Goerli | `Network.base_goerli` |

#### Organization ID (`string`)

```
sphinxConfig.orgId = "abcd-1234";
```

Your organization ID from the Sphinx UI. This is a public field, so you don't need to keep it secret.

## The `run()` function

The entry point for Sphinx deployments must always be:

```sol
function run() public sphinx override {
    ...
}
```

You must include the `sphinx` modifier for the deployment to work properly.

## Deploying Contracts
To deploy a contract using Sphinx, you'll need to use slightly different syntax compared to a standard deployment. Instead of using the `new` keyword (e.g. `new MyContract(...)`), you'll need to call a deployment function provided by Sphinx.

For example, say you have a contract called `HelloSphinx` that you'd normally deploy via `new HelloSphinx("Hello!", 2)`. Using Sphinx, you'd deploy this contract by calling the function:

```
deployHelloSphinx("Hello!", 2);
```

Sphinx autogenerates a deployment function like this for each of your contracts. These autogenerated functions exist in your `SphinxClient` contract, which is inherited by your script. There is one deployment function per contract.

You can generate your client using:
```
npx sphinx generate
```

Typically, the deployment function for a contract will follow the format: `deploy<ContractName>`. If your repository contains more than one contract with the same name, Sphinx will resolve this ambiguity by using the full path to the contract with the format: `deploy<PathToContract>_<ContractName>`. For example, say your repository contains more than one contract with the name `ERC20`. If one of these contracts is located at `src/tokens/MyTokens.sol`, then its deployment function would be called: `deploySrcTokensMyTokens_ERC20`.

### Contract Deployment Options

Sometimes, it may be necessary to configure additional options when deploying contracts using Sphinx. For example, you may want to use a custom salt to determine your contract's CREATE3 address, or you may want to deploy multiple instances of the same contract. You can do this by entering a `DeployOptions` struct as the last argument of the appropriate deployment function. The structure of the `DeployOptions` struct is:

```sol
struct DeployOptions {
    string referenceName;
    bytes32 salt;
}
```

The fields of the `DeployOptions` struct are explained in detail below. Note that changing either of these fields will result in your contract having a different CREATE3 address.

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
