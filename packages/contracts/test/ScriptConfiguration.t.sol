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
import "../contracts/forge-std/src/Test.sol";

import { Sphinx, Network, UserSphinxConfig } from "../contracts/foundry/Sphinx.sol";
import { IGnosisSafe } from "../contracts/foundry/interfaces/IGnosisSafe.sol";
import { SystemContractInfo } from "../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxTestUtils } from "./SphinxTestUtils.sol";

contract ScriptConfiguration_Test is Test, Sphinx, SphinxTestUtils {
    function setUp() public {
        SystemContractInfo[] memory contracts = getSystemContractInfo();
        deploySphinxSystem(contracts);
    }

    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
    }

    function test_userSphinxConfigABIEncoded_success_primaryConfigurationMethod() external {
        bytes memory abiEncodedConfig = userSphinxConfigABIEncoded();
        (UserSphinxConfig memory config, address safeAddress, address moduleAddress) = abi.decode(
            abiEncodedConfig,
            (UserSphinxConfig, address, address)
        );
        assertEq(safeAddress, 0x6e667164e47986fF1108425153f32B02Fc2f5af2);
        assertEq(moduleAddress, 0xc7758246BB22B2012C81459d7084f1A890374452);
        assertEq(config.projectName, "Simple_Project");
    }
}
