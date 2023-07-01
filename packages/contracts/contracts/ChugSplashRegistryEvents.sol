// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ChugSplashRegistryEvents {
    /**
     * @notice Emitted whenever a ChugSplashManagerProxy is registered.
     *
     * @param salt           Salt used to generate the ChugSplashManagerProxy address.
     * @param managerImpl    Address of the ChugSplashManager implementation.
     * @param owner          Address of the initial owner of the ChugSplashManager.
     * @param caller         Address that registered the ChugSplashManager.
     * @param retdata        Return data from the ChugSplashManager initializer.
     */
    event ChugSplashManagerRegistered(
        bytes32 indexed salt,
        address indexed managerImpl,
        address owner,
        address caller,
        bytes retdata
    );

    /**
     * @notice Emitted whenever a ChugSplashManager contract announces an event on the registry. We
     *         use this to avoid needing a complex indexing system when we're trying to find events
     *         emitted by the various manager contracts.
     *
     * @param eventNameHash Hash of the name of the event being announced.
     * @param manager       Address of the ChugSplashManagerProxy announcing an event.
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
     * @param manager       Address of the ChugSplashManagerProxy announcing an event.
     * @param dataHash      Hash of the extra data sent by the ChugSplashManager.
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
     * @param adapter          Address of the adapter for the contract kind.
     */
    event ContractKindAdded(bytes32 contractKindHash, address adapter);

    /**
     * @notice Emitted whenever a new ChugSplashManager implementation is added.
     *
     * @param major  Major version of the ChugSplashManager.
     * @param minor     Minor version of the ChugSplashManager.
     * @param patch    Patch version of the ChugSplashManager.
     * @param manager Address of the ChugSplashManager implementation.
     */
    event VersionAdded(
        uint256 indexed major,
        uint256 indexed minor,
        uint256 indexed patch,
        address manager
    );

    event CurrentManagerImplementationSet(address indexed _manager);
}
