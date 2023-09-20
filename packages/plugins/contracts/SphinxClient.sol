// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "forge-std/console.sol";

import { MyContract1Client } from "./MyContractsClient.sol";
import { Sphinx } from "./foundry/Sphinx.sol";
import { SphinxConfig, DeployOptions } from "./foundry/SphinxPluginTypes.sol";

abstract contract SphinxClient is Sphinx {

    constructor(SphinxConfig memory _sphinxConfig) Sphinx(_sphinxConfig) {}

    function deployMyContract1(
        int _intArg,
        uint _uintArg,
        address _addressArg,
        address _otherAddressArg
    ) internal returns (MyContract1Client) {
        bytes memory constructorArgs = abi.encode(_intArg, _uintArg, _addressArg, _otherAddressArg);
        return _deployMyContract1("MyContract1", bytes32(0), constructorArgs);
    }

    function deployMyContract1(
        int _intArg,
        uint _uintArg,
        address _addressArg,
        address _otherAddressArg,
        DeployOptions memory _sphinxOptions
    ) internal returns (MyContract1Client) {
        bytes memory constructorArgs = abi.encode(_intArg, _uintArg, _addressArg, _otherAddressArg);
        return _deployMyContract1(_sphinxOptions.referenceName, _sphinxOptions.salt, constructorArgs);
    }

    function _deployMyContract1(string memory _referenceName, bytes32 _userSalt, bytes memory _constructorArgs) private returns (MyContract1Client) {
        string memory fullyQualifiedName = "MyContracts.sol:MyContract1";
        string memory clientPath = "MyContractsClient.sol:MyContract1Client";

        bytes32 sphinxCreate3Salt = keccak256(abi.encode(_referenceName, _userSalt));
        requireAvailableReferenceName(_referenceName);

        address create3Address = computeCreate3Address(sphinxManager, sphinxCreate3Salt);

        bool skipDeployment = create3Address.code.length > 0;
        addDeploymentAction(
            fullyQualifiedName,
            _constructorArgs,
            sphinxCreate3Salt,
            _userSalt,
            _referenceName,
            skipDeployment
        );

        deployClientAndImpl(create3Address, _referenceName, clientPath);

        return MyContract1Client(create3Address);
    }
}
