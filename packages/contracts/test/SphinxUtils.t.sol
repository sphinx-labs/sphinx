// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/forge-std/src/Test.sol";
import {SphinxUtils} from "../contracts/foundry/SphinxUtils.sol";
import {
    FoundryContractConfig,
    OptionalString,
    ContractKindEnum,
    ParsedCallAction,
    Network
} from "../contracts/foundry/SphinxPluginTypes.sol";

contract SphinxUtils_Test is Test, SphinxUtils {
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
}
