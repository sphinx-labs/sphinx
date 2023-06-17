export const getSampleContractFile = (solcVersion: string) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

contract HelloChugSplash {
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

import "@chugsplash/plugins/ChugSplash.sol";

contract ChugSplashDeploy is ChugSplash {
  function run() public {
    uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
    vm.startBroadcast(deployerPrivateKey);
    deploy('${configPath}', vm.rpcUrl("anvil"));
    vm.stopBroadcast();
  }
}
`
}

export const getSampleGenerateArtifactFile = (
  solcVersion: string,
  configPath: string
) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

import "@chugsplash/plugins/ChugSplash.sol";

contract ChugSplashGenerateArtifacts is ChugSplash {
  function setUp() public {
    generateArtifacts('${configPath}', vm.rpcUrl("anvil"));
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

import "@chugsplash/plugins/ChugSplash.sol";
import { HelloChugSplash } from "../src/HelloChugSplash.sol";
import "forge-std/Test.sol";

contract HelloChugSplashTest is ChugSplash {
  HelloChugSplash helloChugSplash;
  function setUp() public {
    silence();
    deploy('${configPath}', vm.rpcUrl("anvil"));
    helloChugSplash = HelloChugSplash(getAddress('${configPath}', "MyFirstContract"));
  }

  function testSetNumber() public {
    assertEq(helloChugSplash.number(), 1);
  }

  function testBool() public {
    assertEq(helloChugSplash.stored(), true);
  }

  function testAddress() public {
    assertEq(helloChugSplash.storageName(), 'First');
  }

  function testString() public {
    assertEq(helloChugSplash.otherStorage(), address(0x1111111111111111111111111111111111111111));
  }
}
`
}
