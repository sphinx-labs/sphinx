// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {IXReceiver} from "@connext/interfaces/core/IXReceiver.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ILayerZeroReceiver } from "./interfaces/layerzero/ILayerZeroReceiver.sol";
import { CrossChainMessageInfo } from "./ChugSplashDataTypes.sol";
import { OrganizationInitiator } from "./OrganizationInitiator.sol";
import { ICrossChainAdapter} from "./interfaces/ICrossChainAdapter.sol";

/**
 * @title OrganizationHub
 */
contract OrganizationHub is ILayerZeroReceiver, Ownable {
    OrganizationInitiator public immutable initiator;

    enum CrossChainService {
        LayerZero
    }

    // TODO: later: consider mapping this to something else
    mapping(bytes32 => bool) public organizations;

    // TODO: origin/src -> local
    // TODO: dest -> remote

    struct Thing {
        mapping(address => address) origins; // originDomainID => localEndpoint
        uint32 localEndpoint;
    }

    mapping(CrossChainService => Thing) internal _endpoints;

    /**
     * @param _initiator Address of the OrganizationInitiator contract.
     */
    constructor(address _initiator, address _owner) {
        initiator = _initiator;
        _transferOwnership(_owner);
    }

    function lzReceive(uint16 _remoteDomainID, bytes memory _remoteSender, uint64, bytes memory _payload) override external {
        bytes32 orgID = abi.decode(_payload, (bytes32));
        address remoteSender;
        assembly {
            remoteSender := mload(add(_remoteSender, 20))
        }
        // TODO: thing
        Thing thing = _endpoints[CrossChainService.LayerZero];

        _claim(orgID, remoteSender, thing.localEndpoint);

        address localEndpoint = thing.origins[_remoteDomainID];
TODO: you have this backwards! i.e. crossChainAdapters is backwards
        address adapter = initiator.crossChainAdapters([localEndpoint][_message.localDomainID]);
        require(adapter != address(0), "OrganizationInitiator: invalid adapter");

        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(ICrossChainAdapter.initiateCall, (_message, abi.encodePacked(_orgID)))
        );
        require(success, "OrganizationInitiator: failed to initiate registration");
    }

    // TODO: later: use a fallback function instead of hard-coding each interface. or maybe not a
    // fallback function. but we need to do something. this is necessary to let us add other cross
    // chain message providers in the future. you also need to do this for the OrganizationInitiator

// TODO: later: some troller will probably claim all of the popular org names (uniswap, optimism, etc). how should we handle this?

    function _claim(bytes32 _orgID, address _originSender, address _localEndpoint) internal {
        require(msg.sender == address(_localEndpoint), "OrganizationHub: invalid msg.sender");
        require(_originSender == initiator, "OrganizationHub: invalid origin sender");
        require(!organizations[_orgID], "OrganizationHub: already claimed");
        organizations[_orgID] = true;
        // TODO: later: emit event
    }
}
