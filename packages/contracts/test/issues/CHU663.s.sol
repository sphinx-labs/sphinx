// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../contracts/forge-std/src/Test.sol";
import { Sphinx } from "../../contracts/foundry/Sphinx.sol";

contract CHU663_test is Test, Sphinx {
    address public safe;

    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
        safe = safeAddress();
    }

    function test_configureSphinx_success_calls_safeAddress() external {
        configureSphinx();
        assertNotEq(safe, address(0));
    }
}
