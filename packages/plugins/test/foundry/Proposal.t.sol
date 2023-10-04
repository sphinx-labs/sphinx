// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import { console } from "forge-std/console.sol";
import { Script } from "forge-std/Script.sol";
import { Test } from "forge-std/Test.sol";
import "forge-std/StdStorage.sol";
import {
    ISphinxAuthFactory
} from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuthFactory.sol";
import { AuthState, AuthStatus } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";

import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { ISphinxRegistry } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxRegistry.sol";
import { ISphinxAuth } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import {
    IAccessControlEnumerable
} from "@sphinx-labs/contracts/contracts/interfaces/IAccessControlEnumerable.sol";

import { SphinxClient, SphinxConfig, Version } from "../../SphinxClient/SphinxClient.sol";
import { Network, DeployOptions, SphinxMode } from "../../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1Client } from "../../SphinxClient/MyContracts.SphinxClient.sol";
import { MyContract1 } from "../../contracts/test/MyContracts.sol";
import { SphinxConstants } from "../../contracts/foundry/SphinxConstants.sol";

contract Proposal_Test is Script, SphinxClient, Test, SphinxConstants {
    using stdStorage for StdStorage;

    MyContract1 myContract;

    address authAddress;
    address managerAddress;
    bytes32 authRoot;
    uint256[] forkIds;

    address proposer = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;

    constructor() {
        sphinxConfig.projectName = "Multisig project";
        // Accounts #0-3 on Anvil
        sphinxConfig.owners = [
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
            0x90F79bf6EB2c4f870365E785982E1f101E93b906
        ];
        // Account #4 on Anvil
        sphinxConfig.proposers = [proposer];
        sphinxConfig.threshold = 3;
        sphinxConfig.testnets = [Network.goerli, Network.optimism_goerli];
        sphinxConfig.orgId = "1111";
    }

    function deploy(Network _network) public override virtual sphinx(_network) {
        console.log('upper deploy');
        MyContract1Client myContractClient = deployMyContract1(1, 2, address(3), address(4));

        myContract = MyContract1(address(myContractClient));
    }

    function setUp() public virtual {
        console.log('setting up');
        // Proposal setup
        bytes32 proposerPrivateKey = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;
        vm.setEnv(
            "PROPOSER_PRIVATE_KEY",
            vm.toString(proposerPrivateKey)
        );

        authAddress = sphinxUtils.getSphinxAuthAddress(
            sphinxConfig.owners,
            sphinxConfig.threshold,
            sphinxConfig.projectName
        );
        assertEq(authAddress.code.length, 0);
        managerAddress = sphinxUtils.getSphinxManagerAddress(
                sphinxConfig.owners,
                sphinxConfig.threshold,
                sphinxConfig.projectName
            );
        assertEq(managerAddress.code.length, 0);

        // TODO: just do this for upgrades
        // // Setup upgrades for the SphinxManager and SphinxAuth contracts.
        // address newSphinxManagerAddr = address(1234);
        // address newSphinxAuthAddr = address(5678);
        // sphinxUtils.deploySphinxManagerTo(newSphinxManagerAddr);
        // // Set the versions of the contracts to 9.9.9. We do this by mocking the `version()` function
        // // on these contracts, which is called by the SphinxRegistry and SphinxAuthFactory to determine
        // // the version of the contracts.
        // vm.mockCall(newSphinxManagerAddr, hex"", abi.encode(Version({major: 9, minor: 9, patch: 9})));
        // vm.mockCall(newSphinxAuthAddr, hex"", abi.encode(Version({major: 9, minor: 9, patch: 9})));
        // // Add new implementations as valid versions on the SphinxRegistry and SphinxAuthFactory.
        // console.log('TODO', authFactoryAddress.code.length);
        // console.log(authFactoryAddress);

        // ISphinxAuthFactory(authFactoryAddress).addVersion(newSphinxManagerAddr);
        // ISphinxRegistry(registryAddress).addVersion(newSphinxAuthAddr);

        (authRoot, forkIds) = this.sphinxProposeTask({
            _testnets: true,
            _proposalOutputPath: "./test-proposal-output.json"
        });
    }

    // TODO: rename all test functions in this file
    function test_1() public {
        IAccessControlEnumerable authAccessControl = IAccessControlEnumerable(authAddress);
        ISphinxAuth auth = ISphinxAuth(authAddress);
        ISphinxManager manager = ISphinxManager(managerAddress);

        assertEq(forkIds.length, sphinxConfig.testnets.length);

        for (uint256 idx = 0; idx < forkIds.length; idx++) {
            vm.selectFork(forkIds[idx]);

            // Check that the Auth contract has been initialized correctly.
            assertEq(authAccessControl.getRoleMemberCount(bytes32(0)), sphinxConfig.owners.length);
            for (uint i = 0; i < sphinxConfig.owners.length; i++) {
                assertTrue(authAccessControl.hasRole(bytes32(0), sphinxConfig.owners[i]));
            }
            assertEq(auth.projectName(), sphinxConfig.projectName);
            assertEq(
                address(auth.manager()),
                managerAddress
            );

            // TODO(docs): These are manually set with `vm.store` in the `Proposal` mode because...
            assertEq(auth.threshold(), 0);
            assertTrue(authAccessControl.hasRole(keccak256("ProposerRole"), proposer));

            // Check that the correct functions on the SphinxAuth contract were called.

            // Check that the Auth bundle was completed.
            assertTrue(auth.firstProposalOccurred());
            (AuthStatus status, uint256 leafsExecuted, uint256 numLeafs) = auth.authStates(authRoot);
            assertEq(uint8(status), uint8(AuthStatus.COMPLETED));
            // Three leafs were executed: `setup`, `propose`, and `approveDeployment`
            assertEq(leafsExecuted, 3);
            assertEq(leafsExecuted, numLeafs);
            assertFalse(manager.isExecuting());

            // Check that the contract was deployed correctly.
            assertEq(myContract.intArg(), 1);
            assertEq(myContract.uintArg(), 2);
            assertEq(myContract.addressArg(), address(3));
            assertEq(myContract.otherAddressArg(), address(4));
        }
    }
}

contract TODO_Thing is Proposal_Test {

    MyContract1 myNewContract;

    function deploy(Network _network) public override sphinx(_network) {
        console.log('lower deploy');
        MyContract1Client myNewContractClient = deployMyContract1(5, 6, address(7), address(8), DeployOptions({salt: bytes32(0), referenceName: "MyNewContract"}));
        myNewContract = MyContract1(address(myNewContractClient));
    }

    function test_2() external {
        // (authRoot, forkIds) = this.sphinxProposeTask({
        //     _testnets: true,
        //     _proposalOutputPath: "./test-proposal-output.json"
        // });

        assertTrue(true); // TODO
    }
}
