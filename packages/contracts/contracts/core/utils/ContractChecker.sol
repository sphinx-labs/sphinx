// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

contract ContractChecker {
    function ensureDeployed(address _contract) public view {
        require(_contract.code.length > 0, "ContractChecker: contract not deployed");
    }
}
