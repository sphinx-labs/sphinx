// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {IXReceiver} from "@connext/interfaces/core/IXReceiver.sol";
import { ILayerZeroReceiver } from "./interfaces/layerzero/ILayerZeroReceiver.sol";
import { CrossChainMessageInfo } from "./ChugSplashDataTypes.sol";

/**
 * @title OrganizationHub
 */
contract OrganizationHub is NonblockingLzApp {
    address public immutable initiator;

    mapping(bytes32 => TODO) public organizations;

    /**
     * @param _initiator Address of the OrganizationInitiator contract.
     */
    constructor(address _initiator) {
        initiator = _initiator;
    }

    // we know: it's LZ, and the srcDomainID

    // mapping[Enum.LayerZero][srcDomainID] = destEndpoint

    function lzReceive(uint16 _srcChainId, bytes memory _srcAddress, uint64 _nonce, bytes memory _payload) override external {
        require(msg.sender == address(destEndpoint));
        require(keccak256(_srcAddress) == keccak256(initiator));
        // TODO: require orgID isn't taken
        address originSender;
        assembly {
            originSender := mload(add(_srcAddress, 20))
        }
        bytes32 orgID = abi.decode(_payload, (bytes32));
        _claim(orgID, originSender);
    }

    // TODO: later: use a fallback function instead of hard-coding each interface. or maybe not a
    // fallback function. but we need to do something. this is necessary to let us add other cross
    // chain message providers in the future.

// TODO: later: some troller will probably claim all of the popular org names (uniswap, optimism, etc). how should we handle this?

    function _claim(bytes32 _orgID, address _originSender) internal {

    }
}
