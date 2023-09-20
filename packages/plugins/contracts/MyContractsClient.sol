// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { SphinxActionType } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { Proxy } from "@openzeppelin/contracts/proxy/Proxy.sol";
import { SphinxAction } from "./foundry/SphinxPluginTypes.sol";
import { Sphinx } from "./foundry/Sphinx.sol";
import { AbstractSphinxClient } from "./AbstractSphinxClient.sol";
import { Vm } from "forge-std/Vm.sol"; // TODO: rm
import { SphinxActions } from "./SphinxActions.sol";

import "forge-std/console.sol";

contract MyContract1Client is AbstractSphinxClient {

    // TODO: rm
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    SphinxActions private constant actions = SphinxActions(address(uint160(uint256(keccak256('sphinx.actions')) - 1)));

    address private immutable sphinxManager;
    Sphinx private immutable sphinx;
    address private immutable impl;

    constructor(address _sphinxManager, address _sphinx, address _impl) {
        sphinxManager = _sphinxManager;
        sphinx = Sphinx(_sphinx);
        impl = _impl;
    }

    function incrementUint() external {
        if (msg.sender != sphinxManager) {
            _delegate(impl);
        }

        bytes memory functionArgs = abi.encode();

        bytes memory encodedCall = abi.encodePacked(MyContract1Client.incrementUint.selector, functionArgs);
        bytes32 callHash = keccak256(abi.encode(address(this), encodedCall));
        uint256 currentNonceInManager = sphinxManager.code.length > 0 ? ISphinxManager(sphinxManager).callNonces(callHash) : 0;
        uint256 currentNonceInDeployment = sphinx.callCount(callHash);

        (bool sphinxCallSuccess, bytes memory sphinxReturnData) = impl.delegatecall(
            // FYI, any function args will need to go here: vv  e.g. (2, 3, 4)
            abi.encodeCall(MyContract1Client.incrementUint, ())
        );
        if (!sphinxCallSuccess) {
            if (sphinxReturnData.length == 0) revert();
            assembly {
                revert(add(32, sphinxReturnData), mload(sphinxReturnData))
            }
        }

        // TODO(docs): we can't make the reference name a state variable in this contract because we
        // can't have any mutable variables since this is a proxy for the user's function, and we
        // may overwrite the user's variable in the storage layout.
        string memory referenceName = sphinx.getReferenceName(address(this));
        bytes memory actionData = abi.encode(address(this), MyContract1Client.incrementUint.selector, functionArgs, currentNonceInDeployment, referenceName);
        bool skip = currentNonceInManager > currentNonceInDeployment;
        actions.addSphinxAction(SphinxAction({
            fullyQualifiedName: "MyContracts.sol:MyContract1",
            actionType: SphinxActionType.CALL,
            data: actionData,
            skip: skip,
        }));

        sphinx.incrementCallCount(callHash);
    }

    // TODO(ryan): I think we need to implement a fallback function in every client contract, even
    // if the user's contract doesn't implement one. We need this in case the user calls a view
    // function on this contract from within a different contract's constructor or function call.
    // Without this fallback, those calls would error.
    // This is what the fallback function should look like if the user's contract doesn't implement
    // its own fallback function. If the user's contract does implement its own fallback function,
    // I think we should implement this the same way as any other external function call.
    fallback() external override {
        require(msg.sender != sphinxManager, "User attempted to call a non-existent function.");
        _delegate(impl);
    }
}

