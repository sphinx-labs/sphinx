# `ManagedService` Contract Specification

The `ManagedService` contract is the default executor when deploying via the Sphinx DevOps platform. It is used to relay calls from arbitrary EOA executors to the end user's Gnosis Safe contract using their installed `SphinxModuleProxy`.

The `ManagedService` contract is owned by the Sphinx team.

## Table of Contents

- [Relevant files](#relevant-files)
- [Use Cases](#use-cases)
- [High-Level Invariants](#high-level-invariants)
- [Function-Level Invariants](#function-level-invariants)
- [Assumptions](#assumptions)

## Relevant Files

- The contract: [`ManagedService.sol`](https://github.com/sphinx-labs/sphinx/blob/feature/pre-audit/packages/contracts/contracts/core/ManagedService.sol)
- Unit tests: [`ManagedService.t.sol`](https://github.com/sphinx-labs/sphinx/blob/feature/pre-audit/packages/contracts/test/ManagedService.t.sol)

## Use Case

### Allow the user to specify a consistent `executor` address when deploying via the Sphinx DevOps platform
When deploying via Sphinx, the user must specify an `executor` field in their deployment approval leaf (see the [`SphinxModuleProxy` specification](https://github.com/sphinx-labs/sphinx/blob/feature/pre-audit/specs/sphinx-module-proxy.md#approve-leaf-data) for more information). However, the individual addresses used by the Sphinx DevOps platform to execute transactions may vary and be rotated regularly. Therefore, we use the `ManagedService` contract to allow the user to specify a single address whenever they are deploying via the platform.

## High-Level Invariants
- It must be possible to execute an arbitrary `call` via the `ManagedService` contract.
- It should *not* be possible to execute a `delegatecall` via the `ManagedService` contract.
- If the underlying `call` reverts, then the entire transaction should revert.

## Security Impact on the SphinxModuleProxy
The Sphinx DevOps platform relies on sending transactions via the `ManagedService` from arbitrary EOAs with the `RELAYER_ROLE` to execute deployments on behalf of the user via their `SphinxModuleProxy`. It is worth noting that we operate under the assumption that these EOAs will inevitably be compromised and we intend to have mitigation strategies in place to deal with that. We expect that a compromised EOA with the `RELAYER_ROLE` will have no impact on the fundamental security properties of the `SphinxModuleProxy`. Likewise we expect that to also be true if the `ManagedService` contract is compromised in some other way.

## Function-Level Invariants

#### `constructor(address _owner)`

- Must grant the `DEFAULT_ADMIN_ROLE` to the specified owner address.
- Must revert if the `_owner` address is address(0).

#### `function exec(address _to, bytes calldata _data) public payable returns (bytes memory)`

- Must revert if the caller does not have the `RELAYER_ROLE` role.
- Must revert if the underlying call reverts.
- Must revert if the destination address is address(0).
- A successful call:
  - Call the target address with the requested data.
  - Refund the caller the cost of the transaction plus a small buffer.
  - Emit a `Called` event in the `ManagedService` contract.
  - Return the return value of the underlying call as raw bytes.

## Assumptions
The `ManagedService` relies on the OpenZeppelin `AccessControl` contract to manage access and the `ReentrancyGuard` contract to protect against reentrancy attacks. We test that the interactions with these contracts work properly in the [unit tests for the `ManagedService`](https://github.com/sphinx-labs/sphinx/blob/feature/pre-audit/packages/contracts/test/ManagedService.t.sol), but we don't thoroughly test these contracts. Instead, we rely on the assumption that they are secure and have been thoroughly tested by their authors.
