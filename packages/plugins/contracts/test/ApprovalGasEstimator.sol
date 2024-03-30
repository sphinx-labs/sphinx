// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IGnosisSafeProxyFactory } from "@sphinx-labs/contracts/contracts/foundry/interfaces/IGnosisSafeProxyFactory.sol";
import { ISphinxModule } from "@sphinx-labs/contracts/contracts/core/interfaces/ISphinxModule.sol";
import { SphinxLeafWithProof } from "@sphinx-labs/contracts/contracts/core/SphinxDataTypes.sol";

contract ApprovalGasEstimator {

    uint public estimatedApprovalGas;

    function estimateApprovalGas(
        ISphinxModule _sphinxModule,
        bytes32 _root,
        SphinxLeafWithProof memory _approveLeaf,
        bytes memory _signatures
    ) external {
        uint256 initialGas = gasleft();
        _sphinxModule.approve(_root, _approveLeaf, _signatures);
        uint256 finalGas = initialGas - gasleft();
        estimatedApprovalGas = finalGas;
    }
}
