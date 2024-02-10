// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISphinxModule {
    function activeMerkleRoot() external view returns (bytes32);
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
