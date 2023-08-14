import { relative } from 'path'

export const getSampleContractFile = (solcVersion: string) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

contract HelloSphinx {
    uint8 public myNumber;
    address public myAddress;

    constructor(uint8 _myNumber, address _myAddress) {
        myNumber = _myNumber;
        myAddress = _myAddress;
    }

    function increment() public {
        myNumber += 1;
    }
}
`
}

export const getSampleFoundryTestFile = (
  solcVersion: string,
  configPath: string,
  contractDirPath: string,
  testDirPath: string,
  quickstart: boolean
) => {
  // Get the relative path from the test directory to the contracts directory. Note that this also
  // strips the trailing path separator ('/') from the contract directory path (if it exists), which
  // is necessary to avoid a trailing double slash in the import path for the HelloSphinx contract.
  // In other words, if the contract directory path is 'contracts/', then the relative path won't
  // include the trailing slash, which is what we want.
  const relativePath = relative(testDirPath, contractDirPath)

  const sphinxImport = quickstart ? '@sphinx' : '@sphinx-labs/plugins'

  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

import { Sphinx } from "${sphinxImport}/Sphinx.sol";
import { Test } from "forge-std/Test.sol";
import { HelloSphinx } from "${relativePath}/HelloSphinx.sol";

contract HelloSphinxTest is Sphinx, Test {
    HelloSphinx firstContract;
    HelloSphinx secondContract;

    // Path from the project root to the Sphinx config file to deploy
    string configPath = "${configPath}";

    string projectName = "MyProject";

    function setUp() public {
        // Deploys the contracts in the project
        deploy(configPath, vm.rpcUrl("anvil"));

        // Gets the deployed contracts
        firstContract = HelloSphinx(getAddress(configPath, "MyFirstContract"));
        secondContract = HelloSphinx(getAddress(configPath, "MySecondContract"));
    }

    function testFirstConstructor() public {
        assertEq(firstContract.myNumber(), 1);
        assertEq(address(firstContract), firstContract.myAddress());
    }

    function testSecondConstructor() public {
        assertEq(secondContract.myNumber(), 2);
        assertEq(address(secondContract), secondContract.myAddress());
    }

    function testIncrementFirstContract() public {
        firstContract.increment();
        assertEq(firstContract.myNumber(), 2);
    }

    function testIncrementSecondContract() public {
        secondContract.increment();
        assertEq(secondContract.myNumber(), 3);
    }
}
`
}
