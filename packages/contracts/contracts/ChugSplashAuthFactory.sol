// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { IChugSplashRegistry } from "./interfaces/IChugSplashRegistry.sol";
import { ChugSplashAuth } from "./ChugSplashAuth.sol";
import { ChugSplashAuthProxy } from "./ChugSplashAuthProxy.sol";
import { Version, Semver } from "./Semver.sol";

contract ChugSplashAuthFactory is Ownable {
    /**
     * @notice Emitted whenever a ChugSplashAuthProxy is deployed.
     *
     * @param salt           Salt used to generate the ChugSplashAuthProxy address.
     * @param managerProxy    Address of the corresponding deployed ChugSplashManagerProxy.
     * @param authImpl       Address of the ChugSplashAuth implementation.
     * @param caller         Address that finalized registration.
     */
    event AuthDeployed(
        bytes32 indexed salt,
        address indexed managerProxy,
        address indexed authImpl,
        address caller
    );

    /**
     * @notice Emitted whenever a new ChugSplashAuth implementation is added.
     *
     * @param major  Major version of the ChugSplashAuth.
     * @param minor     Minor version of the ChugSplashAuth.
     * @param patch    Patch version of the ChugSplashAuth.
     * @param impl Address of the implementation.
     */
    event VersionAdded(
        uint256 indexed major,
        uint256 indexed minor,
        uint256 indexed patch,
        address impl
    );

    IChugSplashRegistry public immutable registry;

    /**
     * @notice Mapping of salt values to ChugSplashAuthProxy addresses.
     */
    mapping(bytes32 => address payable) public auths;

    /**
     * @notice Mapping of ChugSplashAuthProxy addresses to a boolean indicating whether or not
     *         it was deployed by this contract.
     */
    mapping(address => bool) public isDeployed;

    /**
     * @notice Mapping of ChugSplashAuth implementations to a boolean indicating whether or not
     *         it's a valid implementation.
     */
    mapping(address => bool) public authImplementations;

    /**
     * @notice Mapping of (major, minor, patch) versions to ChugSplashAuth implementation
     *         address.
     */
    mapping(uint => mapping(uint => mapping(uint => address))) public versions;

    address public currentAuthImplementation;

    /**
     * @param _owner Address of the owner of this contract.
     */
    constructor(IChugSplashRegistry _registry, address _owner) {
        registry = _registry;
        _transferOwnership(_owner);
    }

    function deploy(bytes memory _authData, bytes memory _registryData, uint256 _saltNonce) external {
        require(currentAuthImplementation != address(0), "ChugSplashAuthFactory: no auth implementation");

        bytes32 salt = keccak256(abi.encode(_authData, _saltNonce));
        require(
            address(auths[salt]) == address(0),
            "ChugSplashAuthFactory: already deployed"
        );

        address authProxyAddress = getAuthProxyAddress(salt);

        address managerProxy = registry.register(authProxyAddress, _registryData, _saltNonce);

        ChugSplashAuthProxy authProxy = new ChugSplashAuthProxy{ salt: salt }(
            this,
            address(this)
        );
        require(address(authProxy) == authProxyAddress, "ChugSplashAuthFactory: failed to deploy auth proxy");

        auths[salt] = payable(authProxyAddress);
        isDeployed[authProxyAddress] = true;

        authProxy.upgradeToAndCall(
            currentAuthImplementation,
            abi.encodeCall(ChugSplashAuth.initialize, (managerProxy, _authData))
        );

        // Set the auth proxy admin to itself
        authProxy.changeAdmin(authProxyAddress);

        emit AuthDeployed(
            salt,
            managerProxy,
            currentAuthImplementation,
            msg.sender
        );
    }

    /**
     * @notice Adds a new version of the ChugSplashAuth implementation.
     *  The version is specified by the `Semver` contract
     *      attached to the implementation. Throws an error if the version
     *      has already been set. Only callable by the owner of this contract.
     *
     * @param _auth Address of the ChugSplashAuth implementation to add.
     */
    function addVersion(address _auth) external onlyOwner {
        Version memory version = Semver(_auth).version();
        uint256 major = version.major;
        uint256 minor = version.minor;
        uint256 patch = version.patch;

        require(
            versions[major][minor][patch] == address(0),
            "ChugSplashAuthFactory: version already set"
        );

        authImplementations[_auth] = true;
        versions[major][minor][patch] = _auth;

        emit VersionAdded(major, minor, patch, _auth);
    }

    function setCurrentAuthImplementation(address _auth) external onlyOwner {
        require(authImplementations[_auth], "ChugSplashAuthFactory: invalid auth implementation");
        currentAuthImplementation = _auth;
    }

    // Get the Create2 address using the Create2 library
    function getAuthProxyAddress(bytes32 _salt) private view returns (address) {
        return Create2.computeAddress(_salt, keccak256(abi.encodePacked(type(ChugSplashAuthProxy).creationCode, this, address(this))));
    }
}
