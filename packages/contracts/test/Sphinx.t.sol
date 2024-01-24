// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Technically, we could use a forge-std remapping in our non-production contracts (scripts, tests, etc). We chose not too because allowing
// that would increase the chance that we accidentally ship something that may not compile in the users project because we accidentially
// relied on a remapping in the wrong file.
import "../lib/forge-std/src/Test.sol";

import { Sphinx } from "../contracts/foundry/Sphinx.sol";
import { IGnosisSafe } from "../contracts/foundry/interfaces/IGnosisSafe.sol";
import { SystemContractInfo } from "../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxTestUtils } from "./SphinxTestUtils.sol";

contract Sphinx_Test is Test, Sphinx, SphinxTestUtils {

    function setUp() public {
        SystemContractInfo[] memory contracts = getSystemContractInfo();
        deploySphinxSystem(contracts);

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
