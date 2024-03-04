// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * We do not use remappings for forge-std because if we did, the user would need to define them
 * in their remappings, or our library contracts would not work. Technically, we could use a
 * forge-std remapping in our non-production contracts (scripts, tests, etc.), such as this file,
 * without forcing the user to define a remapping. We chose not to because doing that would increase
 * the chance of accidentally shipping something that may not compile in the user's project because
 * we accidentally relied on a remapping in the wrong file.
 */
import "../lib/forge-std/src/Test.sol";

import { Sphinx, Network } from "../contracts/foundry/Sphinx.sol";
import { IGnosisSafe } from "../contracts/foundry/interfaces/IGnosisSafe.sol";
import { SystemContractInfo } from "../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxTestUtils } from "./SphinxTestUtils.sol";

contract Sphinx_Test is Test, Sphinx, SphinxTestUtils {
    function setUp() public {
        SystemContractInfo[] memory contracts = getSystemContractInfo();
        deploySphinxSystem(contracts);
    }

    function configureSphinx() public override {
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
