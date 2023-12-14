// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.9.0;

interface IEnum {
    // This needs to be a different name from Gnosis Safe's `Enum.sol` to avoid an "Identifier already
    // declared" compiler error.
    enum GnosisSafeOperation {
        Call,
        DelegateCall
    }
}
