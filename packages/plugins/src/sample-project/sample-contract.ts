export const getSampleContractFile = (solcVersion: string) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

contract HelloChugSplash {
    uint8 public number;

    constructor(uint8 _number) {
        number = _number;
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

import { ChugSplash } from "@chugsplash/plugins/ChugSplash.sol";

contract ChugSplashDeploy is ChugSplash {

    string configPath = "${configPath}";
    string projectName = "MyFirstProject";

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        deploy(configPath, projectName, vm.rpcUrl("anvil"));
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

import { ChugSplash } from "@chugsplash/plugins/ChugSplash.sol";
import { Test } from "forge-std/Test.sol";
import { HelloChugSplash } from "../contracts/HelloChugSplash.sol";

contract HelloChugSplashTest is ChugSplash, Test {
    HelloChugSplash helloChugSplash;

    string configPath = "${configPath}";
    string projectName = "MyFirstProject";
    string contractName = "MyContract";

    function setUp() public {
        deploy(configPath, projectName, vm.rpcUrl("anvil"));
        helloChugSplash = HelloChugSplash(getAddress(configPath, projectName, contractName));
    }

    function testSetNumber() public {
        assertEq(helloChugSplash.number(), 1);
    }
}
`
}
