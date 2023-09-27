import { relative, resolve } from 'path'

export const getSampleContractFile = (solcVersion: string) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

contract HelloSphinx {
  string public greeting;
  string public name;
  uint public number;

  constructor(string memory _greeting, string memory _name, uint _number) {
      greeting = _greeting;
      name = _name;
      number = _number;
  }

  function add(uint _add) public {
      number += _add;
  }
}
`
}

export const getSampleFoundryConfigFile = (
  solcVersion: string,
  scriptDirPath: string,
  srcDirPath: string,
  quickstart: boolean
) => {
  // Get the relative path from the test directory to the scripts directory. Note that this also
  // strips the trailing path separator ('/') from the contract directory path (if it exists), which
  // is necessary to avoid a trailing double slash in the import path for the HelloSphinx contract.
  // In other words, if the script directory path is 'scripts/', then the relative path won't
  // include the trailing slash, which is what we want.
  const relativeSphinxClientPath = relative(
    scriptDirPath,
    resolve('SphinxClient/')
  )
  const relativeSrcPath = relative(scriptDirPath, srcDirPath)

  const sphinxImport = quickstart ? '@sphinx' : '@sphinx-labs/plugins'

  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

import { SphinxConfig, Network, DeployOptions, Version } from "${sphinxImport}/SphinxPluginTypes.sol";
import { SphinxClient } from "${relativeSphinxClientPath}/SphinxClient.sol";
import { Script, console } from "forge-std/Script.sol";
import { HelloSphinx } from "${relativeSrcPath}/HelloSphinx.sol";
import { HelloSphinxClient } from "${relativeSphinxClientPath}/HelloSphinx.SphinxClient.sol";

contract HelloSphinxConfig is Script, SphinxClient {
  HelloSphinx helloSphinx;

  string projectName = "TypeGenTest";
  string orgId = "";
  address[] owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
  address[] proposers;
  Network[] mainnets;
  Network[] testnets;
  uint256 threshold = 1;
  Version version = Version({ major: 0, minor: 2, patch: 4 });

  constructor()
      SphinxClient(
          SphinxConfig({
              projectName: projectName,
              orgId: orgId,
              owners: owners,
              proposers: proposers,
              mainnets: mainnets,
              testnets: testnets,
              threshold: threshold,
              version: version
          })
      )
  {}

  function deploy(Network _network) public override sphinxDeploy(_network) {
      HelloSphinxClient helloSphinxClient = deployHelloSphinx("Hello", "Bob", 0);
      helloSphinxClient.add(5);

      helloSphinx = HelloSphinx(address(helloSphinxClient));
  }

  function run() public {
      deploy(Network.anvil);
      string memory greeting = helloSphinx.greeting();
      string memory name = helloSphinx.name();
      console.log("%s, %s!", greeting, name);
  }
}`
}

export const getSampleFoundryTestFile = (
  solcVersion: string,
  testDirPath: string,
  scriptDirPath: string,
  quickstart: boolean
) => {
  // Get the relative path from the test directory to the scripts directory. Note that this also
  // strips the trailing path separator ('/') from the contract directory path (if it exists), which
  // is necessary to avoid a trailing double slash in the import path for the HelloSphinx contract.
  // In other words, if the script directory path is 'scripts/', then the relative path won't
  // include the trailing slash, which is what we want.
  const relativeScriptPath = relative(testDirPath, scriptDirPath)

  const sphinxImport = quickstart ? '@sphinx' : '@sphinx-labs/plugins'

  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

import "forge-std/Test.sol";
import { HelloSphinxConfig } from "${relativeScriptPath}/HelloSphinx.s.sol";
import { Network } from "${sphinxImport}/SphinxPluginTypes.sol";

contract HelloSphinxTest is Test, HelloSphinxConfig {
    function setUp() public {
        deploy(Network.anvil);
    }

    function testDidDeploy() public {
        assertEq(helloSphinx.greeting(), "Hello");
        assertEq(helloSphinx.name(), "Bob");
        assertEq(helloSphinx.number(), 5);
    }

    function testAdd() public {
        helloSphinx.add(5);
        assertEq(helloSphinx.number(), 10);
    }
}`
}
