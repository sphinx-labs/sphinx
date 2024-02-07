// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/forge-std/src/Test.sol";
import { VmSafe } from "../lib/forge-std/src/Vm.sol";
import { SphinxUtils } from "../contracts/foundry/SphinxUtils.sol";
import {
    FoundryContractConfig,
    OptionalString,
    ContractKindEnum,
    ParsedCallAction,
    Network,
    InitialChainState,
    FoundryDeploymentInfo,
    SphinxConfig,
    ParsedAccountAccess
} from "../contracts/foundry/SphinxPluginTypes.sol";

contract SphinxUtils_Test is Test, SphinxUtils {
    address dummySafeAddress = address(0x1234);

    function setUp() public {}

    function test_getUniqueAddresses_success_allUnique() external {
        address[] memory addresses = new address[](3);
        addresses[0] = address(0x1);
        addresses[1] = address(0x2);
        addresses[2] = address(0x3);

        address[] memory uniqueAddresses = getUniqueAddresses(addresses);

        assertEq(uniqueAddresses.length, 3);
        assertEq(uniqueAddresses[0], address(0x1));
        assertEq(uniqueAddresses[1], address(0x2));
        assertEq(uniqueAddresses[2], address(0x3));
    }

    function test_getUniqueAddresses_success_allDuplicates() external {
        address[] memory addresses = new address[](3);
        addresses[0] = address(0);
        addresses[1] = address(0);
        addresses[2] = address(0);

        address[] memory uniqueAddresses = getUniqueAddresses(addresses);

        assertEq(uniqueAddresses.length, 1);
        assertEq(uniqueAddresses[0], address(0));
    }

    function test_getUniqueAddresses_success_mixed() external {
        address[] memory addresses = new address[](8);
        addresses[0] = address(0);
        addresses[1] = address(0x1);
        addresses[2] = address(0x2);
        addresses[3] = address(0x1);
        addresses[4] = address(0x3);
        addresses[5] = address(0x3);
        addresses[6] = address(0x3);
        addresses[7] = address(0);

        address[] memory uniqueAddresses = getUniqueAddresses(addresses);

        assertEq(uniqueAddresses.length, 4);
        assertEq(uniqueAddresses[0], address(0));
        assertEq(uniqueAddresses[1], address(0x1));
        assertEq(uniqueAddresses[2], address(0x2));
        assertEq(uniqueAddresses[3], address(0x3));
    }

    function test_getUniqueAddresses_success_emptyArray() external {
        address[] memory addresses = new address[](0);

        address[] memory uniqueAddresses = getUniqueAddresses(addresses);

        assertEq(uniqueAddresses.length, 0);
    }

    function test_getUniqueUint256_success_allUnique() external {
        uint256[] memory values = new uint256[](3);
        values[0] = 2;
        values[1] = 1;
        values[2] = 3;

        uint256[] memory uniqueValues = getUniqueUint256(values);

        assertEq(uniqueValues.length, 3);
        assertEq(uniqueValues[0], 2);
        assertEq(uniqueValues[1], 1);
        assertEq(uniqueValues[2], 3);
    }

    function test_getUniqueUint256_success_allDuplicates() external {
        uint256[] memory values = new uint256[](3);
        values[0] = 1;
        values[1] = 1;
        values[2] = 1;

        uint256[] memory uniqueValues = getUniqueUint256(values);

        assertEq(uniqueValues.length, 1);
        assertEq(uniqueValues[0], 1);
    }

    function test_getUniqueUint256_success_mixed() external {
        uint256[] memory values = new uint256[](8);
        values[0] = 0;
        values[1] = 1;
        values[2] = 2;
        values[3] = 1;
        values[4] = 3;
        values[5] = 3;
        values[6] = 3;
        values[7] = 0;

        uint256[] memory uniqueValues = getUniqueUint256(values);

        assertEq(uniqueValues.length, 4);
        assertEq(uniqueValues[0], 0);
        assertEq(uniqueValues[1], 1);
        assertEq(uniqueValues[2], 2);
        assertEq(uniqueValues[3], 3);
    }

    function test_getUniqueUint256_success_emptyArray() external {
        uint256[] memory values = new uint256[](0);

        uint256[] memory uniqueValues = getUniqueUint256(values);

        assertEq(uniqueValues.length, 0, "The returned array should be empty");
    }

    function test_parseAccountAccesses_emptyInput() public {
        Vm.AccountAccess[] memory accesses;
        ParsedAccountAccess[] memory parsed = parseAccountAccesses(accesses, dummySafeAddress);
        assertEq(parsed.length, 0);
    }

    function test_parseAccountAccesses_noRoots() public {
        Vm.AccountAccess[] memory accesses = new Vm.AccountAccess[](3);
        accesses[0] = makeAccountAccess({
            _accessor: address(0x1),
            _kind: VmSafe.AccountAccessKind.Call
        });
        accesses[1] = makeAccountAccess({
            _accessor: address(0x2),
            _kind: VmSafe.AccountAccessKind.Create
        });
        accesses[2] = makeAccountAccess({
            _accessor: address(0x3),
            _kind: VmSafe.AccountAccessKind.Extcodesize
        });

        ParsedAccountAccess[] memory parsed = parseAccountAccesses(accesses, dummySafeAddress);
        assertEq(parsed.length, 0);
    }

    function test_parseAccountAccesses_noNested() public {
        Vm.AccountAccess[] memory accesses = new Vm.AccountAccess[](2);
        accesses[0] = makeAccountAccess({
            _accessor: dummySafeAddress,
            _kind: VmSafe.AccountAccessKind.Call
        });
        accesses[1] = makeAccountAccess({
            _accessor: dummySafeAddress,
            _kind: VmSafe.AccountAccessKind.Create
        });

        ParsedAccountAccess[] memory parsed = parseAccountAccesses(accesses, dummySafeAddress);
        assertEq(parsed.length, 2);

        assertEq(parsed[0].root.accessor, dummySafeAddress);
        assertEq(parsed[0].root.kind, VmSafe.AccountAccessKind.Call);
        assertEq(parsed[0].nested.length, 0);

        assertEq(parsed[1].root.accessor, dummySafeAddress);
        assertEq(parsed[1].root.kind, VmSafe.AccountAccessKind.Create);
        assertEq(parsed[1].nested.length, 0);
    }

    /**
     * @notice Check that the serialization function starts with a fresh state for the object key.
     *         This ensures existing items in the object key aren't included in the serialized JSON.
     *         We enforce this by including `vm.serializeJson(objKey, "{}")` at the beginning of the
     *         serialization function.
     */
    function test_serializeInitialChainState_success_clearsObjectKey() external {
        InitialChainState memory initialState;
        // Add an item to the object key, which is the same object key used in the serialization
        // function.
        string memory serialized = vm.serializeString(initialStateKey, "myKey", "myVal");
        // Check that the item has been added.
        assertTrue(vm.keyExists(serialized, ".myKey"));

        serialized = serializeInitialChainState(initialState);
        // Check that the item no longer exists in the JSON.
        assertFalse(vm.keyExists(serialized, ".myKey"));
    }

    /**
     * @notice Check that the serialization function starts with a fresh state for the object key.
     *         This ensures existing items in the object key aren't included in the serialized JSON.
     *         We enforce this by including `vm.serializeJson(objKey, "{}")` at the beginning of the
     *         serialization function.
     */
    function test_serializeFoundryDeploymentInfo_success_clearsObjectKey() external {
        FoundryDeploymentInfo memory deploymentInfo;
        // Add an item to the object key, which is the same object key used in the serialization
        // function.
        string memory serialized = vm.serializeString(deploymentInfoKey, "myKey", "myVal");
        // Check that the item has been added.
        assertTrue(vm.keyExists(serialized, ".myKey"));

        serialized = serializeFoundryDeploymentInfo(deploymentInfo);
        // Check that the item no longer exists in the JSON.
        assertFalse(vm.keyExists(serialized, ".myKey"));
    }

    /**
     * @notice Check that the serialization function starts with a fresh state for the object key.
     *         This ensures existing items in the object key aren't included in the serialized JSON.
     *         We enforce this by including `vm.serializeJson(objKey, "{}")` at the beginning of the
     *         serialization function.
     */
    function test_serializeSphinxConfig_success_clearsObjectKey() external {
        SphinxConfig memory sphinxConfig;
        // Add an item to the object key, which is the same object key used in the serialization
        // function.
        string memory serialized = vm.serializeString(sphinxConfigKey, "myKey", "myVal");
        // Check that the item has been added.
        assertTrue(vm.keyExists(serialized, ".myKey"));

        serialized = serializeSphinxConfig(sphinxConfig);
        // Check that the item no longer exists in the JSON.
        assertFalse(vm.keyExists(serialized, ".myKey"));
    }

    /////////////////////////////////// Helpers //////////////////////////////////////

    function makeAccountAccess(
        address _accessor,
        Vm.AccountAccessKind _kind
    ) private pure returns (Vm.AccountAccess memory) {
        Vm.AccountAccess memory access;
        access.kind = _kind;
        access.accessor = _accessor;
        return access;
    }

    function assertEq(VmSafe.AccountAccessKind _a, VmSafe.AccountAccessKind _b) private {
        assertEq(uint8(_a), uint8(_b));
    }
}
