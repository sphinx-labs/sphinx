// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Vm } from "sphinx-forge-std/Vm.sol";
import { Script } from "sphinx-forge-std/Script.sol";
import { Test } from "sphinx-forge-std/Test.sol";
import {
    ISphinxAuthFactory
} from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuthFactory.sol";
import { AuthState, AuthStatus } from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";

import { ISphinxSemver } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxSemver.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { ISphinxAuth } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import { ISphinxRegistry } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxRegistry.sol";
import {
    ISphinxAccessControlEnumerable
} from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAccessControlEnumerable.sol";

import { SphinxClient, SphinxConfig, Version } from "../../client/SphinxClient.sol";
import { Network, DeployOptions, NetworkInfo, OptionalAddress, BundleInfo } from "../../contracts/foundry/SphinxPluginTypes.sol";
import { MyContract1, MyOwnable } from "../../contracts/test/MyContracts.sol";
import { SphinxConstants } from "../../contracts/foundry/SphinxConstants.sol";
import { SphinxTestUtils } from "../../contracts/test/SphinxTestUtils.sol";
import { SphinxUtils } from "../../contracts/foundry/SphinxUtils.sol";

/**
 * @notice Tests the proposal logic for the Sphinx plugin. This test suite is executed from
 *         `run-proposal-tests.sh`.
 */
abstract contract AbstractProposal_Test is SphinxClient, Test {

    address finalOwner = address(0x200);

    SphinxTestUtils testUtils;
    SphinxUtils sphinxUtils;

    Network[] initialTestnets = [Network.goerli, Network.optimism_goerli];

    MyOwnable ownable;

    ISphinxAuth auth;
    ISphinxManager manager;

    address proposer = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;

    constructor() {
        sphinxUtils = new SphinxUtils();
        vm.makePersistent(address(sphinxUtils));

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
        sphinxConfig.testnets = initialTestnets;
        sphinxConfig.orgId = "1111";

        testUtils = new SphinxTestUtils();
        vm.makePersistent(address(testUtils));

        // Proposal setup
        bytes32 proposerPrivateKey = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;
        vm.setEnv(
            "PROPOSER_PRIVATE_KEY",
            vm.toString(proposerPrivateKey)
        );

        auth = ISphinxAuth(sphinxUtils.getSphinxAuthAddress(sphinxConfig));
        manager = ISphinxManager(sphinxManager(sphinxConfig));

        // We must set the address here because the `run` function is not called in this process.
        // Instead, it's called during the collection phase, which occurs in a separate process
        // that's invoked by TypeScript before this process is executed.
        ownable = MyOwnable(sphinxAddress(
            sphinxConfig, "MyOwnable"
        ));
    }

    function assertAuthContractInitialized() internal {
        ISphinxAccessControlEnumerable authAccessControl = ISphinxAccessControlEnumerable(address(auth));
        assertEq(authAccessControl.getRoleMemberCount(bytes32(0)), sphinxConfig.owners.length);
        for (uint j = 0; j < sphinxConfig.owners.length; j++) {
            assertTrue(authAccessControl.hasRole(bytes32(0), sphinxConfig.owners[j]));
        }
        assertEq(auth.projectName(), sphinxConfig.projectName);
        assertEq(
            address(auth.manager()),
            address(manager)
        );
        assertEq(auth.threshold(), sphinxConfig.threshold);
        assertTrue(authAccessControl.hasRole(keccak256("ProposerRole"), proposer));
    }

    function assertAuthBundleCompleted(uint256 _expectedNumLeafs, bytes32 _authRoot) internal {
        assertTrue(auth.firstProposalOccurred());
        (AuthStatus status, uint256 leafsExecuted, uint256 numLeafs) = auth.authStates(_authRoot);
        assertEq(uint8(status), uint8(AuthStatus.COMPLETED));
        assertEq(numLeafs, _expectedNumLeafs);
        assertEq(leafsExecuted, numLeafs);
        assertFalse(manager.isExecuting());
    }

    function initialDeployment() internal {
        deployMyOwnable(address(manager), 500);
        ownable.set(8);
        ownable.increment();
        ownable.increment();
        ownable.transferOwnership(finalOwner);
    }
}

/**
 * @notice Tests a proposal for a project that has not been deployed on any network yet.
 */
contract Proposal_Initial_Test is AbstractProposal_Test, Script, SphinxConstants {

    // This is called by our TypeScript logic. It's not called in the Forge test.
    function run() public override virtual sphinx {
        initialDeployment();
    }

    function test_initial_proposal() public {
        bytes32 authRoot = vm.envBytes32("AUTH_ROOT");

        uint256[] memory forkIds = this.sphinxSimulateProposal({
            _testnets: true,
            _authRoot: authRoot,
            _bundleInfoArray: abi.decode(vm.envBytes("BUNDLE_INFO_ARRAY"), (BundleInfo[]))
        });

        assertEq(forkIds.length, sphinxConfig.testnets.length);
        assertEq(sphinxConfig.testnets.length, 2);

        for (uint256 i = 0; i < sphinxConfig.testnets.length; i++) {
            Network network = sphinxConfig.testnets[i];
            vm.selectFork(forkIds[i]);

            // Check that we're on the correct network. In other words, check that the active fork's
            // chain ID matches the expected testnet's chain ID.
            assertEq(block.chainid, sphinxUtils.getNetworkInfo(network).chainId);

            assertAuthContractInitialized();

            // Three leafs were executed: `setup`, `propose`, and `approveDeployment`.
            assertAuthBundleCompleted(3, authRoot);

            // Check that the contract was deployed correctly.
            assertEq(ownable.value(), 10);
            assertEq(ownable.owner(), finalOwner);
        }
    }
}

/**
 * @notice Tests a proposal for a project that was previously deployed. In this test, a contract
 *         is added to the project, then a new proposal is created. This occurs
 *         on the same networks that the project was previously deployed on.
 */
contract Proposal_AddContract_Test is AbstractProposal_Test, Script, SphinxConstants {

    MyContract1 myNewContract;

    function setUp() external {
        myNewContract = MyContract1(sphinxAddress(
            sphinxConfig, "MyNewContract"
        ));
    }

    function run() public override sphinx {
        deployMyContract1(5, 6, address(7), address(8), DeployOptions({salt: bytes32(0), referenceName: "MyNewContract"}));
    }

    function test_add_contract_between_proposals() external {
        bytes32 authRoot = vm.envBytes32("AUTH_ROOT");
        uint256[] memory forkIds = this.sphinxSimulateProposal({
            _testnets: true,
            _authRoot: authRoot,
            _bundleInfoArray: abi.decode(vm.envBytes("BUNDLE_INFO_ARRAY"), (BundleInfo[]))
        });

        assertEq(forkIds.length, sphinxConfig.testnets.length);
        assertEq(sphinxConfig.testnets.length, 2);

        for (uint256 i = 0; i < forkIds.length; i++) {
            vm.selectFork(forkIds[i]);

            // Check that we're on the correct network. In other words, check that the active fork's
            // chain ID matches the expected testnet's chain ID.
            assertEq(block.chainid, sphinxUtils.getNetworkInfo(sphinxConfig.testnets[i]).chainId);

            // Two leafs were executed: `propose` and `approveDeployment`
            assertAuthBundleCompleted(2, authRoot);

            // Check that the contract was deployed correctly.
            assertEq(myNewContract.intArg(), 5);
            assertEq(myNewContract.uintArg(), 6);
            assertEq(myNewContract.addressArg(), address(7));
            assertEq(myNewContract.otherAddressArg(), address(8));
        }
    }
}

/**
 * @notice Tests a proposal for a project that was previously deployed on some initial networks.
 *         In this test, a contract is added to the deployment, and an upgrade is performed to
 *         a new version of the SphinxManager and SphinxAuth contracts. Then, the project is
 *         proposed on the same networks that it was previously deployed on.
 */
contract Proposal_VersionUpgrade_Test is AbstractProposal_Test, Script, SphinxConstants {

    MyContract1 myNewContract;

    Version newVersion = Version({ major: 9, minor: 9, patch: 9 });

    function setUp() external {
        sphinxConfig.version = newVersion;

        myNewContract = MyContract1(sphinxAddress(
            sphinxConfig, "MyNewContract"
        ));
    }

    function run() public override virtual sphinx {
        deployMyContract1(5, 6, address(7), address(8), DeployOptions({salt: bytes32(0), referenceName: "MyNewContract"}));
    }

    function test_version_upgrade_proposal() external {
        address newAuthImplAddr = vm.envAddress("NEW_AUTH_IMPL_ADDR");
        address newManagerImplAddrStandard = vm.envAddress("NEW_MANAGER_IMPL_ADDR_STANDARD");
        address newManagerImplAddrOptimismGoerli = vm.envAddress("NEW_MANAGER_IMPL_ADDR_OPTIMISM_GOERLI");

        bytes32 authRoot = vm.envBytes32("AUTH_ROOT");
        uint256[] memory forkIds = this.sphinxSimulateProposal({
            _testnets: true,
            _authRoot: authRoot,
            _bundleInfoArray: abi.decode(vm.envBytes("BUNDLE_INFO_ARRAY"), (BundleInfo[]))
        });

        assertEq(forkIds.length, sphinxConfig.testnets.length);
        assertEq(sphinxConfig.testnets.length, 2);

        for (uint256 i = 0; i < sphinxConfig.testnets.length; i++) {
            Network network = sphinxConfig.testnets[i];
            vm.selectFork(forkIds[i]);

            // Check that the upgrade occurred
            Version memory authVersion = ISphinxSemver(address(auth)).version();
            Version memory managerVersion = ISphinxSemver(address(manager)).version();
            assertEq(authVersion.major, newVersion.major);
            assertEq(authVersion.minor, newVersion.minor);
            assertEq(authVersion.patch, newVersion.patch);
            assertEq(managerVersion.major, newVersion.major);
            assertEq(managerVersion.minor, newVersion.minor);
            assertEq(managerVersion.patch, newVersion.patch);
            bytes32 authImplBytes32 = vm.load(address(auth), testUtils.EIP1967_IMPLEMENTATION_KEY());
            bytes32 managerImplBytes32 = vm.load(address(manager), testUtils.EIP1967_IMPLEMENTATION_KEY());
            assertEq(newAuthImplAddr, address(uint160(uint256(authImplBytes32))));
            address newManagerImpl = network == Network.optimism_goerli ? newManagerImplAddrOptimismGoerli : newManagerImplAddrStandard;
            assertEq(newManagerImpl, address(uint160(uint256(managerImplBytes32))));

            // Check that we're on the correct network. In other words, check that the active fork's
            // chain ID matches the expected testnet's chain ID.
            assertEq(block.chainid, sphinxUtils.getNetworkInfo(sphinxConfig.testnets[i]).chainId);

            // Three leafs were executed: `propose`, `upgradeManagerAndAuth`, and
            // `approveDeployment`.
            assertAuthBundleCompleted(3, authRoot);

            // Check that the contract was deployed correctly.
            assertEq(myNewContract.intArg(), 5);
            assertEq(myNewContract.uintArg(), 6);
            assertEq(myNewContract.addressArg(), address(7));
            assertEq(myNewContract.otherAddressArg(), address(8));
        }
    }
}

/**
 * @notice Tests a proposal for a project that failed to be executed on some networks. This
 *         can occur when a deployment fails on-chain, e.g. if a user's constructor reverts.
 *         In this test, we propose a new deployment for the same project on the same networks.
 *         This new deployment should succeed.
 */
contract Proposal_CancelExistingDeployment_Test is AbstractProposal_Test, Script, SphinxConstants {

    MyContract1 myNewContract;

    function setUp() external {
        myNewContract = MyContract1(sphinxAddress(
            sphinxConfig, "MyNewContract"
        ));
    }


    function run() public override virtual sphinx {
        deployMyContract1(5, 6, address(7), address(8), DeployOptions({salt: bytes32(0), referenceName: "MyNewContract"}));
    }

    function test_cancel_existing_deployment_proposal() external {
        bytes32 authRoot = vm.envBytes32("AUTH_ROOT");
        uint256[] memory forkIds = this.sphinxSimulateProposal({
            _testnets: true,
            _authRoot: authRoot,
            _bundleInfoArray: abi.decode(vm.envBytes("BUNDLE_INFO_ARRAY"), (BundleInfo[]))
        });

        assertEq(forkIds.length, sphinxConfig.testnets.length);
        assertEq(sphinxConfig.testnets.length, 2);

        for (uint256 i = 0; i < sphinxConfig.testnets.length; i++) {
            Network network = sphinxConfig.testnets[i];
            vm.selectFork(forkIds[i]);

            // Check that we're on the correct network. In other words, check that the active fork's
            // chain ID matches the expected testnet's chain ID.
            assertEq(block.chainid, sphinxUtils.getNetworkInfo(network).chainId);

            // Three leafs were executed: `propose`, `cancelActiveDeployment`, and
            // `approveDeployment`.
            assertAuthBundleCompleted(3, authRoot);

            // Check that the contract was deployed correctly.
            assertEq(myNewContract.intArg(), 5);
            assertEq(myNewContract.uintArg(), 6);
            assertEq(myNewContract.addressArg(), address(7));
            assertEq(myNewContract.otherAddressArg(), address(8));
        }
    }
}
