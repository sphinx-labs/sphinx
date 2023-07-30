export const getSampleContractFile = (solcVersion: string) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

contract HelloSphinx {
    uint8 public number;
    address public contractOne;

    constructor(uint8 _number, address _contractOne) {
        number = _number;
        contractOne = _contractOne;
    }

    function increment() public {
        number += 1;
    }
}
`
}

export const getSampleFoundryTestFile = (
  solcVersion: string,
  configPath: string
) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

import { Sphinx } from "@sphinx-labs/plugins/Sphinx.sol";
import { Test } from "forge-std/Test.sol";
import { HelloSphinx } from "../contracts/HelloSphinx.sol";

contract HelloSphinxTest is Sphinx, Test {
    HelloSphinx firstContract;
    HelloSphinx secondContract;

    string configPath = "${configPath}";
    string projectName = "MyProject";

    function setUp() public {
        // Deploys the contracts in the project
        deploy(configPath, vm.rpcUrl("anvil"));

        // Gets the deployed contracts
        firstContract = HelloSphinx(getAddress(configPath, "ContractOne"));
        secondContract = HelloSphinx(getAddress(configPath, "ContractTwo"));
    }

    function testFirstConstructor() public {
        assertEq(firstContract.number(), 1);
        assertEq(address(firstContract), firstContract.contractOne());
    }

    function testSecondConstructor() public {
        assertEq(secondContract.number(), 2);
        assertEq(address(firstContract), secondContract.contractOne());
    }

    function testIncrementFirstContract() public {
        firstContract.increment();
        assertEq(firstContract.number(), 2);
    }

    function testIncrementSecondContract() public {
        secondContract.increment();
        assertEq(secondContract.number(), 3);
    }
}
`
}
