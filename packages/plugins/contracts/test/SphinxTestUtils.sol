// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { console } from "forge-std/console.sol";
import { Vm } from "forge-std/Vm.sol";
import { StdCheatsSafe } from "forge-std/StdCheats.sol";

import { SphinxConstants, SphinxContractInfo } from "../../contracts/foundry/SphinxConstants.sol";

// TODO(ryan): this bug in `SphinxTestUtils.c.sol`:
// `import { SphinxContractInfo } from "@sphinx-labs/pluginsSphinxConstants.sol";`

/**
 * @notice Helper functions for testing the Sphinx plugin. This is separate from `SphinxUtils`
 *         because this file only contains helper functions for tests, whereas `SphinxUtils`
 *         contains helper functions for the plugin itself.
 */
contract SphinxTestUtils is SphinxConstants, StdCheatsSafe {

    // Same as the `RawTx1559` struct defined in StdCheats.sol, except this struct has two
    // addditional fields: `additionalContracts` and `isFixedGasLimit`.
    struct AnvilBroadcastedTxn {
        address[] additionalContracts;
        string[] arguments;
        address contractAddress;
        string contractName;
        // Called 'function' in the JSON
        string functionSig;
        bytes32 hash;
        bool isFixedGasLimit;
        // Called 'transaction' in the JSON
        RawTx1559Detail txDetail;
        // Called 'transactionType' in the JSON
        string opcode;
    }

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

    function readAnvilBroadcastedTxns(string memory _path) internal view returns (AnvilBroadcastedTxn[] memory) {
        string memory deployData = vm.readFile(_path);
        uint256 numTxns = vm.parseJsonStringArray(deployData, ".transactions").length;
        AnvilBroadcastedTxn[] memory txns = new AnvilBroadcastedTxn[](numTxns);
        for (uint256 i = 0; i < numTxns; i++) {
            txns[i] = readAnvilBroadcastedTxn(_path, i);
        }
        return txns;
    }

    // TODO(docs)
    function readAnvilBroadcastedTxn(string memory _path, uint256 _index) internal view returns (AnvilBroadcastedTxn memory) {
        string memory deployData = vm.readFile(_path);
        string memory key = string(abi.encodePacked(".transactions[", vm.toString(_index), "]"));
        bytes32 hash = vm.parseJsonBytes32(deployData, string(abi.encodePacked(key, ".hash")));
        string memory opcode = vm.parseJsonString(deployData, string(abi.encodePacked(key, ".transactionType")));
        string memory contractName = vm.parseJsonString(deployData, string(abi.encodePacked(key, ".contractName")));
        string memory functionSig = vm.parseJsonString(deployData, string(abi.encodePacked(key, ".function")));
        // TODO(docs): we can't use vm.parseJsonStringArray because the `arguments` value in the JSON may be `null`.
        bytes memory argumentsBytes = vm.parseJson(deployData, string(abi.encodePacked(key, ".arguments")));
        string[] memory arguments = argumentsBytes.length == 32 && bytes32(argumentsBytes) == bytes32(0) ? new string[](0) : vm.parseJsonStringArray(deployData, string(abi.encodePacked(key, ".arguments")));
        RawTx1559Detail memory txDetail = abi.decode(vm.parseJson(deployData, string(abi.encodePacked(key, ".transaction"))), (RawTx1559Detail));
        address[] memory additionalContracts = vm.parseJsonAddressArray(deployData, string(abi.encodePacked(key, ".additionalContracts")));
        bool isFixedGasLimit = vm.parseJsonBool(deployData, string(abi.encodePacked(key, ".isFixedGasLimit")));
        return AnvilBroadcastedTxn({
            additionalContracts: additionalContracts,
            arguments: arguments,
            contractAddress: txDetail.to,
            contractName: contractName,
            functionSig: functionSig,
            hash: hash,
            isFixedGasLimit: isFixedGasLimit,
            txDetail: txDetail,
            opcode: opcode
        });
    }
}
