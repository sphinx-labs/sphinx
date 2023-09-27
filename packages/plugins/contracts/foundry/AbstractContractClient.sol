// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import "forge-std/console.sol"; // TODO: rm

import { Sphinx } from "@sphinx-labs/plugins/Sphinx.sol";
import { SphinxAction } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { SphinxActionType } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import { VmSafe } from "forge-std/Vm.sol";

abstract contract AbstractContractClient {

    address internal immutable sphinxInternalManager;
    Sphinx internal immutable sphinxInternalSphinxLib;
    address internal immutable sphinxInternalImpl;

    constructor(address _sphinxManager, address _sphinx, address _impl) {
        sphinxInternalManager = _sphinxManager;
        sphinxInternalSphinxLib = Sphinx(_sphinx);
        sphinxInternalImpl = _impl;
    }

    fallback() external virtual;

    modifier delegateIfNotManager() {
        if (msg.sender != sphinxInternalManager) {
            _delegate(sphinxInternalImpl);
        }

        _;
    }

    // Calls a function on the users contract from the client contract.
    function _callFunction(bytes4 selector, bytes memory functionArgs, string memory fullyQualifiedName) internal {
        if (msg.sender != sphinxInternalManager) {
            _delegate(sphinxInternalImpl);
        }

        bytes memory encodedCall = abi.encodePacked(selector, functionArgs);
        bytes32 callHash = keccak256(abi.encode(address(this), encodedCall));

        uint256 currentNonceInManager = sphinxInternalManager.code.length > 0 ? ISphinxManager(sphinxInternalManager).callNonces(callHash) : 0;
        uint256 currentNonceInDeployment = sphinxInternalSphinxLib.getCallCountInDeployment(callHash);

        // TODO(docs): we can't make the reference name a state variable in this contract because we
        // can't have any mutable variables since this is a proxy for the user's function, and we
        // may overwrite the user's variable in the storage layout. perhaps we should put that
        // above the contract definition for this contract.
        string memory referenceName = sphinxInternalSphinxLib.getReferenceNameForAddress(address(this));

        bool skip = currentNonceInManager > currentNonceInDeployment;
        bool isBroadcast = sphinxInternalSphinxLib.initialCallerMode() == VmSafe.CallerMode.RecurrentBroadcast;
        if (!skip && !isBroadcast) {
            (bool sphinxCallSuccess, bytes memory sphinxReturnData) = sphinxInternalImpl.delegatecall(
                encodedCall
            );
            if (!sphinxCallSuccess) {
                if (sphinxReturnData.length == 0) revert();
                assembly {
                    revert(add(32, sphinxReturnData), mload(sphinxReturnData))
                }
            }
        }

        bytes memory actionData = abi.encode(address(this), selector, functionArgs, currentNonceInDeployment, referenceName);
        sphinxInternalSphinxLib.addSphinxAction(SphinxAction({
            fullyQualifiedName: fullyQualifiedName,
            actionType: SphinxActionType.CALL,
            data: actionData,
            skip: skip
        }));
    }

    // TODO(docs): copied and pasted from OpenZeppelin. not using their Proxy.sol b/c it adds
    // unnecessary complexity to the client contracts. (e.g. we'd be forced to override a receive function).
    function _delegate(address implementation) internal virtual {
        assembly {
            // Copy msg.data. We take full control of memory in this inline assembly
            // block because it will not return to Solidity code. We overwrite the
            // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize())

            // Call the implementation.
            // out and outsize are 0 because we don't know the size yet.
            let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)

            // Copy the returned data.
            returndatacopy(0, 0, returndatasize())

            switch result
            // delegatecall returns 0 on error.
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }
}
