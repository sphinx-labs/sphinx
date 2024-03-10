// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../contracts/forge-std/src/Test.sol";
import { Sphinx } from "../../contracts/foundry/Sphinx.sol";

contract CHU663_test is Test, Sphinx {
    address public safe;

    function configureSphinx() public override {
        sphinxConfig.projectName = "CHU-663";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;
        sphinxConfig.orgId = "test-org-id";
        safe = safeAddress();
    }

    function test_configureSphinx_success_calls_safeAddress() external {
        configureSphinx();
        assertNotEq(safe, address(0));
    }
}
