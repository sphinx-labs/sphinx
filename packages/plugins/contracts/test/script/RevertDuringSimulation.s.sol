// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ISphinxModule } from "@sphinx-labs/contracts/contracts/core/interfaces/ISphinxModule.sol";
import { Script } from "sphinx-forge-std/Script.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import { Sphinx } from "../../foundry/Sphinx.sol";

contract RevertDuringSimulation_Script is Script, Sphinx {
    constructor() {
        sphinxConfig.projectName = "Revert_During_Simulation";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;

        sphinxConfig.mainnets = [Network.optimism];
        sphinxConfig.testnets = [Network.sepolia];
        sphinxConfig.orgId = "test-org-id";
    }

    function run() public override sphinx {
        RevertDuringSimulation reverter = new RevertDuringSimulation{ salt: 0 }(sphinxModule());
        reverter.revertDuringSimulation();
    }
}

contract RevertDuringSimulation {
    ISphinxModule sphinxModule;

    constructor(address _sphinxModule) {
        sphinxModule = ISphinxModule(_sphinxModule);
    }

    function revertDuringSimulation() external {
        // Revert only if the SphinxModule is deployed and there's an active Merkle root.
        if (
            address(sphinxModule).code.length > 0 && sphinxModule.activeMerkleRoot() != bytes32(0)
        ) {
            revert("RevertDuringSimulation: reverted during simulation");
        }

        // This function must be state-changing (i.e. non-view and non-pure) so that it's collected
        // in Foundry's broadcast. We add a pointless transaction here so that the Solidity compiler
        // doesn't log a warning saying "Function state mutability can be restricted to view".
        (bool success, ) = address(0x1234).call(new bytes(0));
        success;
    }
}
