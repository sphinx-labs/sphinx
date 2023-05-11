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
        LOCAL,
        LAYER_ZERO
    }

    // TODO: later: consider mapping this to something else
    mapping(bytes32 => bool) public organizations;

    mapping(CrossChainService => address) public localEndpoints;

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

        address localEndpoint = localEndpoints[CrossChainService.LAYER_ZERO];

        _claim(orgID, remoteSender, localEndpoint);

        address adapter = initiator.crossChainAdapters(localEndpoint, _remoteDomainID);
        require(adapter != address(0), "OrganizationHub: invalid adapter");

        CrossChainMessageInfo memory messageInfo = CrossChainMessageInfo({
                localEndpoint: localEndpoint,
                remoteDomainID: _remoteDomainID,
                relayerFee: TODO
            });

        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(ICrossChainAdapter.initiateCall, (messageInfo, _payload))
        );
        require(success, "OrganizationHub: failed to initiate registration");
    }

    function setLocalEndpoint(CrossChainService _service, address _localEndpoint) external onlyOwner {
        localEndpoints[_service] = _localEndpoint;
    }

    // TODO: later: use a fallback function instead of hard-coding each interface. or maybe not a
    // fallback function. but we need to do something. this is necessary to let us add other cross
    // chain message providers in the future. you also need to do this for the OrganizationInitiator

// TODO: later: some troller will probably claim all of the popular org names (uniswap, optimism, etc). how should we handle this?

    function _claim(bytes32 _orgID, address _remoteSender, address _localEndpoint) internal {
        require(msg.sender == address(_localEndpoint), "OrganizationHub: invalid msg.sender");
        require(_remoteSender == initiator, "OrganizationHub: invalid remote sender");

        require(!organizations[_orgID], "OrganizationHub: already claimed");

        organizations[_orgID] = true;
        // TODO: later: emit event
    }
}
