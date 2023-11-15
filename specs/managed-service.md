# `ManagedService` Contract Specification

The `ManagedService` contract is the default executor when deploying via the Sphinx DevOps platform. It is used to relay calls from arbitrary EOA executors to the end user's Safe Wallet.

There are two goals of the `ManagedService` contract:
1. Allow the user to specify a consistent `executor` address when deploying via the Sphinx DevOps platform.
2. Store the funds used for executing transactions on each chain.

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

## Allow the user to specify a consistent `executor` address when deploying via the Sphinx DevOps platform
When deploying via Sphinx, the user must specify an `executor` field in their deployment approval leaf (see the [SphinxModule spec](TODO(end)) for more information). When deploying via the Sphinx DevOps platform, the individual addresses used to execute transactions may vary and may be rotated regularly. Therefore, we use the `ManagedService` contract to allow the user to specify a single address whenever they are deploying via the Sphinx DevOps platform.

## Store the funds used for executing transactions on each chain
The Sphinx DevOps platform backend relies on sending transactions via the `ManagedService` contract from an arbitrary set of accounts to execute deployments. To make funding management easy, the cost of each call should be refunded to the caller from the `ManagedService` contracts balance.

## High-Level Invariants
- It must be possible to execute an arbitrary `call` via the `ManagedService` contract.
- Executors should be reimbursed for their gas fees when executing calls via the ManagedService contract.
- It should *not* be possible to execute a `delegatecall` via the `ManagedService` contract.

## Function Level Invariants

#### function exec(address _to, bytes calldata _data) public payable returns (bytes memory)
Should execute a low-level call to the `_to` address with `_data`, and refund the caller for the cost of the transaction.

- Must revert if the caller does not have the `RELAYER_ROLE` role.
- Must revert if the underlying call reverts.
- Must revert if the balance of the `ManagedService` contract is not sufficient to refund the caller for their gas cost.
- A successful call:
  - A call is made to the target address with the requested data.
  - The cost of the transaction is refunded to the caller.
  - Emit a `Called` event in the `ManagedService` contract.
  - The return value of the underlying call is returned encoded as raw bytes.

#### function withdrawTo(uint256 _amount, address _recipient) public
Should send `_amount` from the `ManagedService` contract and to the `_recipient` address.

- Must revert if the caller does not have either the `RELAYER_ROLE` or the `DEFAULT_ADMIN_ROLE`.
- Must revert if `_amount` is greater than the balance of the `ManagedService` contract.
- Must revert if the `_recipient` is the zero address.
- Must revert if the transfer fails for any reason.
- A successful call:
  - `_amount` in native tokens is transferred to the `_recipient` address.
  - Emit a `Withdew` event in the `ManagedService` contract.

#### function withdraw(uint256 _amount) external
Should send `_amount` to the caller. Invariants match the `withdrawTo` function.

## Assumptions
The `ManagedService` contract on the OpenZeppelin `AccessControl` contract. We test that the interactions with this contract work properly in the [unit tests for the `ManagedService`](TODO(end)). However, we don't thoroughly test the internals of this contract. Instead, we rely on the assumption that it is robust and secure.
