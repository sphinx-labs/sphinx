// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "sphinx-forge-std/Test.sol";
import { Network } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { MaxArgsConfiguration } from "../../script/MaxArgsConfiguration.s.sol";

contract MaxArgsTest is Test, MaxArgsConfiguration {
    function setUp() public {
        deploy(Network.anvil);
    }

    function testValuesSetCorrectly() public {
        assertEq(maxArgs.value(), 2);
        assertEq(maxArgs.value2(), 4);
        assertEq(maxArgs.value3(), 6);
        assertEq(maxArgs.value4(), 8);
        assertEq(maxArgs.value5(), 10);
        assertEq(maxArgs.value6(), 12);
        assertEq(maxArgs.value7(), 14);
        assertEq(maxArgs.value8(), 16);
        assertEq(maxArgs.value9(), 18);
        assertEq(maxArgs.value10(), 20);
        assertEq(maxArgs.value11(), 22);
    }
}
