// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { ChugSplashTasks } from "./ChugSplashTasks.sol";

contract Propose is ChugSplashTasks {
    string private projectName = vm.envString("CHUGSPLASH_INTERNAL_PROJECT_NAME");
    string private configPath = vm.envString("CHUGSPLASH_INTERNAL_CONFIG_PATH");
    bool private dryRun = vm.envBool("CHUGSPLASH_INTERNAL_DRY_RUN");
    bool private isSilent = vm.envBool("CHUGSPLASH_INTERNAL_SILENT");
    bool private isTestnet = vm.envBool("CHUGSPLASH_INTERNAL_IS_TESTNET");

    function run() public {
        if (isSilent) silence();

        propose(configPath, projectName, dryRun, isTestnet);
    }
}
