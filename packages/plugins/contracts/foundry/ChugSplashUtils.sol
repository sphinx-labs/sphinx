// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import { Test } from "forge-std/Test.sol";
import { StdStyle } from "forge-std/StdStyle.sol";
import {
    ChugSplashActionBundle,
    ChugSplashTargetBundle
} from "@chugsplash/contracts/contracts/ChugSplashDataTypes.sol";
import { ConfigCache, MinimalConfig, DeployContractCost } from "./ChugSplashPluginTypes.sol";

contract ChugSplashUtils is Test {
    // These provide an easy way to get structs off-chain via the ABI.
    function actionBundle() external pure returns (ChugSplashActionBundle memory) {}

    function targetBundle() external pure returns (ChugSplashTargetBundle memory) {}

    function configCache() external pure returns (ConfigCache memory) {}

    function minimalConfig() external pure returns (MinimalConfig memory) {}

    function deployContractCosts() external pure returns (DeployContractCost[] memory) {}

    function slice(
        bytes calldata _data,
        uint256 _start,
        uint256 _end
    ) external pure returns (bytes memory) {
        return _data[_start:_end];
    }

    // Provides an easy way to get the EOA that's signing transactions in a Forge script. When a
    // user specifies a signer in a Forge script, the address is only available in the context of an
    // an external call.The easiest way to reliably retrieve the address is to call an external
    // function that returns the msg.sender.
    function msgSender() external view returns (address) {
        return msg.sender;
    }
}
