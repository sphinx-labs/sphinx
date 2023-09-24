// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "forge-std/console.sol";

import { MyContract1Client } from "./MyContractsClient.sol";
import { Sphinx } from "./foundry/Sphinx.sol";
import { SphinxConfig, DeployOptions, SphinxAuthBundle, SphinxActionType, SphinxAction } from "./foundry/SphinxPluginTypes.sol";
import { Vm } from "forge-std/Vm.sol";

abstract contract SphinxClient is Sphinx {

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

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
        string memory fullyQualifiedName = "contracts/test/MyContracts.sol:MyContract1";
        string memory artifactPath = "MyContracts.sol:MyContract1";
        string memory clientPath = "MyContractsClient.sol:MyContract1Client";

        bytes32 sphinxCreate3Salt = keccak256(abi.encode(_referenceName, _userSalt));
        requireAvailableReferenceName(_referenceName);

        address create3Address = computeCreate3Address(address(manager), sphinxCreate3Salt);

        bool skipDeployment = create3Address.code.length > 0;

        bytes memory actionData = abi.encode(vm.getCode(artifactPath), _constructorArgs, _userSalt, _referenceName);
        actions.addSphinxAction(SphinxAction({
            fullyQualifiedName: fullyQualifiedName,
            actionType: SphinxActionType.DEPLOY_CONTRACT,
            data: actionData,
            skip: skipDeployment
        }));

        // TODO: it appears we still run this even if we're skipping the deployment. that doesn't seem correct,
        // although I'd need to step through it to be sure.
        deployClientAndImpl(create3Address, _constructorArgs, artifactPath, _referenceName, clientPath);

        return MyContract1Client(create3Address);
    }
}
