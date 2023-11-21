// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "sphinx-forge-std/Test.sol";
import {SphinxUtils} from "@sphinx-labs/contracts/contracts/foundry/SphinxUtils.sol";
import {
    FoundryContractConfig,
    OptionalString,
    ContractKindEnum,
    ParsedCallAction,
    Network
} from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";

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

    function test_networkEnumSize() external {
        uint256 expected = uint8(type(Network).max) + 1;
        assertEq(numSupportedNetworks, expected);
    }
}
