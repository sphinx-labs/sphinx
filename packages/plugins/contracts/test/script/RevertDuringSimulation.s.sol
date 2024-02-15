// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ISphinxModule } from "@sphinx-labs/contracts/contracts/core/interfaces/ISphinxModule.sol";
import { Script } from "sphinx-forge-std/Script.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import { Sphinx } from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import { RevertDuringSimulation } from "../RevertDuringSimulation.sol";

contract RevertDuringSimulation_Script is Script, Sphinx {
    constructor() {
        sphinxConfig.projectName = "Revert_During_Simulation";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;

        sphinxConfig.mainnets = [Network.optimism];
        sphinxConfig.testnets = [Network.sepolia];
        sphinxConfig.orgId = "test-org-id";
    }

    function run() public sphinx {
        RevertDuringSimulation reverter = new RevertDuringSimulation{ salt: 0 }(sphinxModule());
        reverter.revertDuringSimulation();
    }
}
