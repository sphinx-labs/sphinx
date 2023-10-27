// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { MyImportContract } from "./ImportContract.sol";
import { ExternalContract } from "../../../../testExternalContracts/ExternalContract.sol";
import { IExternalContract } from "../../../../testExternalContracts/IExternalContract.sol";
import {
    ExternalContract as AliasedExternalContract
} from "../../../../testExternalContracts/ExternalContract.sol";

contract LocalContract {
    uint256 public number;

    constructor(uint256 _number) {
        number = _number;
    }
}

contract FunctionContract {
    MyImportContract public importContract;
    LocalContract public localContract;
    ExternalContract public externalContract;
    IExternalContract public iExternalContract;
    AliasedExternalContract public conflictingExternalContract;

    constructor(
        MyImportContract _importContract,
        LocalContract _localContract,
        ExternalContract _externalContract,
        IExternalContract _iExternalContract,
        AliasedExternalContract _conflictingExternalContract
    ) {
        importContract = _importContract;
        localContract = _localContract;
        externalContract = _externalContract;
        iExternalContract = _iExternalContract;
        conflictingExternalContract = _conflictingExternalContract;
    }

    function setImportContract(MyImportContract _importContract) public {
        importContract = _importContract;
    }

    function setLocalContract(LocalContract _localContract) public {
        localContract = _localContract;
    }

    function fetchImportContract() public pure returns (MyImportContract) {
        return MyImportContract(address(10));
    }

    function fetchLocalContract() public pure returns (LocalContract) {
        return LocalContract(address(11));
    }
}
