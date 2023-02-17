// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract TransparentUpgradableV2 is Initializable, OwnableUpgradeable {
    int public originalInt;
    int public newInt;
}
