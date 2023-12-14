# `SphinxModuleProxyFactory` Contract Specification

The `SphinxModuleProxyFactory` deploys minimal, non-upgradeable [EIP-1167](https://eips.ethereum.org/EIPS/eip-1167) proxy contracts at deterministic addresses, which delegate all calls to a single `SphinxModule` implementation contract. The `SphinxModuleProxyFactory` can also enable `SphinxModule` proxies within Gnosis Safe contracts.

**Vocabulary notes**:
* A _SphinxModuleProxy_ is an EIP-1167 proxy that delegates calls to a `SphinxModule` implementation contract. There is no source file for the `SphinxModuleProxy` because we use OpenZeppelin's [`Clones`](https://docs.openzeppelin.com/contracts/4.x/api/proxy#Clones) for deploying EIP-1167 proxies and calculating their addresses.
* A _SphinxModule_ is the `SphinxModule` implementation contract.
* A _Gnosis Safe_ is a Gnosis Safe proxy contract that delegates calls to a Gnosis Safe implementation.

## Table of Contents

- [Relevant Files](#relevant-files)
- [Use Cases](#use-cases)
- [High-Level Invariants](#high-level-invariants)
- [Function-Level Invariants](#function-level-invariants)
- [Assumptions](#assumptions)

## Relevant Files

- The interface: [`ISphinxModuleProxyFactory.sol`](https://github.com/sphinx-labs/sphinx/blob/develop/packages/contracts/contracts/core/interfaces/ISphinxModuleProxyFactory.sol)
- The contract: [`SphinxModuleProxyFactory.sol`](https://github.com/sphinx-labs/sphinx/blob/develop/packages/contracts/contracts/core/SphinxModuleProxyFactory.sol)
- Unit tests: [`SphinxModuleProxyFactory.t.sol`](https://github.com/sphinx-labs/sphinx/blob/develop/packages/contracts/test/SphinxModuleProxyFactory.t.sol)

## Use Cases

There are two use cases for the `SphinxModuleProxyFactory`:
1. _Deploy a `SphinxModuleProxy` after a Gnosis Safe has been deployed_.
2. _Deploy a Gnosis Safe and enable a `SphinxModuleProxy` in a single transaction_.

We'll describe these in more detail below.

### 1. Deploy a `SphinxModuleProxy` for an existing Gnosis Safe

Anybody can call the `SphinxModuleProxyFactory`'s `deploySphinxModuleProxy` function to deploy a new `SphinxModuleProxy`. After deploying the module, the `SphinxModuleProxyFactory` serves no further purpose; the Gnosis Safe owners can add the module by directly calling the Safe's `enableModule` function.

### 2. Deploy a Gnosis Safe and enable a `SphinxModuleProxy` in a single transaction

It must be possible to submit a single transaction that:
1. Deploys a Gnosis Safe at a deterministic address
2. Deploys a `SphinxModuleProxy` at a deterministic address
3. Enables the `SphinxModuleProxy` within the Gnosis Safe

This process allows a third party (like Sphinx) to _permissionlessly_ deploy and set up a Gnosis Safe on behalf of the Safe owners without requiring their signatures. If the Safe owners are confident that their Safe has been deployed correctly at a given address on one chain, then they can be confident that a Safe at the **same address** on any other chain has also been deployed correctly. To achieve this, the address of the Gnosis Safe must not rely on the deployer.

We can do this by calling the [Gnosis Safe Proxy Factory's `createProxyWithNonce`](https://github.com/safe-global/safe-contracts/blob/v1.3.0-libs.0/contracts/proxies/GnosisSafeProxyFactory.sol#L57-L75) function, which uses `CREATE2`. The `initializer` input parameter contains all the information necessary to set up the Gnosis Safe, including the Safe owner addresses, the signature threshold, and the `SphinxModuleProxy` info.

Since the `initializer` data determines the address of the Gnosis Safe, it cannot include the address of the Gnosis Safe since this would cause a circular dependency. Specifically, the circular dependency would occur because the `initializer` data would need to include the address of the Gnosis Safe, which is calculated based on the `initializer` data, which would need to include the address of the Gnosis Safe, etc. For this same reason, we cannot include the address of the `SphinxModuleProxy` in the `initializer` data since the module's address depends on the address of the Gnosis Safe.

To resolve this, the `SphinxModuleProxyFactory` includes functions for deploying and enabling a `SphinxModuleProxy` without using the address of the Gnosis Safe or the address of the `SphinxModuleProxy` as input parameters. The `initializer` data must include a [`MultiSend`](https://github.com/safe-global/safe-contracts/blob/v1.3.0-libs.0/contracts/libraries/MultiSend.sol) call that executes two function calls on the `SphinxModuleProxyFactory`: `deploySphinxModuleProxyProxyFactoryFromSafe` and `enableSphinxModuleProxyFromSafe`. More details on these functions are below. To see an example of this deployment process, see the `initializeGnosisSafeWithModule` function in the [`SphinxModuleProxy` unit test file](https://github.com/sphinx-labs/sphinx/blob/develop/packages/contracts/test/SphinxModuleProxy.t.sol).

## High-Level Invariants

- It must be possible to deploy and enable a `SphinxModuleProxy` for a Gnosis Safe that already exists.
- It must be possible for anybody to execute a single transaction that deploys a Gnosis Safe at a deterministic address, deploys a `SphinxModuleProxy` at a deterministic address, and enables the `SphinxModuleProxy`, as described in the [previous section](#2-deploy-a-gnosis-safe-and-enable-a-sphinxmoduleproxy-in-a-single-transaction).
- If the deployment strategy described in the [previous section](#2-deploy-a-gnosis-safe-and-enable-a-sphinxmoduleproxy-in-a-single-transaction) succeeds on one network, it must always succeed on another network (assuming that the appropriate factories have been deployed first). For example, this invariant would be violated if the following scenario is possible:
  1. The user deploys on chain 1 using the strategy described in the previous section.
  2. A malicious actor deploys a `SphinxModuleProxy` at the same `CREATE2` address on chain 2.
  3. The user will not be able to deploy a Gnosis Safe at the same address on chain 2. It will revert because a `SphinxModuleProxy` already exists at the `CREATE2` address.
- The address of a `SphinxModuleProxy` must be calculated via `CREATE2` using the following inputs:
  - The address of the `SphinxModuleProxyFactory`.
  - The address of the Gnosis Safe contract that the `SphinxModuleProxy` belongs to.
  - The address of the caller that deploys the `SphinxModuleProxy` through the `SphinxModuleProxyFactory`.
  - An arbitrary `uint256` nonce.
- All of the behavior described in this specification must apply to [all Gnosis Safe contracts supported by Sphinx](https://github.com/sphinx-labs/sphinx/blob/develop/specs/introduction.md#supported-gnosis-safe-versions).

## Function-Level Invariants

#### `constructor()`

- Must deploy a `SphinxModule` contract at a `CREATE2` address determined by the address of the `SphinxModuleProxyFactory` and a `bytes32(0)` salt.

#### `function deploySphinxModuleProxy(address _safeProxy, uint256 _saltNonce) external returns (address sphinxModuleProxy)`

- Must revert if the input Gnosis Safe proxy is `address(0)`.
- Must revert if a contract already exists at the `CREATE2` address.
- A successful call must:
  - Deploy an EIP-1167 proxy at the correct `CREATE2` address using the `SphinxModule` implementation deployed in the `SphinxModuleProxyFactory`s constructor.
  - Emit a `SphinxModuleProxyDeployed` event in the `SphinxModuleProxyFactory`.
  - Never succeed without successfully deploying the `SphinxModule` implementation.
  - Initialize the `SphinxModuleProxy` using the correct Gnosis Safe address.
  - Return the address of the `SphinxModuleProxy`.
- A single caller must be able to deploy an arbitrary number of `SphinxModuleProxy` contracts by calling this function multiple times.

#### `function deploySphinxModuleProxyFromSafe(uint256 _saltNonce) external`

- Must revert if a contract already exists at the `CREATE2` address.
- A successful call must:
  - Deploy an EIP-1167 proxy at the correct `CREATE2` address, using the correct `SphinxModule` implementation deployed in the `SphinxModuleProxyFactory`'s constructor.
  - Emit a `SphinxModuleProxyDeployed` event in the `SphinxModuleProxyFactory`.
  - Initialize the `SphinxModuleProxy` using the _caller's address_ as the Gnosis Safe address.
- A single caller must be able to deploy an arbitrary number of `SphinxModuleProxy`s by calling this function multiple times.

#### `function enableSphinxModuleProxyFromSafe(uint256 _saltNonce) external`

- Must revert if not delegatecalled.
- A successful call must:
  - Must enable the correct `SphinxModuleProxy` as a module in the Gnosis Safe that triggered the `delegatecall`.
  - A single Gnosis Safe must be able to enable more than one `SphinxModuleProxy` by calling this function multiple times.

#### `function computeSphinxModuleProxyAddress(address _safeProxy, address _caller, uint256 _saltNonce) external view returns (address);`

- Must return the correct `CREATE2` address of a `SphinxModuleProxy` deployed by the `SphinxModuleProxyFactory`.

## Assumptions

The `SphinxModuleProxyFactory` calls a couple of external contracts. We test that the interactions with these contracts work properly in the [unit tests for the `SphinxModuleProxyFactory`](https://github.com/sphinx-labs/sphinx/blob/develop/packages/contracts/test/SphinxModuleProxyFactory.t.sol), but we don't thoroughly test the internals of these external contracts. Instead, we assume that they're secure and have been thoroughly tested by their authors. These external contracts are:
- [`Clones`](https://docs.openzeppelin.com/contracts/4.x/api/proxy#Clones) in OpenZeppelin's Contracts v4.9.3. This library deploys the `SphinxModuleProxy` contracts (via `Clones.cloneDeterministic`) and computes their addresses (via `Clones.predictDeterministicAddress`).
- Gnosis Safe's `enableModule` function enables a `SphinxModuleProxy` within the user's Gnosis Safe.
