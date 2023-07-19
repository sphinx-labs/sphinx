// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { SphinxManagerProxy } from "./SphinxManagerProxy.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { ISphinxManager } from "./interfaces/ISphinxManager.sol";
import { Semver } from "./Semver.sol";
import { SphinxRegistryEvents } from "./SphinxRegistryEvents.sol";
import { ISphinxRegistry } from "./interfaces/ISphinxRegistry.sol";
import { Version } from "./SphinxDataTypes.sol";

/**
 * @title SphinxRegistry
 * @notice The SphinxRegistry is the root contract for the Sphinx deployment system. This
 *         contract allows callers to register new SphinxManagers. Also, every event emitted in
           the
 *         Sphinx system is announced through this contract. This makes it easy for clients to
 *         find and index events that occur throughout the deployment process. Lastly, the owner of
 *         this contract is able to add support for new contract kinds (e.g. OpenZeppelin's
           Transparent proxy). The owner can also new versions of the SphinxManager
 *         implementation.
 *
 */
contract SphinxRegistry is Ownable, Initializable, SphinxRegistryEvents, ISphinxRegistry {
    /**
     * @notice Mapping of salt values to SphinxManagerProxy addresses.
     */
    mapping(bytes32 => address payable) public managers;

    /**
     * @notice Mapping of SphinxManagerProxy addresses to a boolean indicating whether or not
     *         it was deployed by this contract.
     */
    mapping(address => bool) public isDeployed;

    /**
     * @notice Mapping of contract kind hashes to adapter contract addresses.
     */
    mapping(bytes32 => address) public adapters;

    /**
     * @notice Mapping of SphinxManager implementations to a boolean indicating whether or not
     *         it's a valid implementation.
     */
    mapping(address => bool) public managerImplementations;

    /**
     * @notice Mapping of (major, minor, patch) versions to SphinxManager implementation
     *         address.
     */
    mapping(uint => mapping(uint => mapping(uint => address))) public versions;

    address public currentManagerImplementation;

    /**
     * @param _owner Address of the owner of the registry.
     */
    constructor(address _owner) {
        _transferOwnership(_owner);
    }

    /**
     * @notice Registers a new SphinxManagerProxy. The address of each new proxy is calculated
        via CREATE2, using the `_owner` and `_saltNonce` as the salt.
     *
     * @param _owner Address of the owner of the SphinxManagerProxy.
     * @param _saltNonce Nonce that generates the salt that determines the address of the new
            SphinxManagerProxy. This allows a single owner address to own multiple different
            proxy contracts.
     */
    function register(
        address _owner,
        uint256 _saltNonce,
        bytes memory _data
    ) external returns (address) {
        require(
            currentManagerImplementation != address(0),
            "SphinxRegistry: no manager implementation"
        );

        bytes32 salt = keccak256(abi.encode(_owner, _saltNonce, _data));
        require(address(managers[salt]) == address(0), "SphinxRegistry: already registered");

        SphinxManagerProxy managerProxy = new SphinxManagerProxy{ salt: salt }(this, address(this));

        require(
            address(managerProxy) != address(0),
            "SphinxRegistry: failed to deploy manager proxy"
        );

        managers[salt] = payable(address(managerProxy));
        isDeployed[address(managerProxy)] = true;

        bytes memory retdata = managerProxy.upgradeToAndCall(
            currentManagerImplementation,
            abi.encodeCall(ISphinxManager.initialize, (_owner, _data))
        );

        // Change manager proxy admin to the owner
        managerProxy.changeAdmin(_owner);

        emit SphinxManagerRegistered(
            salt,
            currentManagerImplementation,
            _owner,
            msg.sender,
            retdata
        );

        return (address(managerProxy));
    }

    /**
     * @notice Allows SphinxManager contracts to announce events. Only callable by
       SphinxManagerProxy contracts.
     *
     * @param _event Name of the event to announce.
     */
    function announce(string memory _event) external {
        require(isDeployed[msg.sender], "SphinxRegistry: events can only be announced by managers");

        emit EventAnnounced(_event, msg.sender, _event);
    }

    /**
     * @notice Allows SphinxManager contracts to announce events, including a field for
     *         arbitrary data.  Only callable by SphinxManagerProxy contracts.
     *
     * @param _event Name of the event to announce.
     * @param _data  Arbitrary data to include in the announced event.
     */
    function announceWithData(string memory _event, bytes memory _data) external {
        require(isDeployed[msg.sender], "SphinxRegistry: events can only be announced by managers");

        emit EventAnnouncedWithData(_event, msg.sender, _data, _event, _data);
    }

    /**
     * @notice Adds a new contract kind with a corresponding adapter. Only callable by the owner of
       the SphinxRegistry.
     *
     * @param _contractKindHash Hash representing the contract kind.
     * @param _adapter   Address of the adapter for this contract kind.
     */
    function addContractKind(bytes32 _contractKindHash, address _adapter) external onlyOwner {
        require(
            adapters[_contractKindHash] == address(0),
            "SphinxRegistry: contract kind has an existing adapter"
        );

        adapters[_contractKindHash] = _adapter;

        emit ContractKindAdded(_contractKindHash, _adapter);
    }

    /**
     * @notice Adds a new version of the SphinxManager implementation. Only callable by the
       owner of the SphinxRegistry.
     *  The version is specified by the `Semver` contract
     *      attached to the implementation. Throws an error if the version
     *      has already been set.
     *
     * @param _manager Address of the SphinxManager implementation to add.
     */
    function addVersion(address _manager) external onlyOwner {
        Version memory version = Semver(_manager).version();
        uint256 major = version.major;
        uint256 minor = version.minor;
        uint256 patch = version.patch;

        require(versions[major][minor][patch] == address(0), "SphinxRegistry: version already set");

        managerImplementations[_manager] = true;
        versions[major][minor][patch] = _manager;

        emit VersionAdded(major, minor, patch, _manager);
    }

    function setCurrentManagerImplementation(address _manager) external onlyOwner {
        require(managerImplementations[_manager], "SphinxRegistry: invalid manager implementation");
        currentManagerImplementation = _manager;

        emit CurrentManagerImplementationSet(_manager);
    }
}
