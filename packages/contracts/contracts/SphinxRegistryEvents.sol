// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SphinxRegistryEvents {
    /**
     * @notice Emitted whenever a SphinxManagerProxy is registered.
     *
     * @param salt           Salt used to generate the SphinxManagerProxy address.
     * @param managerImpl    Address of the SphinxManager implementation.
     * @param owner          Address of the initial owner of the SphinxManager.
     * @param caller         Address that registered the SphinxManager.
     * @param retdata        Return data from the SphinxManager initializer.
     */
    event SphinxManagerRegistered(
        string indexed projectNameHash,
        bytes32 indexed salt,
        address indexed managerImpl,
        string projectName,
        address owner,
        address caller,
        bytes retdata
    );

    /**
     * @notice Emitted whenever a SphinxManager contract announces an event on the registry. We
     *         use this to avoid needing a complex indexing system when we're trying to find events
     *         emitted by the various manager contracts.
     *
     * @param eventNameHash Hash of the name of the event being announced.
     * @param manager       Address of the SphinxManagerProxy announcing an event.
     * @param eventName     Name of the event being announced.
     */
    event EventAnnounced(string indexed eventNameHash, address indexed manager, string eventName);

    /**
     * @notice Emitted whenever a SphinxManager contract wishes to announce an event on the
     *         registry, including a field for arbitrary data. We use this to avoid needing a
     *         complex indexing system when we're trying to find events emitted by the various
     *         manager contracts.
     *
     * @param eventNameHash Hash of the name of the event being announced.
     * @param manager       Address of the SphinxManagerProxy announcing an event.
     * @param dataHash      Hash of the extra data sent by the SphinxManager.
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
     * @notice Emitted whenever a new SphinxManager implementation is added.
     *
     * @param major  Major version of the SphinxManager.
     * @param minor     Minor version of the SphinxManager.
     * @param patch    Patch version of the SphinxManager.
     * @param manager Address of the SphinxManager implementation.
     */
    event VersionAdded(
        uint256 indexed major,
        uint256 indexed minor,
        uint256 indexed patch,
        address manager
    );

    event CurrentManagerImplementationSet(address indexed _manager);
}
