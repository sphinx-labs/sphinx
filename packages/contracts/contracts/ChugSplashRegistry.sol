// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ChugSplashManagerProxy } from "./ChugSplashManagerProxy.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { IChugSplashManager } from "./interfaces/IChugSplashManager.sol";
import { Semver, Version } from "./Semver.sol";

/**
 * @title ChugSplashRegistry
 * @notice The ChugSplashRegistry is the root contract for the ChugSplash deployment system. All
 *         deployments must be first claimed with this contract, which allows clients to easily
 *         find and index these deployments.
 */
contract ChugSplashRegistry is Ownable, Initializable {
    /**
     * @notice Emitted whenever a new project is claimed.
     *
     * @param organizationID Organization ID.
     * @param claimer         Address of the claimer of the project.
     * @param manager         Address of the ChugSplashManager for this project.
     * @param owner           Address of the initial owner of the project.
     */
    event ChugSplashProjectClaimed(
        bytes32 indexed organizationID,
        address indexed claimer,
        address indexed manager,
        address owner
    );

    /**
     * @notice Emitted whenever a ChugSplashManager contract wishes to announce an event on the
     *         registry. We use this to avoid needing a complex indexing system when we're trying
     *         to find events emitted by the various manager contracts.
     *
     * @param eventNameHash Hash of the name of the event being announced.
     * @param manager       Address of the ChugSplashManager announcing an event.
     * @param eventName     Name of the event being announced.
     */
    event EventAnnounced(string indexed eventNameHash, address indexed manager, string eventName);

    /**
     * @notice Emitted whenever a ChugSplashManager contract wishes to announce an event on the
     *         registry, including a field for arbitrary data. We use this to avoid needing a
     *         complex indexing system when we're trying to find events emitted by the various
     *         manager contracts.
     *
     * @param eventNameHash Hash of the name of the event being announced.
     * @param manager       Address of the ChugSplashManager announcing an event.
     * @param dataHash      Hash of the extra data.
     * @param eventName     Name of the event being announced.
     * @param data          The extra data.
     */
    event EventAnnouncedWithData(
        string indexed eventNameHash,
        address indexed manager,
        bytes indexed dataHash,
        string eventName,
        bytes data
    );

    /**
     * @notice Emitted whenever a new contract kind is added.
     *
     * @param contractKindHash Hash representing the contract kind.
     * @param adapter   Address of the adapter for the proxy.
     */
    event ContractKindAdded(bytes32 contractKindHash, address adapter);

    event VersionAdded(
        uint256 indexed major,
        uint256 indexed minor,
        uint256 indexed patch,
        address manager
    );

    /**
     * @notice Mapping of claimers to project names to ChugSplashManagerProxy contracts.
     */
    mapping(address => mapping(bytes32 => address payable)) public projects;

    /**
     * @notice Mapping of created manager proxy contracts.
     */
    mapping(address => bool) public managerProxies;

    /**
     * @notice Mapping of contract kinds to adapters.
     */
    mapping(bytes32 => address) public adapters;

    /**
     * @notice Mapping of valid manager implementations
     */
    mapping(address => bool) public managerImplementations;

    /**
     * @notice Mapping of version numbers manager implementations
     */
    mapping(uint => mapping(uint => mapping(uint => address))) public versions;

    /**
     * @param _owner Address of the owner of the registry.
     */
    constructor(address _owner) {
        _transferOwnership(_owner);
    }

    /**
     * @notice Claims a new project.
     *
     * @param _organizationID ID of the new ChugSplash organization.
     * @param _owner     Initial owner for the new organization.
     * @param _version   Version of the ChugSplashManager.
     * @param _data      Any data to pass to the ChugSplashManager initalizer.
     */
    function claim(
        bytes32 _organizationID,
        address _owner,
        Version memory _version,
        bytes memory _data
    ) public {
        require(
            address(projects[msg.sender][_organizationID]) == address(0),
            "ChugSplashRegistry: organization ID already claimed by the caller"
        );

        address manager = versions[_version.major][_version.minor][_version.patch];
        require(
            managerImplementations[manager] == true,
            "ChugSplashRegistry: invalid manager version"
        );

        // Deploy the ChugSplashManager proxy and set the implementation to the requested version
        bytes32 salt = keccak256(abi.encode(msg.sender, _organizationID));
        ChugSplashManagerProxy managerProxy = new ChugSplashManagerProxy{ salt: salt }(
            this,
            address(this)
        );
        managerProxy.upgradeToAndCall(
            manager,
            abi.encodeCall(IChugSplashManager.initialize, _data)
        );

        // Change manager proxy admin to the Org owner
        managerProxy.changeAdmin(_owner);

        projects[msg.sender][_organizationID] = payable(address(managerProxy));
        managerProxies[address(managerProxy)] = true;

        emit ChugSplashProjectClaimed(_organizationID, msg.sender, address(managerProxy), _owner);
    }

    /**
     * @notice Allows ChugSplashManager contracts to announce events.
     *
     * @param _event Name of the event to announce.
     */
    function announce(string memory _event) public {
        require(
            managerProxies[msg.sender] == true,
            "ChugSplashRegistry: events can only be announced by ChugSplashManager contracts"
        );

        emit EventAnnounced(_event, msg.sender, _event);
    }

    /**
     * @notice Allows ChugSplashManager contracts to announce events, including a field for
     *         arbitrary data.
     *
     * @param _event Name of the event to announce.
     * @param _data  Arbitrary data to include in the announced event.
     */
    function announceWithData(string memory _event, bytes memory _data) public {
        require(
            managerProxies[msg.sender] == true,
            "ChugSplashRegistry: events can only be announced by ChugSplashManager contracts"
        );

        emit EventAnnouncedWithData(_event, msg.sender, _data, _event, _data);
    }

    /**
     * @notice Adds a new contract kind with a corresponding adapter.
     *
     * @param _contractKindHash Hash representing the contract kind
     * @param _adapter   Address of the adapter for this contract kind.
     */
    function addContractKind(bytes32 _contractKindHash, address _adapter) external onlyOwner {
        require(
            adapters[_contractKindHash] == address(0),
            "ChugSplashRegistry: contract kind has an existing adapter"
        );

        adapters[_contractKindHash] = _adapter;

        emit ContractKindAdded(_contractKindHash, _adapter);
    }

    function addVersion(address _manager) external onlyOwner {
        Version memory version = Semver(_manager).version();
        uint256 major = version.major;
        uint256 minor = version.minor;
        uint256 patch = version.patch;

        require(
            versions[major][minor][patch] == address(0),
            "ChugSplashRegistry: version already set"
        );

        managerImplementations[_manager] = true;
        versions[major][minor][patch] = _manager;

        emit VersionAdded(major, minor, patch, _manager);
    }
}
