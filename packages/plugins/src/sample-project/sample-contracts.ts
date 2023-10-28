import { relative, resolve } from 'path'

// TODO: update the sample contracts to not use clients.

export const getSampleContractFile = (solcVersion: string) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

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
  solcVersion: string,
  scriptDirPath: string,
  srcDirPath: string
) => {
  // Get the relative path from the test directory to the scripts directory. Note that this also
  // strips the trailing path separator ('/') from the contract directory path (if it exists), which
  // is necessary to avoid a trailing double slash in the import path for the HelloSphinx contract.
  // In other words, if the script directory path is 'scripts/', then the relative path won't
  // include the trailing slash, which is what we want.
  const relativeSphinxClientPath = relative(scriptDirPath, resolve('client/'))
  const relativeSrcPath = relative(scriptDirPath, srcDirPath)

  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

import { HelloSphinx } from "${relativeSrcPath}/HelloSphinx.sol";
import { SphinxClient } from "${relativeSphinxClientPath}/SphinxClient.sol";

contract HelloSphinxScript is SphinxClient {
    HelloSphinx helloSphinx;

    function setUp() public virtual {
        sphinxConfig.projectName = "Hello Sphinx";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;
    }

    function run() public override sphinx {
        helloSphinx = deployHelloSphinx("Hi!", 2);
        helloSphinx.add(8);
    }
}
`
}

// TODO: it'd be nice if we could redo the non-standard `setUp` function below. a little weird how
// we call `HelloSphinxScript.setUp()`.

export const getSampleFoundryTestFile = (
  solcVersion: string,
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
pragma solidity ^${solcVersion};

import "forge-std/Test.sol";
import { HelloSphinxScript } from "${relativeScriptPath}/HelloSphinx.s.sol";

contract HelloSphinxTest is Test, HelloSphinxScript {
    function setUp() public override {
        HelloSphinxScript.setUp();
        run();
    }

    function testDidDeploy() public {
        assertEq(helloSphinx.greeting(), "Hi!");
        assertEq(helloSphinx.number(), 10);
    }

    function testAdd() public {
        helloSphinx.add(1);
        assertEq(helloSphinx.number(), 11);
    }
}
`
}
