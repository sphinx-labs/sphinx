// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "sphinx-forge-std/Test.sol";
import { Sphinx } from "../../contracts/foundry/Sphinx.sol";
import { IGnosisSafe } from "@sphinx-labs/contracts/contracts/foundry/interfaces/IGnosisSafe.sol";
import { SphinxTestUtils } from "../../contracts/test/SphinxTestUtils.sol";

contract Sphinx_Test is Test, Sphinx, SphinxTestUtils {

    function setUp() public {
        deploySphinxSystem();

        sphinxConfig.projectName = "test_project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;
        sphinxConfig.orgId = "test-org-id";
    }

    function test_sphinxModule_success_standard() external {
        IGnosisSafe safeProxy = IGnosisSafe(deploySphinxModuleAndGnosisSafe(sphinxConfig));

        (address[] memory modules, ) = safeProxy.getModulesPaginated(address(0x1), 1);
        address sphinxModule = modules[0];

        address expectedAddress = this.sphinxModule();

        assertEq(expectedAddress, sphinxModule);
    }

    function test_sphinxModule_success_nonZeroSaltNonce() external {
        sphinxConfig.saltNonce = 1;
        IGnosisSafe safeProxy = IGnosisSafe(deploySphinxModuleAndGnosisSafe(sphinxConfig));

        (address[] memory modules, ) = safeProxy.getModulesPaginated(address(0x1), 1);
        address sphinxModule = modules[0];

        address expectedAddress = this.sphinxModule();

        assertEq(expectedAddress, sphinxModule);
    }
}
