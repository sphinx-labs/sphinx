# Sphinx specs

This directory contains the specs for Sphinx, a DevOps platform for smart contract deployments on EVM-compatible networks.

## Design Goals

Our aim is to design a system that is:
* **Secure**: Due to the mission-critical nature of smart contract deployments, Sphinx should be designed with security as its first and foremost priority.
* **Declarative**: Users should be able to define their deployments declaratively in a single configuration file. This means users define the end state of their contracts, including state variables, then Sphinx executes a series of transactions to get their system to its end state. This is in contrast to deployment scripts, where users specify a series of individual transactions to get their system to its end state.
* **Deterministic**: Sphinx's deterministic deployment process must ensure that the same configuration file applied to the same contracts always results in the same end state. This means that developers can be confident that their contracts will be deployed in a consistent and predictable manner, without any unexpected behavior or outcomes.
* **Lightweight**: Users should be able to approve a deployment by submitting a single tiny transaction on-chain from their multisig or governance. Once this occurs, the deployment should be executed by a remote party in a quick and trustless manner. If users prefer to execute their deployments themselves, they should have the option to do so.
* **Portable**: Sphinx should be able to deploy projects predictably and repeatably across networks. Contracts deployed with Sphinx should have consistent addresses across networks.

## Specification Contents

