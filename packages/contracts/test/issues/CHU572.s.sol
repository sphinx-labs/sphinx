// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../contracts/forge-std/src/Test.sol";
import { SphinxUtils } from "../../contracts/foundry/SphinxUtils.sol";
import { SphinxConfig } from "../../contracts/foundry/Sphinx.sol";

contract CHU572_test is Test, SphinxUtils {
    SphinxConfig public config;

    function test_valid_fails_address_zero_owner() external {
        config.projectName = "CHU-572";
        config.owners = [address(0)];
        config.threshold = 1;
        config.orgId = "test-org-id";
        vm.expectRevert(
            "Sphinx: Detected owner that is, address(0). Gnosis Safe prevents you from using this address as an owner."
        );
        validate(config);
    }
}
