// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { Proxy } from "./libraries/Proxy.sol";

/**
 * @title DeterministicProxyOwner
 */
contract DeterministicProxyOwner is Initializable {
    function initializeProxy(
        address payable _proxy,
        address _implementation,
        address _newOwner
    ) external initializer {
        Proxy(_proxy).upgradeTo(_implementation);
        Proxy(_proxy).changeAdmin(_newOwner);
    }
}
