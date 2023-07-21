export const getSampleContractFile = (solcVersion: string) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

contract HelloSphinx {
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

import { Sphinx } from "@sphinx/plugins/Sphinx.sol";

contract SphinxDeploy is Sphinx {

    string configPath = "${configPath}";

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        deploy(configPath, vm.rpcUrl("anvil"));
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

import { Sphinx } from "@sphinx/plugins/Sphinx.sol";
import { Test } from "forge-std/Test.sol";
import { HelloSphinx } from "../contracts/HelloSphinx.sol";

contract HelloSphinxTest is Sphinx, Test {
    HelloSphinx helloSphinx;

    string configPath = "${configPath}";
    string contractName = "MyContract";

    function setUp() public {
        deploy(configPath,  vm.rpcUrl("anvil"));
        helloSphinx = HelloSphinx(getAddress(configPath, contractName));
    }

    function testSetNumber() public {
        assertEq(helloSphinx.number(), 1);
    }
}
`
}
