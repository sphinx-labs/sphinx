// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

abstract contract AbstractSphinxClient {

    fallback() external virtual;

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
