// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ICrossChainAdapter } from "./interfaces/ICrossChainAdapter.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { Version } from "./Semver.sol";
import { RegistrationInfo, CrossChainMessageInfo } from "./ChugSplashDataTypes.sol";

/**
 * @title ChugSplashClaimer
 */
contract ChugSplashClaimer is Ownable {
    event OrganizationIDClaimed(bytes32 indexed orgID, address owner);

    event RegistrationInitiated(
        bytes32 indexed orgID,
        address indexed originEndpoint,
        uint32 indexed destDomainID,
        address owner,
        address caller
    );

    event InitiatorApprovalChanged(bytes32 indexed orgID, address indexed initiator, bool approved);

    event CrossChainAdapterChanged(
        address indexed originEndpoint,
        uint32 indexed destDomainID,
        address crossChainAdapter
    );

    ChugSplashRegistry public immutable registry;

    mapping(bytes32 => bool) public organizationIDs;

    mapping(bytes32 => address) public orgIDOwners;

    mapping(bytes32 => mapping(address => bool)) public approvedInitiators;

    // Origin endpoint => destination Domain ID => crossChainAdapter
    mapping(address => mapping(uint32 => address)) public crossChainAdapters;

    /**
     * @param _owner Address of the owner of the registry.
     */
    constructor(address _owner, ChugSplashRegistry _registry) {
        registry = _registry;
        _transferOwnership(_owner);
    }

    function claimOrganizationID(bytes32 _orgID, address _owner) external {
        require(!organizationIDs[_orgID], "ChugSplashClaimer: orgID already claimed");
        organizationIDs[_orgID] = true;
        orgIDOwners[_orgID] = _owner;
        emit OrganizationIDClaimed(_orgID, _owner);
    }

    function initiateRegistration(
        bytes32 _orgID,
        CrossChainMessageInfo[] memory _messages,
        RegistrationInfo[] memory _registrationInfo
    ) external payable {
        require(
            msg.sender == orgIDOwners[_orgID] || approvedInitiators[_orgID][msg.sender],
            "ChugSplashClaimer: caller not approved"
        );

        for (uint i = 0; i < _messages.length; i++) {
            CrossChainMessageInfo memory messageInfo = _messages[i];
            RegistrationInfo memory registration = _registrationInfo[i];
            Version memory version = registration.version;

            address managerImpl = registry.versions(version.major, version.minor, version.patch);
            require(
                registry.managerImplementations(managerImpl),
                "ChugSplashClaimer: invalid manager version"
            );

            address crossChainAdapter = crossChainAdapters[messageInfo.originEndpoint][
                messageInfo.destDomainID
            ];
            require(
                crossChainAdapter != address(0),
                "ChugSplashClaimer: invalid crossChain adapter"
            );

            (bool success, ) = crossChainAdapter.delegatecall(
                abi.encodeCall(
                    ICrossChainAdapter.initiateRegistration,
                    (_orgID, registration, messageInfo)
                )
            );
            require(success, "ChugSplashClaimer: failed to initiate registration");

            emit RegistrationInitiated(
                _orgID,
                messageInfo.originEndpoint,
                messageInfo.destDomainID,
                registration.owner,
                msg.sender
            );
        }
    }

    function setInitiatorApproval(bytes32 _orgID, address _initiator, bool _approved) external {
        require(msg.sender == orgIDOwners[_orgID], "ChugSplashClaimer: caller not org ID owner");
        approvedInitiators[_orgID][_initiator] = _approved;
        emit InitiatorApprovalChanged(_orgID, _initiator, _approved);
    }

    function setCrossChainAdapter(
        address _originEndpoint,
        uint32 _destDomainID,
        address _crossChainAdapter
    ) external onlyOwner {
        crossChainAdapters[_originEndpoint][_destDomainID] = _crossChainAdapter;
        emit CrossChainAdapterChanged(_originEndpoint, _destDomainID, _crossChainAdapter);
    }
}
