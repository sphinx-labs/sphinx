// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Script } from "sphinx-forge-std/Script.sol";
import { MyLargeContract } from "../../../contracts/test/MyContracts.sol";
import { Sphinx } from "@sphinx-labs/contracts/contracts/foundry/Sphinx.sol";
import { Network } from "@sphinx-labs/contracts/contracts/foundry/SphinxPluginTypes.sol";

contract Simple is Script, Sphinx {
    function configureSphinx() public override {
        sphinxConfig.projectName = "Large_Project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;

        sphinxConfig.orgId = "test-org-id";
    }

    function run() public sphinx {
        new MyLargeContract{ salt: bytes32(uint(0)) }();
        new MyLargeContract{ salt: bytes32(uint(1)) }();
        new MyLargeContract{ salt: bytes32(uint(2)) }();
        new MyLargeContract{ salt: bytes32(uint(3)) }();
        new MyLargeContract{ salt: bytes32(uint(4)) }();
        new MyLargeContract{ salt: bytes32(uint(5)) }();
        new MyLargeContract{ salt: bytes32(uint(6)) }();
        new MyLargeContract{ salt: bytes32(uint(7)) }();
        new MyLargeContract{ salt: bytes32(uint(8)) }();
        new MyLargeContract{ salt: bytes32(uint(9)) }();
        new MyLargeContract{ salt: bytes32(uint(10)) }();
        new MyLargeContract{ salt: bytes32(uint(11)) }();
        new MyLargeContract{ salt: bytes32(uint(12)) }();
        new MyLargeContract{ salt: bytes32(uint(13)) }();
        new MyLargeContract{ salt: bytes32(uint(14)) }();
        new MyLargeContract{ salt: bytes32(uint(15)) }();
        new MyLargeContract{ salt: bytes32(uint(16)) }();
        new MyLargeContract{ salt: bytes32(uint(17)) }();
        new MyLargeContract{ salt: bytes32(uint(18)) }();
        new MyLargeContract{ salt: bytes32(uint(19)) }();
        new MyLargeContract{ salt: bytes32(uint(20)) }();
        new MyLargeContract{ salt: bytes32(uint(21)) }();
        new MyLargeContract{ salt: bytes32(uint(22)) }();
        new MyLargeContract{ salt: bytes32(uint(23)) }();
        new MyLargeContract{ salt: bytes32(uint(24)) }();
        new MyLargeContract{ salt: bytes32(uint(25)) }();
        new MyLargeContract{ salt: bytes32(uint(26)) }();
        new MyLargeContract{ salt: bytes32(uint(27)) }();
        new MyLargeContract{ salt: bytes32(uint(28)) }();
        new MyLargeContract{ salt: bytes32(uint(29)) }();
        new MyLargeContract{ salt: bytes32(uint(30)) }();
        new MyLargeContract{ salt: bytes32(uint(31)) }();
        new MyLargeContract{ salt: bytes32(uint(32)) }();
        new MyLargeContract{ salt: bytes32(uint(33)) }();
        new MyLargeContract{ salt: bytes32(uint(34)) }();
        new MyLargeContract{ salt: bytes32(uint(35)) }();
        new MyLargeContract{ salt: bytes32(uint(36)) }();
        new MyLargeContract{ salt: bytes32(uint(37)) }();
        new MyLargeContract{ salt: bytes32(uint(38)) }();
        new MyLargeContract{ salt: bytes32(uint(39)) }();
        new MyLargeContract{ salt: bytes32(uint(40)) }();
        new MyLargeContract{ salt: bytes32(uint(41)) }();
        new MyLargeContract{ salt: bytes32(uint(42)) }();
        new MyLargeContract{ salt: bytes32(uint(43)) }();
        new MyLargeContract{ salt: bytes32(uint(44)) }();
        new MyLargeContract{ salt: bytes32(uint(45)) }();
        new MyLargeContract{ salt: bytes32(uint(46)) }();
        new MyLargeContract{ salt: bytes32(uint(47)) }();
        new MyLargeContract{ salt: bytes32(uint(48)) }();
        new MyLargeContract{ salt: bytes32(uint(49)) }();
    }
}
