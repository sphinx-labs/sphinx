export const getSampleContractFile = (solcVersion: string) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

contract HelloSphinx {
  uint8 public number;
  bool public stored;
  address public otherStorage;
  string public storageName;

  constructor(uint8 _number, bool _stored, address _otherStorage, string memory _storageName) {
    number = _number;
    stored = _stored;
    otherStorage = _otherStorage;
    storageName = _storageName;
  }
}
`
}

export const getSampleFoundryDeployFile = (
  solcVersion: string,
  configPath: string
) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

import "@sphinx/plugins/Sphinx.sol";

contract SphinxDeploy is Sphinx {
  function run() public {
    uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
    vm.startBroadcast(deployerPrivateKey);
    deploy('${configPath}', vm.rpcUrl("anvil"));
    vm.stopBroadcast();
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

import "@sphinx/plugins/Sphinx.sol";
import { HelloSphinx } from "../src/HelloSphinx.sol";
import "forge-std/Test.sol";

contract HelloSphinxTest is Sphinx, Test {
  HelloSphinx helloSphinx;
  function setUp() public {
    silence();
    deploy('${configPath}', vm.rpcUrl("anvil"));
    helloSphinx = HelloSphinx(getAddress('${configPath}', "MyFirstContract"));
  }

  function testSetNumber() public {
    assertEq(helloSphinx.number(), 1);
  }

  function testBool() public {
    assertEq(helloSphinx.stored(), true);
  }

  function testAddress() public {
    assertEq(helloSphinx.storageName(), 'First');
  }

  function testString() public {
    assertEq(helloSphinx.otherStorage(), address(0x1111111111111111111111111111111111111111));
  }
}
`
}
