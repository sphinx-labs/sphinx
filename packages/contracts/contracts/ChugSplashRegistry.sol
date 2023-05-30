// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { ChugSplashManagerProxy } from "./ChugSplashManagerProxy.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { IChugSplashManager } from "./interfaces/IChugSplashManager.sol";
import { Semver, Version } from "./Semver.sol";
import { ChugSplashRegistryEvents } from "./ChugSplashRegistryEvents.sol";

/**
 * @title ChugSplashRegistry
 * @notice The ChugSplashRegistry is the root contract for the ChugSplash deployment system. This
 *         contract allows callers to register new projects. Also, every event emitted in the
 *         ChugSplash system is announced through this contract. This makes it easy for clients to
 *         find and index events that occur throughout the deployment process. Lastly, the owner of
 *         this contract is able to add support for new contract kinds (e.g. OpenZeppelin's
           Transparent proxy). The owner can also new versions of the ChugSplashManager
 *         implementation.
 *
 */
contract ChugSplashRegistry is Ownable, Initializable, ChugSplashRegistryEvents {
    /**
     * @notice Mapping of organization IDs to ChugSplashManagerProxy addresses.
     */
    mapping(bytes32 => address payable) public projects;

    /**
     * @notice Mapping of ChugSplashManagerProxy addresses to a boolean indicating whether or not
     *         it was deployed by this contract.
     */
    mapping(address => bool) public managerProxies;

    /**
     * @notice Mapping of contract kind hashes to adapter contract addresses.
     */
    mapping(bytes32 => address) public adapters;

    /**
     * @notice Mapping of ChugSplashManager implementations to a boolean indicating whether or not
     *         it's a valid implementation.
     */
    mapping(address => bool) public managerImplementations;

    /**
     * @notice Mapping of (major, minor, patch) versions to ChugSplashManager implementation
     *         address.
     */
    mapping(uint => mapping(uint => mapping(uint => address))) public versions;

    /**
     * @param _owner Address of the owner of the registry.
     */
    constructor(address _owner) {
        _transferOwnership(_owner);
    }

    /**
     * @notice Finalizes the registration of an organization ID by deploying a new
       ChugSplashManagerProxy contract and setting the provided owner as the initial owner of the
       new project.
     *
     * @param _organizationID Organization ID being registered.
     * @param _owner        Initial owner for the new project.
     * @param _version   Version of the ChugSplashManager implementation.
     * @param _data      Any data to pass to the ChugSplashManager initializer.
     */
    function finalizeRegistration(
        bytes32 _organizationID,
        address _owner,
        Version memory _version,
        bytes memory _data
    ) external {
        require(
            address(projects[_organizationID]) == address(0),
            "ChugSplashRegistry: org ID already registered"
        );

        address managerImpl = versions[_version.major][_version.minor][_version.patch];
        require(managerImplementations[managerImpl], "ChugSplashRegistry: invalid manager version");

        ChugSplashManagerProxy managerProxy = new ChugSplashManagerProxy{ salt: _organizationID }(
            this,
            address(this)
        );

        require(
            address(managerProxy) != address(0),
            "ChugSplashRegistry: failed to deploy manager proxy"
        );

        projects[_organizationID] = payable(address(managerProxy));
        managerProxies[address(managerProxy)] = true;

        bytes memory retdata = managerProxy.upgradeToAndCall(
            managerImpl,
            abi.encodeCall(IChugSplashManager.initialize, _data)
        );

        // Change manager proxy admin to the Org owner
        managerProxy.changeAdmin(_owner);

        emit ChugSplashRegistrationFinalized(
            _organizationID,
            managerImpl,
            _owner,
            msg.sender,
            retdata
        );
    }

    /**
     * @notice Allows ChugSplashManager contracts to announce events. Only callable by
       ChugSplashManagerProxy contracts.
     *
     * @param _event Name of the event to announce.
     */
    function announce(string memory _event) external {
        require(
            managerProxies[msg.sender],
            "ChugSplashRegistry: events can only be announced by managers"
        );

        emit EventAnnounced(_event, msg.sender, _event);
    }

    /**
     * @notice Allows ChugSplashManager contracts to announce events, including a field for
     *         arbitrary data.  Only callable by ChugSplashManagerProxy contracts.
     *
     * @param _event Name of the event to announce.
     * @param _data  Arbitrary data to include in the announced event.
     */
    function announceWithData(string memory _event, bytes memory _data) external {
        require(
            managerProxies[msg.sender],
            "ChugSplashRegistry: events can only be announced by managers"
        );

        emit EventAnnouncedWithData(_event, msg.sender, _data, _event, _data);
    }

    /**
     * @notice Adds a new contract kind with a corresponding adapter. Only callable by the owner of
       the ChugSplashRegistry.
     *
     * @param _contractKindHash Hash representing the contract kind.
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

    /**
     * @notice Adds a new version of the ChugSplashManager implementation. Only callable by the
       owner of the ChugSplashRegistry.
     *  The version is specified by the `Semver` contract
     *      attached to the implementation. Throws an error if the version
     *      has already been set.
     *
     * @param _manager Address of the ChugSplashManager implementation to add.
     */
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
