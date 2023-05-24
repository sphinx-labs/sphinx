// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { HelloChugSplash } from "./HelloChugSplash.sol";
import "hardhat/console.sol";

contract Deploy {
    address public constant deployer = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function deploy() external {
        bytes memory creationCode = type(HelloChugSplash).creationCode;
        bytes memory data = bytes.concat(bytes32(0), creationCode);
        (bool success, ) = deployer.call(data);
        require(success);
        require(address(0x8E76baBBDFcD49c770a606eB0527FD38F896ed36).code.length > 0);
        console.log('success!');
    }
}
