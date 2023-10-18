// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Sphinx } from "@sphinx-labs/plugins/Sphinx.sol";
import {
    SphinxActionInput,
    SphinxMode,
    DeploymentInfo
} from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { SphinxActionType } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import { SphinxUtils } from "./SphinxUtils.sol";
import { LocalSphinxManager } from "./LocalSphinxManager.sol";
import { VmSafe } from "sphinx-forge-std/Vm.sol";

/**
 * @title AbstractContractClient
 *
 * @notice Abstract contract that all client contracts should inherit from.
 *         This contract is responsible for delegating calls to the user's contract.
 *         It also handles the logic for adding Sphinx actions to the Sphinx contract.
 *
 * @dev Since the Sphinx Clients are used in a proxy pattern, this contract and any contract
 *      that inherits from it *cannot* have any mutable state variables because they will interfere
 *      with the proxy pattern. This means that any state variables needed by the client must either
 *      be immutable variables, or the need to be stored in the Sphinx library contract.
 */
abstract contract AbstractContractClient {
    Sphinx private immutable sphinxLib;

    address internal immutable sphinxInternalManager;
    address internal immutable sphinxInternalImpl;

    constructor(address _sphinxManager, address _sphinx, address _impl) {
        sphinxInternalManager = _sphinxManager;
        sphinxLib = Sphinx(_sphinx);
        sphinxInternalImpl = _impl;
    }

    fallback() external virtual;

    /**
     * @notice Modifier that delegates to the user's contract if the caller is not the manager.
     *         This can happen if the user interacts with the client outside of the standard Sphinx deploy function.
     *         We use this modifier on all functions on the generated client contracts.
     */
    modifier delegateIfNotManager() {
        if (msg.sender != sphinxInternalManager) {
            _delegate(sphinxInternalImpl);
        }

        _;
    }

    /**
     * @notice Calls a function on the user contract from the client contract.
     *
     * @param selector The selector for the target function.
     * @param functionArgs The abi encoded arguments for the function call.
     */
    function _callFunction(
        bytes4 selector,
        bytes memory functionArgs,
        string memory fullyQualifiedName
    ) internal {
        require(
            Sphinx(sphinxLib).sphinxModifierEnabled(),
            "Sphinx: You must include the 'sphinx(Network)' modifier in your deploy function."
        );

        bytes memory encodedCall = abi.encodePacked(selector, functionArgs);
        bytes32 callHash = keccak256(abi.encode(address(this), encodedCall));

        uint256 currentNonceInManager = sphinxInternalManager.code.length > 0
            ? ISphinxManager(sphinxInternalManager).callNonces(callHash)
            : 0;
        uint256 currentNonceInDeployment = sphinxLib.sphinxGetCallCountInDeployment(
            callHash
        );

        string memory referenceName = sphinxLib.sphinxGetReferenceNameForAddress(
            address(this),
            sphinxInternalManager
        );

        bool skip = currentNonceInManager != currentNonceInDeployment;
        if (!skip) {
            (bool sphinxCallSuccess, bytes memory sphinxReturnData) = sphinxInternalImpl
                .delegatecall(encodedCall);
            if (!sphinxCallSuccess) {
                if (sphinxReturnData.length == 0) revert();
                assembly {
                    revert(add(32, sphinxReturnData), mload(sphinxReturnData))
                }
            }
            // We update the `callNonces` mapping in the SphinxManager after each successful call
            // because this mimics what happens on a live network.
            LocalSphinxManager(address(sphinxInternalManager)).incrementCallNonce(callHash);
        }

        bytes memory actionData = abi.encode(
            address(this),
            selector,
            functionArgs,
            currentNonceInDeployment,
            referenceName
        );
        sphinxLib.sphinxAddActionInput(
            SphinxActionInput({
                fullyQualifiedName: fullyQualifiedName,
                actionType: SphinxActionType.CALL,
                data: actionData,
                skip: skip
            })
        );
    }

    // Pulled from the OpenZeppelin Proxy contract.
    // Source: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/Proxy.sol
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
