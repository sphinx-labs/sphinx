// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { SphinxTasks } from "./SphinxTasks.sol";

contract Propose is SphinxTasks {
    string private projectName = vm.envString("SPHINX_INTERNAL_PROJECT_NAME");
    string private configPath = vm.envString("SPHINX_INTERNAL_CONFIG_PATH");
    bool private dryRun = vm.envBool("SPHINX_INTERNAL_DRY_RUN");
    bool private isSilent = vm.envBool("SPHINX_INTERNAL_SILENT");
    bool private isTestnet = vm.envBool("SPHINX_INTERNAL_IS_TESTNET");

    function run() public {
        if (isSilent) silence();

        propose(configPath, projectName, dryRun, isTestnet);
    }
}
