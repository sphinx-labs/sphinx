# Introduction

Sphinx is a protocol that aims to make the smart contract deployment process more secure, transparent, and efficient.

## Goals

* **Secure**: Deployments must be executed exactly as the owners intended. This is crucial because of the mission-critical nature of smart contract deployments, where subtle changes in a deployment can cause significant issues after a system has been deployed.
* **Transparent**: Sphinx offers greater transparency by providing a verifiable hash of each deployment. Users and other stakeholders can verify the transactions in a deployment before it's executed.
* **Efficient**: Developers can approve arbitrarily large deployments across an arbitrary number of chains by signing a single meta transaction. Once a deployment is approved, it can be executed trustlessly by a third party. Developers don't need native gas tokens on any chain to fund their deployments.

## Architecture Overview

We wanted teams to be able to approve deployments from their multisignature wallet, so we built our protocol on top of Gnosis Safe. We chose Gnosis Safe because it's a battle-tested smart contract wallet that many teams use to manage their protocols.

Our primary on-chain component is a [Gnosis Safe Module](https://docs.safe.global/safe-smart-account/modules). The executor of the deployment submits transactions on the module, which verifies that the transactions have been approved by the Gnosis Safe owners, then submits the transactions on the Gnosis Safe. We decided to build a module because this allows teams to use Sphinx without transferring ownership of their smart contracts away from their Gnosis Safe.

To facilitate this trustless execution process, Sphinx uses a custom mechanism to verify the signatures of the Gnosis Safe owners. When a team approves a deployment, they sign the deployment's unique identifier using a meta transaction. This unique identifier is the root of a [Merkle tree](https://en.wikipedia.org/wiki/Merkle_tree). The Merkle tree's leaves contain all of the transaction data for the deployment, across every chain where it will be executed. We use a Merkle tree because it provides an efficient and secure way to trustlessly execute large deployments across many chains. See the [Sphinx Merkle tree specification](https://github.com/sphinx-labs/sphinx/blob/develop/specs/merkle-tree.md) to learn more about the architecture and content of the Sphinx Merkle tree.

Each leaf in the Merkle tree is a single action on a single chain. Sphinx's module verifies that each leaf submitted by the executor corresponds to the Merkle root signed by the Gnosis Safe owners. It's impossible for the executor to submit anything that the Gnosis Safe owners have not explicitly approved.

## Supported Gnosis Safe Versions

Sphinx supports two versions of Gnosis Safe, which each have two types of Gnosis Safe contracts: one for L1 and one for L2. The full list is below:
- [Gnosis Safe v1.3.0-lib.0](https://github.com/safe-global/safe-contracts/tree/v1.3.0-libs.0):
  - [`GnosisSafe.sol`](https://github.com/safe-global/safe-contracts/blob/v1.3.0-libs.0/contracts/GnosisSafe.sol): L1 Gnosis Safe
  - [`GnosisSafeL2.sol`](https://github.com/safe-global/safe-contracts/blob/v1.3.0-libs.0/contracts/GnosisSafeL2.sol): L2 Gnosis Safe
- [Gnosis Safe v1.4.1-build.0](https://github.com/safe-global/safe-contracts/tree/v1.4.1-build.0):
  - [`Safe.sol`](https://github.com/safe-global/safe-contracts/blob/v1.4.1-build.0/contracts/Safe.sol): L1 Gnosis Safe
  - [`SafeL2.sol`](https://github.com/safe-global/safe-contracts/blob/v1.4.1-build.0/contracts/SafeL2.sol): L2 Gnosis Safe
