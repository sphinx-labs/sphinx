// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

interface ISphinxAuthFactory {
    function auths(bytes32) external returns (address payable);

    /**
     * @notice Deploys a new SphinxAuthProxy and initializes it with the given `_authData`.
     *
     * @param _authData Encoded data used to initialize the SphinxAuth contract.
     */
    function deploy(bytes memory _authData, bytes memory _registryData, string memory _projectName) external;
}