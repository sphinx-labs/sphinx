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

    /**
     * @dev Storage layout gap. Since this contract is used as a substitute for the actual SphinxManager
     *      when collecting transactions, we need the storage layout position of the `callNonces`
     *      mapping to be the same as the SphinxManager. This ensures that if a SphinxManager was
     *      already deployed at a particular address, we can still access the `callNonces` mapping
     *      so we know which `CALL` actions to skip.
     */
    uint256[154] private __gap;

    /**
     * @notice Mapping of call hashes to nonces. Same as the `callNonces` mapping in the
     *         SphinxManager.
     */
    mapping(bytes32 => uint256) public callNonces;

    function incrementCallNonce(bytes32 _callHash) external {
        callNonces[_callHash] += 1;
    }

    function deploy(
        bytes32 _salt,
        bytes memory _creationCode,
        uint256 _value
    ) public returns (address deployed) {
        return CREATE3.deploy(_salt, _creationCode, _value);
    }
}
