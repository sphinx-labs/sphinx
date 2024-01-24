import { relative } from 'path'

export const getSampleContractFile = () => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HelloSphinx {
    string public greeting;
    uint public number;

    constructor(string memory _greeting, uint _number) {
        greeting = _greeting;
        number = _number;
    }

    function add(uint256 _myNum) public {
        number += _myNum;
    }
  }
`
}

export const getSampleScriptFile = (
  owner: string,
  orgId: string,
  scriptDirPath: string,
  srcDirPath: string
) => {
  // Get the relative path from the test directory to the scripts directory. Note that this also
  // strips the trailing path separator ('/') from the contract directory path (if it exists), which
  // is necessary to avoid a trailing double slash in the import path for the HelloSphinx contract.
  // In other words, if the script directory path is 'scripts/', then the relative path won't
  // include the trailing slash, which is what we want.
  const relativeSrcPath = relative(scriptDirPath, srcDirPath)

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { HelloSphinx } from "${relativeSrcPath}/HelloSphinx.sol";
import "@sphinx-labs/plugins/SphinxPlugin.sol";

contract HelloSphinxScript is Sphinx {
    HelloSphinx helloSphinx;

    function setUp() public virtual {
        sphinxConfig.owners = [${owner}];
        sphinxConfig.orgId = "${orgId}";
        sphinxConfig.threshold = 1;
        sphinxConfig.projectName = "My_First_Project";
        sphinxConfig.testnets = [
            Network.sepolia,
            Network.optimism_sepolia,
            Network.arbitrum_sepolia
        ];
    }

    function run() public sphinx {
        // Set the \`CREATE2\` salt to be the hash of the owner(s). Prevents
        // address collisions.
        bytes32 salt = keccak256(abi.encode(sphinxConfig.owners));
        helloSphinx = new HelloSphinx{ salt: salt }("Hi", 2);
        helloSphinx.add(8);
    }
}
`
}

export const getSampleFoundryTestFile = (
  testDirPath: string,
  scriptDirPath: string
) => {
  // Get the relative path from the test directory to the scripts directory. Note that this also
  // strips the trailing path separator ('/') from the contract directory path (if it exists), which
  // is necessary to avoid a trailing double slash in the import path for the HelloSphinx contract.
  // In other words, if the script directory path is 'scripts/', then the relative path won't
  // include the trailing slash, which is what we want.
  const relativeScriptPath = relative(testDirPath, scriptDirPath)

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import { HelloSphinxScript } from "${relativeScriptPath}/HelloSphinx.s.sol";

contract HelloSphinxTest is Test, HelloSphinxScript {
    function setUp() public override {
        HelloSphinxScript.setUp();
        run();
    }

    function testDidDeploy() public {
        assertEq(helloSphinx.greeting(), "Hi");
        assertEq(helloSphinx.number(), 10);
    }

    function testAdd() public {
        helloSphinx.add(1);
        assertEq(helloSphinx.number(), 11);
    }
}
`
}
