// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Vm } from "forge-std/Vm.sol";
import { SphinxConstants, SphinxContractInfo } from "../../contracts/foundry/SphinxConstants.sol";

/**
 * @notice Helper functions for testing the Sphinx plugin. This is separate from `SphinxUtils`
 *         because this file only contains helper functions for tests, whereas `SphinxUtils`
 *         contains helper functions for the plugin itself.
 */
contract SphinxTestUtils is SphinxConstants {

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /**
     * @notice The storage slot that holds the address of an EIP-1967 implementation.
     *         bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
     */
    bytes32 public constant EIP1967_IMPLEMENTATION_KEY =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function deploySphinxAuthTo(address _where) public {
        vm.etch(_where, getSphinxAuthImplInitCode());
        (bool success, bytes memory runtimeBytecode) = _where.call("");
        require(success, "Sphinx: Failed to deploy SphinxAuth. Should never happen.");
        vm.etch(_where, runtimeBytecode);
    }

    function getSphinxAuthImplInitCode() private pure returns (bytes memory) {
        SphinxContractInfo[] memory contracts = getSphinxContractInfo();
        for (uint i = 0; i < contracts.length; i++) {
            if (contracts[i].expectedAddress == authImplAddress) {
                return contracts[i].creationCode;
            }
        }
        revert("Sphinx: Unable to find SphinxAuth initcode. Should never happen.");
    }
}
