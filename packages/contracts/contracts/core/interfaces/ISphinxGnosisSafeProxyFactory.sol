// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import { GnosisSafeVersion } from "../SphinxDataTypes.sol";

interface ISphinxGnosisSafeProxyFactory {
    event DeployedGnosisSafeWithModule(
        address indexed safeProxy,
        address indexed moduleProxy,
        uint256 saltNonce,
        address safeSingleton,
        GnosisSafeVersion safeVersion
    );
}
