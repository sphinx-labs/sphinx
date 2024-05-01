# `SphinxGnosisSafeProxyFactory` Contract Specification

The `SphinxGnosisSafeProxyFactory` deterministically deploys Gnosis Safes that each have a `SphinxModuleProxy` contract enabled.

**Vocabulary notes**:
* A _Gnosis Safe_ is a Gnosis Safe proxy contract that delegates calls to a Gnosis Safe implementation.
* We use the term _Gnosis Safe_ and _Safe_ interchangeably in this document since they refer to the same organization.

## Table of Contents

## Relevant Files

- The interface: TODO(later)
- The contract: TODO(later)
- Unit tests: TODO(later)

## Use Case

This factory allows anybody to deploy and set up a Gnosis Safe that's compatible with Sphinx on behalf of the Gnosis Safe owners. The address of the Gnosis Safe and `SphinxModuleProxy` are calculated via `CREATE2` so that they have consistent addresses across networks.

The code for Sphinx's standard Gnosis Safe deployment process, which uses the `SphinxGnosisSafeProxyFactory` and `SphinxModuleProxyFactory`, can be viewed [here](TODO(later)).

We use the `SphinxGnosisSafeProxyFactory` because [Gnosis Safe's Proxy Factory](TODO(later)) allows a Gnosis Safe to be deployed at a deterministic address without guaranteeing that a `SphinxModuleProxy` has been deployed and enabled within the Gnosis Safe. [This TODO](TODO(later)) shows why Gnosis Safe's Proxy Factory cannot guarantee this use case.

## High-Level Invariants

- It must be possible for anybody to execute a single transaction that deploys a Gnosis Safe at a deterministic address, deploys a `SphinxModuleProxy` at a deterministic address, and enables the `SphinxModuleProxy` within the Gnosis Safe.
- The caller's address must not determine the address of the deployed Gnosis Safe or `SphinxModuleProxy`.
- If a transaction submitted on the `SphinxGnosisSafeProxyFactory` succeeds on one network, it must always succeed on another network. For example, this invariant would be violated in the following scenario:
  1. The transaction succeeds on Chain A.
  2. On Chain B, the Gnosis Safe and its `SphinxModuleProxy` are deployed at their expected addresses, but the `SphinxModuleProxy` is not enabled within the Gnosis Safe.
- All of the behavior described in this specification must apply to [all Gnosis Safe contracts supported by Sphinx](https://github.com/sphinx-labs/sphinx/blob/develop/specs/introduction.md#supported-gnosis-safe-versions).

## Function-Level Invariants

#### `constructor(address _moduleProxyFactory)`

- Must assign the `_moduleProxyFactory` to the `moduleProxyFactory` state variable.

#### `function deployThenEnable(address _safeProxy, uint256 _saltNonce) external returns (address sphinxModuleProxy)`

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

### `SphinxModuleProxyFactory`

The address of the `moduleProxyFactory` belongs to a `SphinxModuleProxyFactory` defined in the [`SphinxModuleProxyFactory` Contract Specification](TODO(later)).

### Dependencies

The `SphinxModuleProxyFactory` calls a couple of external contracts. We test that the interactions with these contracts work properly in the [unit tests for the `SphinxModuleProxyFactory`](https://github.com/sphinx-labs/sphinx/blob/develop/packages/contracts/test/SphinxModuleProxyFactory.t.sol), but we don't thoroughly test the internals of these external contracts. Instead, we assume that they're secure and have been thoroughly tested by their authors. These external contracts are:
- [`Clones`](https://docs.openzeppelin.com/contracts/4.x/api/proxy#Clones) in OpenZeppelin's Contracts v4.9.3. This library deploys the `SphinxModuleProxy` contracts (via `Clones.cloneDeterministic`) and computes their addresses (via `Clones.predictDeterministicAddress`).
- Gnosis Safe's `enableModule` function enables a `SphinxModuleProxy` within the user's Gnosis Safe.
