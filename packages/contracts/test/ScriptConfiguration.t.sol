// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Technically, we could use a forge-std remapping in our non-production contracts (scripts, tests, etc). We chose not too because allowing
// that would increase the chance that we accidentally ship something that may not compile in the users project because we accidentially
// relied on a remapping in the wrong file.
import "../lib/forge-std/src/Test.sol";

import { Sphinx, Network, SphinxConfig } from "../contracts/foundry/Sphinx.sol";
import { IGnosisSafe } from "../contracts/foundry/interfaces/IGnosisSafe.sol";
import { SystemContractInfo } from "../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxTestUtils } from "./SphinxTestUtils.sol";

contract ScriptConfigurationLegacy_Test is Test, Sphinx, SphinxTestUtils {
    function setUp() public {
        SystemContractInfo[] memory contracts = getSystemContractInfo();
        deploySphinxSystem(contracts);

        sphinxConfig.projectName = "test_project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;
        sphinxConfig.orgId = "test-org-id";
    }

    function test_sphinxConfigABIEncoded_success_legacyConfigurationMethod() external {
        bytes memory abiEncodedConfig = sphinxConfigABIEncoded();
        (SphinxConfig memory config, address safeAddress, address moduleAddress) = abi.decode(
            abiEncodedConfig,
            (SphinxConfig, address, address)
        );
        assertNotEq(safeAddress, address(0));
        assertNotEq(moduleAddress, address(0));
        assertEq(config.projectName, sphinxConfig.projectName);
        assertEq(config.owners[0], sphinxConfig.owners[0]);
        assertEq(config.threshold, sphinxConfig.threshold);
        assertEq(config.orgId, sphinxConfig.orgId);
    }
}

contract ScriptConfiguration_Test is Test, Sphinx, SphinxTestUtils {
    function setUp() public {
        SystemContractInfo[] memory contracts = getSystemContractInfo();
        deploySphinxSystem(contracts);

        // We set some values in here because we want to test that we'll prioritize the
        // return value of the function over the sphinxConfig state variable.
        sphinxConfig.projectName = "test_project-legacy";
        sphinxConfig.threshold = 2;
        sphinxConfig.orgId = "test-org-id-legacy";
    }

    function configureSphinx() public view returns (SphinxConfig memory config) {
        config.projectName = "test_project";
        config.threshold = 1;
        config.orgId = "test-org-id";
        config.owners = new address[](1);
        config.owners[0] = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

        return config;
    }

    function test_sphinxConfigABIEncoded_success_primaryConfigurationMethod() external {
        bytes memory abiEncodedConfig = sphinxConfigABIEncoded();
        (SphinxConfig memory config, address safeAddress, address moduleAddress) = abi.decode(
            abiEncodedConfig,
            (SphinxConfig, address, address)
        );
        assertNotEq(safeAddress, address(0));
        assertNotEq(moduleAddress, address(0));
        assertEq(config.projectName, "test_project");
        assertEq(config.owners[0], 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
        assertEq(config.threshold, 1);
        assertEq(config.orgId, "test-org-id");
    }
}
