# `SphinxModuleFactory` Contract Specification

TODO(gpt):
- assumptions: OpenZeppelin Create2, enableModule, etc

The `SphinxModuleFactory` deploys [`SphinxModule`](TODO(end)) contracts at deterministic addresses and enables them within Gnosis Safe contracts. There are two use cases for the `SphinxModuleFactory`:
1. _Deploy a `SphinxModule` after a Gnosis Safe has been deployed_.
2. _Deploy a Gnosis Safe and enable a `SphinxModule` in a single transaction_.

We'll describe these use cases in more detail below.

## Table of Contents

TODO(end)

## Relevant Files

- The interface: [`ISphinxModuleFactory.sol`](TODO(end))
- The contract: [`SphinxModuleFactory.sol`](TODO(end))
- Unit tests: [`SphinxModuleFactory.t.sol`](TODO(end))
- TODO: E2E tests?

## Deploy a `SphinxModule` for an existing Gnosis Safe

Anybody can call the `SphinxModuleFactory`'s `deploySphinxModule` function to deploy a new `SphinxModule`. After deploying the module, the `SphinxModuleFactory` serves no further purpose; the Gnosis Safe owners can add the module by directly calling the Safe's `enableModule` function.

## Deploy a Gnosis Safe and enable a `SphinxModule` in a single transaction

It should be possible to submit a single transaction that:
1. Deploys a Gnosis Safe at a deterministic address
2. Deploys a `SphinxModule` at a deterministic address
3. Enables the `SphinxModule` within the Gnosis Safe

This makes it possible for a third party (like Sphinx) to deploy and set up a Gnosis Safe on behalf of the Safe owners without requiring their signatures. If the Safe owners are confident that their Safe has been deployed correctly at a given address on one chain, then they can be confident that a Safe at the **same address** on any other chain has also been deployed correctly.

We can do this by calling the [Gnosis Safe Proxy Factory's `createProxyWithNonce`](TODO(end)) function, which uses `CREATE2`. The `initializer` input parameter contains all of the information necessary to set up the Gnosis Safe, including the Safe owner addresses, the signature threshold, and the `SphinxModule` info.

Since the `initializer` data determines the address of the Gnosis Safe, it cannot include the address of the Gnosis Safe, since this would cause a circular dependency. In other words, the `initializer` data would need to include the address of the Gnosis Safe, which is calculated based on the `initializer` data, which would need to include the address of the Gnosis Safe, etc. For this same reason, we cannot include the address of the `SphinxModule` in the `initializer` data, since the address of the module depends on the address of the Gnosis Safe.

To resolve this, the `SphinxModuleFactory` includes functions for deploying and enabling a `SphinxModule` without using the address of the Gnosis Safe or the address of the `SphinxModule` as input parameters. The `initializer` data must include a [`MultiSend`](TODO(end)) call that executes two function calls on the `SphinxModuleFactory`: `deploySphinxModuleFactoryFromSafe` and `enableSphinxModuleFromSafe`. More details on these functions are below. To see an example of this deployment process, see [TODO(end)](TODO(end)).

## High-level Invariants

- It must be possible to deploy and enable a `SphinxModule` for a Gnosis Safe that already exists.
- It must be possible for anybody to execute a single transaction that deploys a Gnosis Safe at a deterministic address, deploys a `SphinxModule` at a deterministic address, and enables the `SphinxModule`, as described in the [previous section](TODO(end)).
- If the deployment strategy described in the [previous section](TODO(end)) succeeds on one network, it must always succeed on another network (assuming that the appropriate factories have been deployed first). For example, this invariant would be violated if the following scenario is possible:
  1. User deploys on chain 1 using the strategy described in the previous section.
  2. A malicious actor deploys a `SphinxModule` at the same `CREATE2` address on chain 2.
  3. The user will not be able to deploy a Gnosis Safe at the same address on chain 2. Their deployment on chain 2 will revert because a `SphinxModule` already exists at the `CREATE2` address.
- The address of a `SphinxModule` must be calculated via `CREATE2` using the following inputs:
  - The address of the `SphinxModuleFactory` (i.e. the deployer).
  - The address of the Gnosis Safe proxy contract that the `SphinxModule` belongs to.
  - The address of the caller that deploys the `SphinxModule` through the `SphinxModuleFactory`.
  - An arbitrary `uint256` nonce.
- All of the behavior described in this specification must apply to [all versions of Gnosis Safe supported by Sphinx](TODO(end)).

## Function-level Invariants

#### `function deploySphinxModule(address _safeProxy, uint256 _saltNonce) external returns (address sphinxModule);`

- Must revert if a contract already exists at the `CREATE2` address.
- Must revert if delegatecalled.
  - Rationale: This would change the `CREATE2` address of the deployed `SphinxModule`.
- A successful call must:
  - Deploy a `SphinxModule` at the correct `CREATE2` address.
  - Set the deployed `SphinxModule`'s `safeProxy` variable to be the correct Gnosis Safe proxy address.
  - Emit a `SphinxModuleDeployed` event in the `SphinxModuleFactory`.
  - Return the deployed `SphinxModule`.

#### `function deploySphinxModuleFromSafe(uint256 _saltNonce) external;`

- Must revert if a contract already exists at the `CREATE2` address.
- Must revert if delegatecalled.
  - Rationale: This would change the `CREATE2` address of the deployed `SphinxModule`.
- A successful call must:
  - Deploy a `SphinxModule` at the correct `CREATE2` address.
  - Set the deployed `SphinxModule`'s `safeProxy` variable to be the correct Gnosis Safe proxy address.
  - Emit a `SphinxModuleDeployed` event in the `SphinxModuleFactory`.

#### `function enableSphinxModuleFromSafe(uint256 _saltNonce) external;`

- Must revert if not delegatecalled.
- Must enable the `SphinxModule` as a module in the Gnosis Safe that triggered the delegatecall.

TODO: this formatting is a little awkward b/c the function signature is so long.
#### `function computeSphinxModuleAddress(address _safeProxy, address _caller, uint256 _saltNonce) external view returns (address);`

- Must return the correct `CREATE2` address of a `SphinxModule` deployed by the `SphinxModuleFactory`.

## Assumptions

TODO: you say that you unit tests the correct behavior of Safe, but currently the unit tests don't include all four Safes.

The `SphinxModuleFactory` calls a couple external contracts. We test that the interactions with these contracts work properly in the [unit tests for the `SphinxModuleFactory`](TODO(end)). However, we don't thoroughly test the internals of these external contracts. Instead, we rely on the assumption that they're secure and have been thoroughly tested by their authors. These external contracts are:
- OpenZeppelin's `Create2.sol` vTODO, which deploys the `SphinxModule` contracts (via `Create2.deploy`) and computes their addresses (via `Create2.computeAddress`).
- Gnosis Safe's `enableModule` function, which enables the `SphinxModule` within the user's Gnosis Safe.
