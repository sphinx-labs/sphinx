// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ExternalContract} from "../../../../testExternalContracts/ConflictingExternalContract.sol";

contract ConflictingContractInput {
    ExternalContract public externalContract;

    constructor(ExternalContract _externalContract) {
        externalContract = _externalContract;
    }
}
