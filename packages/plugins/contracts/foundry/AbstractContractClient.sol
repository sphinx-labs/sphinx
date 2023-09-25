// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { Sphinx } from "@sphinx-labs/plugins/Sphinx.sol";
import { SphinxAction } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { SphinxActions } from "../SphinxActions.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { SphinxActionType } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";

abstract contract AbstractContractClient {

    SphinxActions private constant actions = SphinxActions(address(uint160(uint256(keccak256('sphinx.actions')) - 1)));

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
        uint256 currentNonceInDeployment = sphinx.callCount(callHash);

        // TODO(docs): we can't make the reference name a state variable in this contract because we
        // can't have any mutable variables since this is a proxy for the user's function, and we
        // may overwrite the user's variable in the storage layout.
        string memory referenceName = sphinx.referenceNamesByAddress(address(this));

        bytes memory actionData = abi.encode(address(this), selector, functionArgs, currentNonceInDeployment, referenceName);
        bool skip = currentNonceInManager > currentNonceInDeployment;
        if (!skip && sphinx.execute()) {
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

        actions.addSphinxAction(SphinxAction({
            fullyQualifiedName: "contracts/test/MyContracts.sol:MyContract1",
            actionType: SphinxActionType.CALL,
            data: actionData,
            skip: skip
        }));

        sphinx.incrementCallCount(callHash);
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
