// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { console } from "sphinx-forge-std/console.sol";
import { Vm } from "sphinx-forge-std/Vm.sol";
import { Script } from "sphinx-forge-std/Script.sol";
import { Test } from "sphinx-forge-std/Test.sol";
import { SphinxClient, SphinxConfig } from "../../client/SphinxClient.sol";
import { MyContract1Client } from "../../client/MyContracts.c.sol";
import { MyContract1 } from "../../contracts/test/MyContracts.sol";
import { Network } from "../../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxTestUtils } from "../../contracts/test/SphinxTestUtils.sol";
import { SphinxUtils } from "../../contracts/foundry/SphinxUtils.sol";

contract Idempotence_Script is Script, SphinxClient, Test, SphinxTestUtils {
    MyContract1 myContract;

    SphinxUtils sphinxUtils;

    constructor() {
        sphinxUtils = new SphinxUtils();

        sphinxConfig.projectName = "DefaultMode";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;

        // We get the address here because we need the contract's address before the `deploy`
        // function is called, which is normally where we would assign its address.
        myContract = MyContract1(sphinxAddress(
            sphinxConfig,
            "MyContract1"
        ));
    }

    function deploy(Network _network) public override sphinx(_network) {
        MyContract1Client myContractClient = deployMyContract1(0, 0, address(0), address(0));
        myContractClient.incrementUint();
        myContractClient.incrementUint();
        myContractClient.incrementUint();

        // Sanity check that the client's address matches the address that we retrieved in the
        // constructor of this contract.
        assertEq(address(myContractClient), address(myContract));
    }
}

contract Idempotence_Test is Idempotence_Script {
    function test_in_process_deploy_success() external {
        assertEq(address(myContract).code.length, 0);
        deploy(Network.anvil);
        assertEq(myContract.uintArg(), 3);
    }

    function test_in_process_idempotence_success() external {
        assertEq(address(myContract).code.length, 0);
        deploy(Network.anvil);
        deploy(Network.anvil);
        deploy(Network.anvil);
        assertEq(myContract.uintArg(), 3);
    }

    function test_chainid_deploy_success() external {
        vm.chainId(5);
        assertEq(address(myContract).code.length, 0);
        deploy(Network.goerli);
        assertEq(myContract.uintArg(), 3);
    }

    function test_chainid_idempotence_success() external {
        vm.chainId(420);
        assertEq(address(myContract).code.length, 0);
        deploy(Network.optimism_goerli);
        deploy(Network.optimism_goerli);
        deploy(Network.optimism_goerli);
        assertEq(myContract.uintArg(), 3);
    }
}

contract ForkIdempotence_Test is Idempotence_Script {

    function test_fork_deploy_success() external {
        vm.createSelectFork("ethereum", uint(0));
        assertEq(address(myContract).code.length, 0);
        deploy(Network.ethereum);
        assertEq(myContract.uintArg(), 3);
    }

    function test_fork_idempotence_success() external {
        vm.createSelectFork("goerli", uint(0));
        assertEq(address(myContract).code.length, 0);
        deploy(Network.goerli);
        deploy(Network.goerli);
        deploy(Network.goerli);
        assertEq(myContract.uintArg(), 3);
    }

    function test_fork_multichain_idempotence_success() external {
        vm.createSelectFork("optimism", uint(0));
        assertEq(address(myContract).code.length, 0);
        deploy(Network.optimism);
        deploy(Network.optimism);
        deploy(Network.optimism);
        assertEq(myContract.uintArg(), 3);

        vm.createSelectFork("optimism_goerli", uint(0));
        assertEq(address(myContract).code.length, 0);
        deploy(Network.optimism_goerli);
        deploy(Network.optimism_goerli);
        deploy(Network.optimism_goerli);
        assertEq(myContract.uintArg(), 3);
    }
}
