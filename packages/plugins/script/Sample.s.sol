// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

 // TODO: remove unnecessary imports

import { ISphinxAuth } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import { ISphinxCreate3 } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxCreate3.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";


import { Vm } from "sphinx-forge-std/Vm.sol";
import { Script, console } from "sphinx-forge-std/Script.sol";
import { Sphinx } from "../contracts/foundry/Sphinx.sol";
import { SphinxUtils } from "../contracts/foundry/SphinxUtils.sol";
import { SphinxConfig, Version } from "../client/SphinxClient.sol";
import { Network, Label, DeploymentInfo } from "../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1 } from "../contracts/test/MyContracts.sol";
import { CREATE3 } from "solady/utils/CREATE3.sol";

contract Sample is Sphinx {

    MyContract1 myContract;

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code"))))); // TODO: undo

    SphinxUtils sphinxUtils;

    function setUp() public {
        sphinxConfig.projectName = "My Project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;
        sphinxConfig.proposers = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.testnets = [Network.optimism_goerli, Network.goerli];
        sphinxConfig.orgId = "asdf";
        sphinxUtils = new SphinxUtils();
        vm.makePersistent(address(sphinxUtils));

    }

    function run() public override sphinx {

        Network[] memory networks = sphinxConfig.testnets;
        for (uint256 i = 0; i < networks.length; i++) {
            Network network = networks[i];

            string memory networkName = sphinxUtils.getNetworkInfo(network).name;
            string memory rpcUrl = vm.rpcUrl(networkName);

            // Create a fork of the target network. This automatically sets the `block.chainid` to
            // the target chain (e.g. 1 for ethereum mainnet).
            vm.createSelectFork(rpcUrl);

            console.log(block.chainid);
            console.log(vm.activeFork());
            console.logBytes32(vm.load(address(0xA460E134B1925c980Da2E1930dc44eae4Fe026D5), 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc));

            ISphinxAuth auth = ISphinxAuth(sphinxUtils.getSphinxAuthAddress(sphinxConfig));
            ISphinxManager manager = ISphinxManager(sphinxManager());

            DeploymentInfo memory deploymentInfo;
            deploymentInfo.authAddress = address(auth);
            deploymentInfo.managerAddress = address(manager);
            deploymentInfo.chainId = block.chainid;
            deploymentInfo.newConfig = sphinxConfig;
            deploymentInfo.isLiveNetwork = false;
            deploymentInfo.initialState = sphinxUtils.getInitialChainState(auth, manager);

            // sphinxUtils.validateProposal(_proposer, network, sphinxConfig);
            // DeploymentInfo memory deploymentInfo = sphinxCollect(sphinxUtils.isLiveNetworkFFI(rpcUrl));
            // deploymentInfoArray[i] = deploymentInfo;

            // // Delete the labels. This ensures that we only use the necessary labels for each chain.
            // delete labels;
        }



        // TODO: undo
        // new MyContract1{ salt: bytes32(uint(1)) }(
        //     -1,
        //     2,
        //     address(1),
        //     address(2)
        // );
        // new MyContract1{ salt: bytes32(uint(2)) }(
        //     -1,
        //     2,
        //     address(1),
        //     address(2)
        // );
        // new MyContract1{ salt: bytes32(uint(3)) }(
        //     -1,
        //     2,
        //     address(1),
        //     address(2)
        // );

        // bytes memory initCode = abi.encodePacked(type(MyContract1).creationCode, abi.encode(1, 2, address(1), address(2)));
        // address deployed = CREATE3.deploy(bytes32(0), initCode, 0);
        // sphinxLabel(deployed, "contracts/test/MyContracts.sol:MyContract1");
    }
}
