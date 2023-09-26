// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import "forge-std/console.sol"; // TODO: rm

import { Sphinx } from "@sphinx-labs/plugins/Sphinx.sol";
import { SphinxAction } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { SphinxActionType } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";

abstract contract AbstractContractClient {

    address internal immutable sphinxManager;
    Sphinx internal immutable sphinx;
    address internal immutable impl;

    constructor(address _sphinxManager, address _sphinx, address _impl) {
        sphinxManager = _sphinxManager;
        sphinx = Sphinx(_sphinx);
        impl = _impl;
    }

    fallback() external virtual;

    modifier delegateIfNotManager() {
        if (msg.sender != sphinxManager) {
            _delegate(impl);
        }

        _;
    }

    // Calls a function on the users contract from the client contract.
    function _callFunction(bytes4 selector, bytes memory functionArgs) internal {
        if (msg.sender != sphinxManager) {
            _delegate(impl);
        }

        bytes memory encodedCall = abi.encodePacked(selector, functionArgs);
        bytes32 callHash = keccak256(abi.encode(address(this), encodedCall));

        uint256 currentNonceInManager = sphinxManager.code.length > 0 ? ISphinxManager(sphinxManager).callNonces(callHash) : 0;
        uint256 currentNonceInDeployment = sphinx.getCallCountInDeployment(callHash);

        // TODO(docs): we can't make the reference name a state variable in this contract because we
        // can't have any mutable variables since this is a proxy for the user's function, and we
        // may overwrite the user's variable in the storage layout. perhaps we should put that
        // above the contract definition for this contract.
        string memory referenceName = sphinx.getReferenceNameForAddress(address(this));

        bool skip = currentNonceInManager > currentNonceInDeployment;
        if (!skip && !sphinx.isBroadcast()) {
            (bool sphinxCallSuccess, bytes memory sphinxReturnData) = impl.delegatecall(
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
        sphinx.addSphinxAction(SphinxAction({
            fullyQualifiedName: "contracts/test/MyContracts.sol:MyContract1", // TODO: replace
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
