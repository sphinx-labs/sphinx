# `SphinxEscrow` Contract Specification

When deploying via the Sphinx DevOps Platform, the user has the option to pay for their deployments using ERC20 tokens on a single network. Before the deployment begins, the user must grant an allowance on an ERC20 token to the `SphinxEscrow` contract that is sufficient to cover the estimated cost of the deployment. The ERC20 token is then locked in the `SphinxEscrow` contract while the deployment is being executed. After the deployment is completed, the Sphinx backend calculates the exact cost of the deployment and transfers the remainder back to the user.

The Sphinx team owns the `SphinxEscrow` contract.

## Table of Contents

- [Relevant files](#relevant-files)
- [Use Case](#use-case)
- [High-Level Invariants](#high-level-invariants)
- [Function-Level Invariants](#function-level-invariants)
- [Assumptions](#assumptions)

## Relevant Files

- The contract: [`SphinxEscrow.sol`](todo)
- Unit tests: [`SphinxEscrow.t.sol`](todo)

## Use Case

### Allow Sphinx to accept crypto payments for the variable cost of deployments
For Sphinx to accept crypto payments we must be able to guarantee that we will be paid for the cost of the deployment. Since the exact cost of a deployment cannot be exactly known ahead of time, we cannot charge for the deployment upfront. So instead, we estimate the cost of a deployment and require that the user transfer the estimated amount to an escrow contract while the deployment is being executed. After the deployment is completed, we calculate the exact cost and transfer the remaining funds back to the user.

## High-Level Invariants
- It must be possible to use the `SphinxEscrow` contract with any arbitrary ERC20 contract.
- It must be possible to use the `SphinxEscrow` contract to transfer ERC20 tokens from an `owner` address to the `SphinxEscrow` contract if the `SphinxEscrow` contract has been granted an allowance.
- It must *not* be possible to transfer ERC20 tokens from an `owner` address to any address other than the `SphinxEscrow` contract if the `SphinxEscrow` contract has been granted an allowance.
- It must *only* be possible to transfer ERC20 tokens out of the `SphinxEscrow` contract to the original ERC20 `owner` address or an address with the `DEFAULT_ADMIN_ROLE` on the `SphinxEscrow` contract.

## Function-Level Invariants

#### `constructor(address _owner)`
- Must grant the `DEFAULT_ADMIN_ROLE` to the specified owner address.
- Must revert if the `_owner` address is `address(0)`.

#### `function claim(address _owner, address _erc20, uint256 _amount)`
- Must revert if `_amount` is greater than the allowance of the `SphinxEscrow` contract on `_erc20` for `_owner`.
- Must revert if the `_owner` does not have a balance of `_erc20` that is >= `_amount`.
- A successful call must:
  - Transfer the `_amount` of `_erc20` to the `SphinxEscrow` contract.
  - Increment the `escrowBalance` of `_erc20` for `_owner` by `_amount`.
  - Emit a `Claimed` event in the `SphinxEscrow` contract.

#### `function disburse(address _owner, address _feeRecipient, address _erc20, uint256 _refund, uint256 _cost)`
- Must revert if the amount of `_erc20` currently in escrow for `_owner` is < `_refund` + `_cost`
- Must revert if `_feeRecipient` does not have the `DEFAULT_ADMIN_ROLE`
- A successful call must:
  - Transfer the `_refund` of `_erc20` from `SphinxEscrow` to `_owner`.
  - Transfer the `_cost` of `_erc20` from `SphinxEscrow` to `_feeRecipient`.
  - Decrement the `escrowBalance` of `_erc20` for `_owner` by `_refund` + `_cost`.
  - Emit a `Disbursed` event in the `SphinxEscrow` contract.

## Assumptions

### ERC20 Compatibility
The `SphinxEscrow` contract is designed to work with any ERC20-compatible contract. We intentionally do not perform any validation on the `_erc20` addresses supplied to this contract. We assume that off-chain logic will be used to ensure that this contract is only used with compatible ERC20 contracts.

### Dependencies
The `SphinxEscrow` contract relies on the OpenZeppelin `AccessControl` contract to manage access and the `ReentrancyGuard` contract to protect against reentrancy attacks. We test that the interactions with these contracts work correctly in the [unit tests for `SphinxEscrow`](todo), but we don't thoroughly test these contracts. Instead, we assume that they are secure and have been thoroughly tested by their authors.
