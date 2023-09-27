// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.15;

// import { Deploy } from "@sphinx-labs/plugins/Deploy.sol";

// // Foundry throws an error when running `forge script` on `Deploy.sol` in the plugins package.
// // Specifically, it throws a "Couldn't strip project root from contract path " error.
// // This is likely because it's confused by the remappings that are implicit
// // in the monorepo. To work around this, we create this `DeployDemo` contract that inherits from
// // the contract we want to use, and then use `DeployDemo` in our script. We override the
// // default behavior by using the `SPHINX_INTERNAL_OVERRIDE_DEPLOY_SCRIPT` env var to 'true'
// // when running the tests in this repo.
// contract DeployDemo is Deploy {}
