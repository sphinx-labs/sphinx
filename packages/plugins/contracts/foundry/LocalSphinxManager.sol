// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { CREATE3 } from "sphinx-solmate/utils/CREATE3.sol";

/**
 * @title LocalSphinxManager
 * @notice This contract is used as a substitute for an actual SphinxManager when collecting actions
 *         in `Sphinx.sol`. We substite the SphinxManager as a performance optimization. Using
 *         the actual SphinxManager would require us to run the full execution flow anytime the
 *         user runs a test that calls `Sphinx.deploy`. This would slow down tests by ~20-30
 *         seconds, which is unacceptable. Instead, we use this contract to collect the actions,
 *         then run the full execution flow if the user is broadcasting or proposing a deployment.
 */
contract LocalSphinxManager {

    // TODO: replace this contract with the SphinxDefaultCreate3 contract

    function deploy(
        bytes32 _salt,
        bytes memory _creationCode,
        uint256 _value
    ) public returns (address deployed) {
        return CREATE3.deploy(_salt, _creationCode, _value);
    }
}
