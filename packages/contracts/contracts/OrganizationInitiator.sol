// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { IXReceiver } from "@connext/interfaces/core/IXReceiver.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ICrossChainAdapter } from "./interfaces/ICrossChainAdapter.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { Version } from "./Semver.sol";
import { RegistrationInfo, CrossChainMessageInfo } from "./ChugSplashDataTypes.sol";

/**
 * @title OrganizationInitiator
 */
contract OrganizationInitiator is Ownable {
    event ClaimInitiated(
        bytes32 indexed orgID,
        address indexed claimer,
        address indexed localEndpoint
    );

    event ClaimFinalized(bytes32 indexed orgID, address indexed claimer);

    event RegistrationInitiated(
        bytes32 indexed orgID,
        address indexed localEndpoint,
        uint32 indexed remoteDomainID,
        address owner,
        address caller
    );

    event CrossChainAdapterChanged(
        address indexed localEndpoint,
        uint32 indexed remoteDomainID,
        address crossChainAdapter
    );

    ChugSplashRegistry public immutable registry;

    mapping(bytes32 => address) public initiatedClaim;

    mapping(bytes32 => address) public claimers;

    // local endpoint => remote Domain ID => crossChainAdapter
    mapping(address => mapping(uint256 => address)) public crossChainAdapters;

    /**
     * @param _owner Address of the owner of the registry.
     */
    constructor(address _owner, ChugSplashRegistry _registry) {
        registry = _registry;
        _transferOwnership(_owner);
    }

    function initiateClaim(
        bytes32 _orgID,
        address _claimer,
        CrossChainMessageInfo memory _message
    ) external {
        require(initiatedClaim[_orgID] == address(0), "OrganizationInitiator: already initiated");
        require(_claimer != address(0), "OrganizationInitiator: invalid claimer");

        address adapter = crossChainAdapters[_message.localEndpoint][_message.remoteDomainID];
        require(adapter != address(0), "OrganizationInitiator: invalid adapter");

        initiatedClaim[_orgID] = _claimer;

        emit ClaimInitiated(_orgID, _claimer, _message.localEndpoint);

        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(ICrossChainAdapter.initiateCall, (_message, abi.encodePacked(_orgID)))
        );
        require(success, "OrganizationInitiator: failed to initiate registration");
    }

    // function lzReceive(uint16 _srcChainId, bytes memory _srcAddress, uint64, bytes memory _payload) override external {
    //     bytes32 orgID = abi.decode(_payload, (bytes32));
    //     address remoteEndpoint = _endpoints[CrossChainService.LayerZero][_srcChainId];
    //     require(msg.sender == address(remoteEndpoint));
    //     require(keccak256(_srcAddress) == keccak256(abi.encodePacked(initiator)));

    //     address remoteSender;
    //     assembly {
    //         remoteSender := mload(add(_srcAddress, 20))
    //     }
    //     _finalizeClaim(orgID);
    // }

    function _finalizeClaim(bytes32 _orgID) internal {
        // TODO: use LZ interface

        // TODO: require call is from hub on the remote chain
        require(initiatedClaim[_orgID] != address(0), "OrganizationInitiator: must be initiated");

        address claimer = initiatedClaim[_orgID];
        claimers[_orgID] = claimer;

        emit ClaimFinalized(_orgID, claimer);
    }

    // function initiateCall(
    //     bytes32 _orgID,
    //     CrossChainMessageInfo[] memory _messages,
    //     RegistrationInfo[] memory _registrationInfo
    // ) external payable {
    //     require(
    //         msg.sender == orgIDOwners[_orgID] || approvedInitiators[_orgID][msg.sender],
    //         "OrganizationInitiator: caller not approved"
    //     );

    //     for (uint i = 0; i < _messages.length; i++) {
    //         CrossChainMessageInfo memory messageInfo = _messages[i];
    //         RegistrationInfo memory registration = _registrationInfo[i];
    //         Version memory version = registration.version;

    //         address managerImpl = registry.versions(version.major, version.minor, version.patch);
    //         require(
    //             registry.managerImplementations(managerImpl),
    //             "OrganizationInitiator: invalid manager version"
    //         );

    //         address crossChainAdapter = crossChainAdapters[messageInfo.localEndpoint][
    //             messageInfo.remoteDomainID
    //         ];
    //         require(
    //             crossChainAdapter != address(0),
    //             "OrganizationInitiator: invalid crossChain adapter"
    //         );

    //         (bool success, ) = crossChainAdapter.delegatecall(
    //             abi.encodeCall(
    //                 ICrossChainAdapter.initiateCall,
    //                 (_orgID, registration, messageInfo)
    //             )
    //         );
    //         require(success, "OrganizationInitiator: failed to initiate registration");

    //         emit RegistrationInitiated(
    //             _orgID,
    //             messageInfo.localEndpoint,
    //             messageInfo.remoteDomainID,
    //             registration.owner,
    //             msg.sender
    //         );
    //     }
    // }

    function setCrossChainAdapter(
        address _localEndpoint,
        uint32 _remoteDomainID,
        address _crossChainAdapter
    ) external onlyOwner {
        crossChainAdapters[_localEndpoint][_remoteDomainID] = _crossChainAdapter;
        emit CrossChainAdapterChanged(_localEndpoint, _remoteDomainID, _crossChainAdapter);
    }
}
