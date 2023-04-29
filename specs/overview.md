# Overview

**Table of Contents**

This document is a high-level technical overview of ChugSplash. It aims to explain how the protocol works in an informal manner, and direct readers to other parts of the specification so that they may learn more.

This document assumes you've read the [design goals](TODO).

## Architecture Design Goals

* Full support of all Solidity [state variable types](https://docs.soliditylang.org/en/latest/types.html).
*


## Off-Chain Components

*

## On-Chain Components

* **ChugSplashRegistry**: The root contract for the ChugSplash deployment system.
  * Allows callers to register new projects.
  * Every event emitted on-chain in the ChugSplash system is announced through this contract. This makes it easy for clients to find and index events that occur throughout the deployment process.
  * Includes . This owner is the multisig controlled by the ChugSplash team.
  *

* **Adapters**:

