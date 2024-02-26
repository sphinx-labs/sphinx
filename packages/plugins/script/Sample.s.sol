// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script, console} from "sphinx-forge-std/Script.sol";
import {Sphinx} from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import {Network} from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";
import {MyContract1} from "../contracts/test/MyContracts.sol";
import {CREATE3} from "solady/utils/CREATE3.sol";

contract ContractA {
    function init(address _addr) external {}
}
contract ContractB {
    function init(address _addr) external {}
}

contract Sample is Sphinx {

    function setUp() public {
        sphinxConfig.mainnets = [Network.ethereum, Network.polygon];
        // Other config options:
        // ...
    }

    // npx sphinx propose <path/to/script> --networks testnets

    function run() public sphinx {
        // Pre-compute the `CREATE2` addresses of ContractA and ContractB.
        ContractA contractA = vm.computeCreate2Address({
            salt: bytes32(0),
            initCodeHash: type(ContractA).creationCode,
            deployer: CREATE2_FACTORY
        });
        ContractB contractB = vm.computeCreate2Address({
            salt: bytes32(0),
            initCodeHash: type(ContractB).creationCode,
            deployer: CREATE2_FACTORY
        });

        // Execute the transactions on Ethereum
        vm.createSelectFork("ethereum");
        new ContractA{ salt: bytes32(0) }();
        uint256 returnDataChainA = contractA.init(address(contractB));

        // Execute the transactions on Polygon
        vm.createSelectFork("polygon");
        new ContractB{ salt: bytes32(0) }();
        contractB.init(address(contractA));
        // Use the value from Ethereum as a parameter to a setter function on Polygon
        contractB.set(returnDataChainA);
    }
}
