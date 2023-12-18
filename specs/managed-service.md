# `ManagedService` Contract Specification

When deploying via the Sphinx DevOps Platform, the `ManagedService` contract is the default `executor`. It relays calls from arbitrary EOAs to the end user's Gnosis Safe contract using their installed `SphinxModuleProxy`.

The Sphinx team owns the `ManagedService` contract.

## Table of Contents

- [Relevant files](#relevant-files)
- [Use Case](#use-case)
- [High-Level Invariants](#high-level-invariants)
- [Function-Level Invariants](#function-level-invariants)
- [Assumptions](#assumptions)

## Relevant Files

- The contract: [`ManagedService.sol`](https://github.com/sphinx-labs/sphinx/blob/develop/packages/contracts/contracts/core/ManagedService.sol)
- Unit tests: [`ManagedService.t.sol`](https://github.com/sphinx-labs/sphinx/blob/develop/packages/contracts/test/ManagedService.t.sol)

## Use Case

### Allow the user to specify a consistent `executor` address when deploying via the Sphinx DevOps Platform
When deploying via Sphinx, the user must specify an `executor` field in their deployment approval leaf (see the [Sphinx Merkle tree specification](https://github.com/sphinx-labs/sphinx/blob/develop/specs/merkle-tree.md#approve-leaf-data) for more information). However, the individual addresses used by the Sphinx DevOps Platform to execute transactions may vary and be rotated regularly. Therefore, we use the `ManagedService` contract to allow users to specify a single address whenever they deploy via the platform.

## High-Level Invariants
- It must be possible to execute an arbitrary `call` via the `ManagedService` contract.
- It must *not* be possible to execute a `delegatecall` via the `ManagedService` contract.
- If the underlying `call` reverts, the entire transaction should revert.

## Function-Level Invariants

#### `constructor(address _owner)`

- Must grant the `DEFAULT_ADMIN_ROLE` to the specified owner address.
- Must revert if the `_owner` address is `address(0)`.

#### `function exec(address _to, bytes calldata _data) public payable returns (bytes memory)`

- Must revert if the caller does not have the `RELAYER_ROLE` role.
- Must revert if the underlying call reverts.
- Must revert if the destination address is `address(0)`.
- Must revert if the `ManagedService` calls this function directly or indirectly (i.e. re-entrancy is not allowed).
- A successful call must:
  - Call the target address with the requested data.
  - Emit a `Called` event in the `ManagedService` contract.
  - Return the return value of the underlying call as raw bytes.

## Assumptions

### Dependencies
The `ManagedService` relies on the OpenZeppelin `AccessControl` contract to manage access and the `ReentrancyGuard` contract to protect against reentrancy attacks. We test that the interactions with these contracts work correctly in the [unit tests for the `ManagedService`](https://github.com/sphinx-labs/sphinx/blob/develop/packages/contracts/test/ManagedService.t.sol), but we don't thoroughly test these contracts. Instead, we assume that they are secure and have been thoroughly tested by their authors.

### Security Impact on the `SphinxModuleProxy`
The Sphinx DevOps Platform relies on sending transactions via the `ManagedService` from arbitrary EOAs with the `RELAYER_ROLE` to execute deployments on behalf of the user via their `SphinxModuleProxy`. We operate under the assumption that these EOAs will inevitably be compromised, and we intend to have mitigation strategies in place to deal with that. We expect that a compromised EOA with the `RELAYER_ROLE` will not impact the fundamental security properties of the `SphinxModuleProxy`. Likewise, we expect that to be true if the `ManagedService` contract is compromised in some other way. See the [`SphinxModuleProxy` specification](https://github.com/sphinx-labs/sphinx/blob/develop/specs/sphinx-module-proxy.md#malicious-executor) for more information on what a malicious `executor` could do.
