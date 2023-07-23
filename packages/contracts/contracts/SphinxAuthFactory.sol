// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { ISphinxRegistry } from "./interfaces/ISphinxRegistry.sol";
import { SphinxAuth } from "./SphinxAuth.sol";
import { SphinxAuthProxy } from "./SphinxAuthProxy.sol";
import { Version, Semver } from "./Semver.sol";

contract SphinxAuthFactory is Ownable {
    /**
     * @notice Emitted whenever a SphinxAuthProxy is deployed.
     *
     * @param salt           Salt used to generate the SphinxAuthProxy address.
     * @param managerProxy    Address of the corresponding deployed SphinxManagerProxy.
     * @param authImpl       Address of the SphinxAuth implementation.
     * @param caller         Address that finalized registration.
     */
    event AuthDeployed(
        string indexed projectNameHash,
        bytes32 indexed salt,
        address indexed managerProxy,
        string projectName,
        address authImpl,
        address caller
    );

    /**
     * @notice Emitted whenever a new SphinxAuth implementation is added.
     *
     * @param major  Major version of the SphinxAuth.
     * @param minor     Minor version of the SphinxAuth.
     * @param patch    Patch version of the SphinxAuth.
     * @param impl Address of the implementation.
     */
    event VersionAdded(
        uint256 indexed major,
        uint256 indexed minor,
        uint256 indexed patch,
        address impl
    );

    event CurrentAuthImplementationSet(address indexed impl);

    ISphinxRegistry public immutable registry;

    /**
     * @notice Mapping of salt values to SphinxAuthProxy addresses.
     */
    mapping(bytes32 => address payable) public auths;

    /**
     * @notice Mapping of SphinxAuthProxy addresses to a boolean indicating whether or not
     *         it was deployed by this contract.
     */
    mapping(address => bool) public isDeployed;

    /**
     * @notice Mapping of SphinxAuth implementations to a boolean indicating whether or not
     *         it's a valid implementation.
     */
    mapping(address => bool) public authImplementations;

    /**
     * @notice Mapping of (major, minor, patch) versions to SphinxAuth implementation
     *         address.
     */
    mapping(uint => mapping(uint => mapping(uint => address))) public versions;

    address public currentAuthImplementation;

    /**
     * @param _owner Address of the owner of this contract.
     */
    constructor(ISphinxRegistry _registry, address _owner) {
        registry = _registry;
        _transferOwnership(_owner);
    }

    function deploy(
        bytes memory _authData,
        bytes memory _registryData,
        string memory _projectName
    ) external {
        require(
            currentAuthImplementation != address(0),
            "SphinxAuthFactory: no auth implementation"
        );

        bytes32 salt = keccak256(abi.encode(_authData, _projectName));
        require(address(auths[salt]) == address(0), "SphinxAuthFactory: already deployed");

        address authProxyAddress = getAuthProxyAddress(salt);

        address managerProxy = registry.register(authProxyAddress, _projectName, _registryData);

        SphinxAuthProxy authProxy = new SphinxAuthProxy{ salt: salt }(this, address(this));

        require(
            address(authProxy) == authProxyAddress,
            "SphinxAuthFactory: failed to deploy auth proxy"
        );

        auths[salt] = payable(authProxyAddress);
        isDeployed[authProxyAddress] = true;

        authProxy.upgradeToAndCall(
            currentAuthImplementation,
            abi.encodeCall(SphinxAuth.initialize, (managerProxy, _projectName, _authData))
        );

        // Set the auth proxy admin to itself
        authProxy.changeAdmin(authProxyAddress);

        emit AuthDeployed(
            _projectName,
            salt,
            managerProxy,
            _projectName,
            currentAuthImplementation,
            msg.sender
        );
    }

    /**
     * @notice Adds a new version of the SphinxAuth implementation.
     *  The version is specified by the `Semver` contract
     *      attached to the implementation. Throws an error if the version
     *      has already been set. Only callable by the owner of this contract.
     *
     * @param _auth Address of the SphinxAuth implementation to add.
     */
    function addVersion(address _auth) external onlyOwner {
        Version memory version = Semver(_auth).version();
        uint256 major = version.major;
        uint256 minor = version.minor;
        uint256 patch = version.patch;

        require(
            versions[major][minor][patch] == address(0),
            "SphinxAuthFactory: version already set"
        );

        authImplementations[_auth] = true;
        versions[major][minor][patch] = _auth;

        emit VersionAdded(major, minor, patch, _auth);
    }

    function setCurrentAuthImplementation(address _impl) external onlyOwner {
        require(authImplementations[_impl], "SphinxAuthFactory: invalid auth implementation");
        currentAuthImplementation = _impl;
        emit CurrentAuthImplementationSet(_impl);
    }

    // Get the Create2 address using the Create2 library
    function getAuthProxyAddress(bytes32 _salt) private view returns (address) {
        return
            Create2.computeAddress(
                _salt,
                keccak256(
                    abi.encodePacked(
                        type(SphinxAuthProxy).creationCode,
                        abi.encode(this, address(this))
                    )
                )
            );
    }
}
