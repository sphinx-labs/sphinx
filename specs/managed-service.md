# `ManagedService` Contract Specification

The `ManagedService` contract is the default executor when deploying via the Sphinx DevOps platform. It is used to relay calls from arbitrary EOA executors to the end user's Gnosis Safe contract using their installed `SphinxModuleProxy`.

The `ManagedService` contract is owned by the Sphinx team.

## Table of Contents

- [Relevant Files](#relevant-files)
- [Consistent Executor Address](#allow-the-user-to-specify-a-consistent-executor-address-when-deploying-via-the-sphinx-devops-platform)
- [Store Funds for Execution](#store-the-funds-used-for-executing-transactions-on-each-chain)
- [High-Level Invariants](#high-level-invariants)
- [Function Level Invariants](#function-level-invariants)
- [Assumptions](#assumptions)

## Relevant Files

- The contract: [`ManagedService.sol`](TODO(end))
- Unit tests: [`ManagedService.t.sol`](TODO(end))

## Use Cases

There are use cases for the `ManagedService` contract:

1. Allow the user to specify a consistent `executor` address when deploying via the Sphinx DevOps platform.
2. Store the funds used for executing transactions on each chain.

We'll describe these in more detail below.

### Allow the user to specify a consistent `executor` address when deploying via the Sphinx DevOps platform
When deploying via Sphinx, the user must specify an `executor` field in their deployment approval leaf (see the [SphinxModule spec](TODO(end)) for more information). When deploying via the Sphinx DevOps platform, the individual addresses used to execute transactions may vary and may be rotated regularly. Therefore, we use the `ManagedService` contract to allow the user to specify a single address whenever they are deploying via the Sphinx DevOps platform.

### Store the funds used for executing transactions on each chain
The Sphinx DevOps platform backend relies on sending transactions via the `ManagedService` contract from an arbitrary set of accounts to execute deployments. To make funding management easy, the cost of each call should be refunded to the caller from the `ManagedService` contracts balance.

## High-Level Invariants
- It must be possible to execute an arbitrary `call` via the `ManagedService` contract.
- Executors should be reimbursed for their gas fees when executing calls via the ManagedService contract.
- It should *not* be possible to execute a `delegatecall` via the `ManagedService` contract.

## Function-Level Invariants

#### `constructor(address _owner)`

- Must grant the `DEFAULT_ADMIN_ROLE` to the specified owner address

#### `receive() external payable`

- Must allow ETH to be transferred to this contract

#### `function exec(address _to, bytes calldata _data) public payable returns (bytes memory)`

- Must revert if the caller does not have the `RELAYER_ROLE` role.
- Must revert if the underlying call reverts.
- Must revert if the balance of the `ManagedService` contract is not sufficient to refund the caller for their gas cost.
- A successful call:
  - Call the target address with the requested data.
  - Refund the caller the cost of the transaction plus a small buffer.
  - Emit a `Called` event in the `ManagedService` contract.
  - Return the return value of the underlying call as raw bytes.

#### `function withdrawTo(uint256 _amount, address _recipient) public`

- Must revert if the caller does not have either the `RELAYER_ROLE` or the `DEFAULT_ADMIN_ROLE`.
- Must revert if `_amount` is greater than the balance of the `ManagedService` contract.
- Must revert if the `_recipient` is the zero address.
- Must revert if the transfer fails for any reason.
- A successful call:
  - Transfer `_amount` in native tokens to the `_recipient` address.
  - Emit a `Withdrew` event in the `ManagedService` contract.

## Assumptions
The `ManagedService` relies on the OpenZeppelin `AccessControl` contract to manage access and the `ReentrancyGuard` contract to protect against reentrancy attacks. We test that the interactions with these contracts work properly in the [unit tests for the `ManagedService`](TODO(end)), but we don't thoroughly test these contracts. Instead, we rely on the assumption that they are secure and have been thoroughly tested by their authors.

The `ManagedService` uses EOAs with the `RELAYER_ROLE` to withdraw funds and execute transactions. These EOAs are intended to be owned and controlled by the Sphinx team, so we assume they are securely managed.

The Sphinx DevOps platform relies on sending transactions via the `ManagedService` from arbitrary EOAs to execute deployments on behalf of the user using their `SphinxModuleProxy`. From the perspective of the `ManagedService` contract, we assume that the `SphinxModuleProxy` is secure. If an EOA with the RELAYER_ROLE is compromised, we expect it will not be able to execute transactions that have not been explicitly approved by the end user as specified by the invariants of the `SphinxModule`.
