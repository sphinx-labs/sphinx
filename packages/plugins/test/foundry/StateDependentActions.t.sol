// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import { Network } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { StateDependentActionsConfiguration } from "../../script/StateDependentActionsConfiguration.s.sol";

contract StateDependentActionsTest is Test, StateDependentActionsConfiguration {
    function setUp() public {
        deploy(Network.anvil);
    }

    function testConstructorBoxValue() public {
        assertEq(stateDependentActions.fetchConstructorBoxValue(), 9);
    }

    function testExternallyDeployedBoxValue() public {
        assertEq(stateDependentActions.fetchExternallyDeployedBoxValue(), 24);
    }
}
