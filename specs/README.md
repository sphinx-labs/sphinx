# ChugSplash specs

This directory contains the specs for ChugSplash, a tool that deterministically deploys and manages upgradeable smart contracts on EVM-compatible chains.

## Design Goals

Our aim is to design a system that is:
* **Secure**: Due to the mission-critical nature of smart contract deployments and upgrades, ChugSplash should be designed with security as its first and foremost priority.
* **Declarative**: Users should be able to define their deployments and upgrades declaratively in a single configuration file. This means users define the end state of their contracts, including state variables, then ChugSplash executes a series of transactions to get their system to its end state. This is in contrast to deployment scripts, where users  specify a series of individual transactions to get their system to its end state.
* **Deterministic**: ChugSplash's deterministic deployment process must ensure that the same configuration file applied to the same contracts always results in the same end state. This means that developers can be confident that their contracts will be deployed and upgraded in a consistent and predictable manner, without any unexpected behavior or outcomes.
* **Atomic**: ChugSplash ensures that upgrades are atomic, which means that all of the contracts in a configuration file are upgraded as a single unit. This ensures that the system is never in a partially initialized state during the upgrade process, which can lead to bugs or vulnerabilities.
* **Flexible**: ChugSplash should be able to support a variety of proxy types, including proxies that have already been deployed with another tool, such as OpenZeppelin's Upgrades plugin.
* **Lightweight**: Users should optionally be able to approve a deployment or upgrade by submitting a single tiny transaction on-chain from their multisig or governance. Once this occurs, the deployment or upgrade should be executed by a remote party in a quick and trustless manner. If users prefer to execute their deployments or upgrades themselves, they should have the option to do so.
* **Portable**: ChugSplash should be able to deploy projects predictably and repeatably across networks. Contracts deployed with ChugSplash should have consistent addresses across networks.

## Specification Contents

