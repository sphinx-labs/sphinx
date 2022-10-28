// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {
    ChugSplashAction,
    ChugSplashActionType,
    ChugSplashBundleState,
    ChugSplashBundleStatus
} from "../contracts/ChugSplashDataTypes.sol";
import { Test, stdStorage, StdStorage } from "forge-std/Test.sol";
import { Proxy } from "../contracts/libraries/Proxy.sol";
import { ChugSplashManager } from "../contracts/ChugSplashManager.sol";
import { ChugSplashRegistry } from "../contracts/ChugSplashRegistry.sol";
import { ChugSplashBootLoader } from "../contracts/ChugSplashBootLoader.sol";
import { ProxyUpdater } from "../contracts/ProxyUpdater.sol";
import { DefaultAdapter } from "../contracts/adapters/DefaultAdapter.sol";
import { Create2 } from "../contracts/libraries/Create2.sol";

contract ChugSplashManager_Test is Test {
    using stdStorage for StdStorage;

    event ChugSplashBundleProposed(
        bytes32 indexed bundleId,
        bytes32 bundleRoot,
        uint256 bundleSize,
        string configUri
    );

    event ChugSplashBundleApproved(bytes32 indexed bundleId);

    event ChugSplashBundleCancelled(
        bytes32 indexed bundleId,
        address indexed owner,
        uint256 actionsExecuted
    );

    event ProxyOwnershipTransferred(
        string indexed targetHash,
        address indexed proxy,
        bytes32 indexed proxyType,
        address newOwner,
        string target
    );

    event ChugSplashBundleClaimed(bytes32 indexed bundleId, address indexed executor);

    event ChugSplashActionExecuted(
        bytes32 indexed bundleId,
        address indexed executor,
        uint256 actionIndex
    );

    event ChugSplashBundleCompleted(
        bytes32 indexed bundleId,
        address indexed executor,
        uint256 actionsExecuted
    );

    event ExecutorPaymentClaimed(address indexed executor, uint256 amount);

    event OwnerWithdrewETH(address indexed owner, uint256 amount);

    event ETHDeposited(address indexed from, uint256 indexed amount);

    bytes32 constant EIP1967_IMPLEMENTATION_KEY =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    ChugSplashAction[] actions;
    uint256[5] actionIndexes = [0, 1, 2, 3, 4];
    bytes32[][] proofs = [
        [
            bytes32(0xf539d9cfd2f6cfd83005272cc243415442566202271f3f3a3b28a1fa79eab380),
            bytes32(0xd33f38d8e7717c42f56fd69bd89d1cd342db4dbcd5dc9b6f6ee9d4218dba12ca),
            bytes32(0x5b9583f6f66c6cf60306fd44a7c099f3f909696845eca2535f93f6e652990f9b)
        ],
        [
            bytes32(0x87be4989370b875185d46cf43d02f59cd61f068ad3acc2d43d2f6216085fbaff),
            bytes32(0xd33f38d8e7717c42f56fd69bd89d1cd342db4dbcd5dc9b6f6ee9d4218dba12ca),
            bytes32(0x5b9583f6f66c6cf60306fd44a7c099f3f909696845eca2535f93f6e652990f9b)
        ],
        [
            bytes32(0xe321b2956757a1fb8900391f73dd458c220deebdcd59df71afd1db74c5b0d188),
            bytes32(0x6617fc8c8fcf99c45dd175b357de082de4df28db1d9ae135c25ddef820a2027b),
            bytes32(0x5b9583f6f66c6cf60306fd44a7c099f3f909696845eca2535f93f6e652990f9b)
        ],
        [
            bytes32(0x73c8aae26938675cf88daa0cd76d20350425311fbb264b6c369b6f62c51753b1),
            bytes32(0x6617fc8c8fcf99c45dd175b357de082de4df28db1d9ae135c25ddef820a2027b),
            bytes32(0x5b9583f6f66c6cf60306fd44a7c099f3f909696845eca2535f93f6e652990f9b)
        ],
        [
            bytes32(0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563),
            bytes32(0x633dc4d7da7256660a892f8f1604a44b5432649cc8ec5cb3ced4c4e6ac94dd1d),
            bytes32(0x34a7560c84331917a9447a4c46b264e415ff532b5c6977123ba682081de9e8e9)
        ]
    ];

    address owner = address(128);
    address nonOwner = address(256);
    address executor1 = address(512);
    address executor2 = address(1024);
    uint256 initialTimestamp = 1641070800;
    uint256 baseFee = 1 gwei;
    uint256 bundleExecutionCost = 2 ether;
    string projectName = 'TestProject';
    uint256 ownerBondAmount = 10e8 gwei; // 0.1 ETH
    uint256 executorBondAmount = 1 ether;
    uint256 executionLockTime = 15 minutes;
    uint256 executorPaymentPercentage = 20;
    string configUri = "ipfs://QmcEeWAg8JXuzLYj4M2DUT12EM63epDPS8XzSa9YKTEe5t";
    bytes32 bundleId = 0xb6e2353b745f3f0696f786ad60124e48e15c903cdc85ee623a25f5dee8d5f18d;
    bytes32 bundleRoot = 0x1353da0ad8f49ed7386a7258615dcdf904404ae699cd956e8f7a71979b47cdc9;
    uint256 bundleSize = actionIndexes.length;
    ChugSplashAction firstAction;
    ChugSplashAction secondAction;
    ChugSplashAction[] setImplementationActionArray;
    uint256[] setImplementationActionIndexArray;
    bytes32[][] setImplementationProofArray;

    ChugSplashBootLoader bootloader;
    ChugSplashManager manager;
    ChugSplashRegistry registry;
    ProxyUpdater proxyUpdater;
    DefaultAdapter adapter;

    function setUp() external {
        firstAction = ChugSplashAction({
            target: "MyToken",
            actionType: ChugSplashActionType.DEPLOY_IMPLEMENTATION,
            data: hex"608060405234801561001057600080fd5b50600436106100cf5760003560e01c806340c10f191161008c57806395d89b411161006657806395d89b4114610228578063a9059cbb14610246578063d505accf14610276578063dd62ed3e14610292576100cf565b806340c10f19146101ac57806370a08231146101c85780637ecebe00146101f8576100cf565b806306fdde03146100d4578063095ea7b3146100f257806318160ddd1461012257806323b872dd14610140578063313ce567146101705780633644e5151461018e575b600080fd5b6100dc6102c2565b6040516100e99190610e06565b60405180910390f35b61010c60048036038101906101079190610ec1565b610350565b6040516101199190610f1c565b60405180910390f35b61012a610442565b6040516101379190610f46565b60405180910390f35b61015a60048036038101906101559190610f61565b610448565b6040516101679190610f1c565b60405180910390f35b610178610692565b6040516101859190610fd0565b60405180910390f35b6101966106b6565b6040516101a39190611004565b60405180910390f35b6101c660048036038101906101c19190610ec1565b610713565b005b6101e260048036038101906101dd919061101f565b610721565b6040516101ef9190610f46565b60405180910390f35b610212600480360381019061020d919061101f565b610739565b60405161021f9190610f46565b60405180910390f35b610230610751565b60405161023d9190610e06565b60405180910390f35b610260600480360381019061025b9190610ec1565b6107df565b60405161026d9190610f1c565b60405180910390f35b610290600480360381019061028b91906110a4565b6108f3565b005b6102ac60048036038101906102a79190611146565b610bec565b6040516102b99190610f46565b60405180910390f35b600080546102cf906111b5565b80601f01602080910402602001604051908101604052809291908181526020018280546102fb906111b5565b80156103485780601f1061031d57610100808354040283529160200191610348565b820191906000526020600020905b81548152906001019060200180831161032b57829003601f168201915b505050505081565b600081600460003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925846040516104309190610f46565b60405180910390a36001905092915050565b60025481565b600080600460008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000205490507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff811461057e5782816104fd9190611215565b600460008773ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055505b82600360008773ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282546105cd9190611215565b9250508190555082600360008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825401925050819055508373ffffffffffffffffffffffffffffffffffffffff168573ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8560405161067e9190610f46565b60405180910390a360019150509392505050565b7f000000000000000000000000000000000000000000000000000000000000000081565b60007f000000000000000000000000000000000000000000000000000000000000000046146106ec576106e7610c11565b61070e565b7f00000000000000000000000000000000000000000000000000000000000000005b905090565b61071d8282610c9d565b5050565b60036020528060005260406000206000915090505481565b60056020528060005260406000206000915090505481565b6001805461075e906111b5565b80601f016020809104026020016040519081016040528092919081815260200182805461078a906111b5565b80156107d75780601f106107ac576101008083540402835291602001916107d7565b820191906000526020600020905b8154815290600101906020018083116107ba57829003601f168201915b505050505081565b600081600360003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282546108309190611215565b9250508190555081600360008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825401925050819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040516108e19190610f46565b60405180910390a36001905092915050565b42841015610936576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161092d90611295565b60405180910390fd5b600060016109426106b6565b7f6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c98a8a8a600560008f73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000815480929190600101919050558b6040516020016109ca969594939291906112c4565b604051602081830303815290604052805190602001206040516020016109f192919061139d565b6040516020818303038152906040528051906020012085858560405160008152602001604052604051610a2794939291906113d4565b6020604051602081039080840390855afa158015610a49573d6000803e3d6000fd5b505050602060405103519050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614158015610abd57508773ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16145b610afc576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610af390611465565b60405180910390fd5b85600460008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008973ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002081905550508573ffffffffffffffffffffffffffffffffffffffff168773ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92587604051610bdb9190610f46565b60405180910390a350505050505050565b6004602052816000526040600020602052806000526040600020600091509150505481565b60007f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f6000604051610c439190611524565b60405180910390207fc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc64630604051602001610c8295949392919061153b565b60405160208183030381529060405280519060200120905090565b8060026000828254610caf919061158e565b9250508190555080600360008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825401925050819055508173ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef83604051610d619190610f46565b60405180910390a35050565b600081519050919050565b600082825260208201905092915050565b60005b83811015610da7578082015181840152602081019050610d8c565b83811115610db6576000848401525b50505050565b6000601f19601f8301169050919050565b6000610dd882610d6d565b610de28185610d78565b9350610df2818560208601610d89565b610dfb81610dbc565b840191505092915050565b60006020820190508181036000830152610e208184610dcd565b905092915050565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000610e5882610e2d565b9050919050565b610e6881610e4d565b8114610e7357600080fd5b50565b600081359050610e8581610e5f565b92915050565b6000819050919050565b610e9e81610e8b565b8114610ea957600080fd5b50565b600081359050610ebb81610e95565b92915050565b60008060408385031215610ed857610ed7610e28565b5b6000610ee685828601610e76565b9250506020610ef785828601610eac565b9150509250929050565b60008115159050919050565b610f1681610f01565b82525050565b6000602082019050610f316000830184610f0d565b92915050565b610f4081610e8b565b82525050565b6000602082019050610f5b6000830184610f37565b92915050565b600080600060608486031215610f7a57610f79610e28565b5b6000610f8886828701610e76565b9350506020610f9986828701610e76565b9250506040610faa86828701610eac565b9150509250925092565b600060ff82169050919050565b610fca81610fb4565b82525050565b6000602082019050610fe56000830184610fc1565b92915050565b6000819050919050565b610ffe81610feb565b82525050565b60006020820190506110196000830184610ff5565b92915050565b60006020828403121561103557611034610e28565b5b600061104384828501610e76565b91505092915050565b61105581610fb4565b811461106057600080fd5b50565b6000813590506110728161104c565b92915050565b61108181610feb565b811461108c57600080fd5b50565b60008135905061109e81611078565b92915050565b600080600080600080600060e0888a0312156110c3576110c2610e28565b5b60006110d18a828b01610e76565b97505060206110e28a828b01610e76565b96505060406110f38a828b01610eac565b95505060606111048a828b01610eac565b94505060806111158a828b01611063565b93505060a06111268a828b0161108f565b92505060c06111378a828b0161108f565b91505092959891949750929550565b6000806040838503121561115d5761115c610e28565b5b600061116b85828601610e76565b925050602061117c85828601610e76565b9150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b600060028204905060018216806111cd57607f821691505b6020821081036111e0576111df611186565b5b50919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b600061122082610e8b565b915061122b83610e8b565b92508282101561123e5761123d6111e6565b5b828203905092915050565b7f5045524d49545f444541444c494e455f45585049524544000000000000000000600082015250565b600061127f601783610d78565b915061128a82611249565b602082019050919050565b600060208201905081810360008301526112ae81611272565b9050919050565b6112be81610e4d565b82525050565b600060c0820190506112d96000830189610ff5565b6112e660208301886112b5565b6112f360408301876112b5565b6113006060830186610f37565b61130d6080830185610f37565b61131a60a0830184610f37565b979650505050505050565b600081905092915050565b7f1901000000000000000000000000000000000000000000000000000000000000600082015250565b6000611366600283611325565b915061137182611330565b600282019050919050565b6000819050919050565b61139761139282610feb565b61137c565b82525050565b60006113a882611359565b91506113b48285611386565b6020820191506113c48284611386565b6020820191508190509392505050565b60006080820190506113e96000830187610ff5565b6113f66020830186610fc1565b6114036040830185610ff5565b6114106060830184610ff5565b95945050505050565b7f494e56414c49445f5349474e4552000000000000000000000000000000000000600082015250565b600061144f600e83610d78565b915061145a82611419565b602082019050919050565b6000602082019050818103600083015261147e81611442565b9050919050565b600081905092915050565b60008190508160005260206000209050919050565b600081546114b2816111b5565b6114bc8186611485565b945060018216600081146114d757600181146114e85761151b565b60ff1983168652818601935061151b565b6114f185611490565b60005b83811015611513578154818901526001820191506020810190506114f4565b838801955050505b50505092915050565b600061153082846114a5565b915081905092915050565b600060a0820190506115506000830188610ff5565b61155d6020830187610ff5565b61156a6040830186610ff5565b6115776060830185610f37565b61158460808301846112b5565b9695505050505050565b600061159982610e8b565b91506115a483610e8b565b9250827fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff038211156115d9576115d86111e6565b5b82820190509291505056fea26469706673582212204b5b201d52d98beb54a59dcb666e4fb3836ce5490fc24bc297d611a24030c05864736f6c634300080d0033"
        });
        secondAction = ChugSplashAction({
            target: "MyToken",
            actionType: ChugSplashActionType.SET_STORAGE,
            data: hex"00000000000000000000000000000000000000000000000000000000000000004d79546f6b656e0000000000000000000000000000000000000000000000000e"
        });

        actions.push(firstAction);
        actions.push(secondAction);
        actions.push(
            ChugSplashAction({
                target: "MyToken",
                actionType: ChugSplashActionType.SET_STORAGE,
                data: hex"00000000000000000000000000000000000000000000000000000000000000014d59540000000000000000000000000000000000000000000000000000000006"
            })
        );
        actions.push(
            ChugSplashAction({
                target: "MyToken",
                actionType: ChugSplashActionType.SET_STORAGE,
                data: hex"000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000003e8"
            })
        );

        setImplementationActionArray.push(
            ChugSplashAction({
                target: "MyToken",
                actionType: ChugSplashActionType.SET_IMPLEMENTATION,
                data: new bytes(0)
            })
        );
        setImplementationActionIndexArray = [actionIndexes[4]];
        setImplementationProofArray = [proofs[4]];

        vm.warp(initialTimestamp);
        vm.fee(baseFee);

        bootloader = new ChugSplashBootLoader{salt: bytes32(0) }();

        address registryProxyAddress = Create2.compute(
            address(bootloader),
            bytes32(0),
            abi.encodePacked(type(Proxy).creationCode, abi.encode(bootloader))
        );

        address proxyUpdaterAddress = Create2.compute(
            address(bootloader),
            bytes32(0),
            type(ProxyUpdater).creationCode
        );

        ChugSplashManager managerImplementation = new ChugSplashManager{ salt: bytes32(0) }(
            ChugSplashRegistry(registryProxyAddress),
            projectName,
            owner,
            proxyUpdaterAddress,
            executorBondAmount,
            executionLockTime,
            ownerBondAmount,
            executorPaymentPercentage
        );

        bootloader.initialize(
            owner,
            executorBondAmount,
            executionLockTime,
            ownerBondAmount,
            executorPaymentPercentage,
            address(managerImplementation)
        );

        registry = ChugSplashRegistry(address(bootloader.registryProxy()));
        registry.register(projectName, owner);
        manager = registry.projects(projectName);
        adapter = new DefaultAdapter();

        registry.addProxyType(bytes32(0), address(adapter));
    }

    // constructor:
    // - initializes variables correctly
    function test_constructor_success() external {
        assertEq(address(manager.registry()), address(bootloader.registryProxy()));
        assertEq(address(manager.proxyUpdater()), address(bootloader.proxyUpdater()));
        assertEq(manager.executorBondAmount(), executorBondAmount);
        assertEq(manager.executionLockTime(), executionLockTime);
        assertEq(manager.ownerBondAmount(), ownerBondAmount);
        assertEq(manager.executorPaymentPercentage(), executorPaymentPercentage);
        assertEq(manager.name(), projectName);
        assertEq(manager.owner(), owner);
    }

    // initialize:
    // - reverts if called twice
    function test_initialize_revert_calledTwice() external {
        vm.expectRevert("Initializable: contract is already initialized");
        manager.initialize(projectName, address(owner));
    }

    // computeBundleId:
    // - returns bundle id
    function test_computeBundleId_success() external {
        bytes32 expectedBundleId = keccak256(abi.encode(bundleRoot, bundleSize, configUri));
        assertEq(manager.computeBundleId(bundleRoot, bundleSize, configUri), expectedBundleId);
    }

    function test_getSelectedExecutor_success() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        assertEq(manager.getSelectedExecutor(bundleId), executor1);
    }

    // proposeChugSplashBundle:
    // - reverts if bundle's status is not `EMPTY`
    function test_proposeChugSplashBundle_revert_nonEmpty() external {
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);
        vm.expectRevert("ChugSplashManager: bundle already exists");
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);
    }

    // proposeChugSplashBundle:
    // - updates bundles mapping
    function test_proposeChugSplashBundle_success() external {
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleProposed(bundleId, bundleRoot, bundleSize, configUri);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleProposed")
            )
        );

        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);
        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        assertEq(uint8(bundle.status), uint8(ChugSplashBundleStatus.PROPOSED));
        assertEq(bundle.executions.length, bundleSize);
        for (uint i = 0; i < bundle.executions.length; i++) {
            assertEq(bundle.executions[i], false);
        }
        assertEq(bundle.merkleRoot, bundleRoot);
    }

    // approveChugSplashBundle:
    // - reverts if not called by owner
    function test_approveChugSplashBundle_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.approveChugSplashBundle(bundleId);
    }

    // approveChugSplashBundle:
    // - reverts if the manager's balance minus the totalDebt is less than the owner bond amount
    function test_approveChugSplashBundle_revert_balance() external {
        assertEq(address(manager).balance, 0);
        uint256 totalDebt = 1 gwei;
        uint256 insufficientAmount = ownerBondAmount + totalDebt - 1;

        stdstore
            .target(address(manager))
            .sig("totalDebt()")
            .checked_write(totalDebt);

        (bool success, ) = address(manager).call{ value: insufficientAmount }(new bytes(0));
        assertTrue(success);
        vm.expectRevert("ChugSplashManager: insufficient balance in manager");
        vm.prank(owner);
        manager.approveChugSplashBundle(bundleId);
    }

    // approveChugSplashBundle:
    // - reverts if bundle's status is not `PROPOSED`
    function test_approveChugSplashBundle_revert_notProposed() external {
        (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
        assertTrue(success);

        vm.expectRevert("ChugSplashManager: bundle does not exist or has already been approved or completed");
        vm.prank(owner);
        manager.approveChugSplashBundle(bundleId);
    }

    // approveChugSplashBundle:
    // - reverts if there is an active bundle
    function test_approveChugSplashBundle_revert_activeBundle() external {
        (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
        assertTrue(success);

        stdstore
            .target(address(manager))
            .sig("activeBundleId()")
            .checked_write(bytes32(hex"1337"));

        vm.startPrank(owner);
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);

        vm.expectRevert("ChugSplashManager: another bundle has been approved and not yet completed");
        manager.approveChugSplashBundle(bundleId);
    }

    // approveChugSplashBundle:
    // - updates bundles mapping
    function test_approveChugSplashBundle_success() external {
        (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
        assertTrue(success);

        vm.startPrank(owner);
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);

        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleApproved(bundleId);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleApproved")
            )
        );
        manager.approveChugSplashBundle(bundleId);
        assertEq(manager.activeBundleId(), bundleId);
        assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.APPROVED));
    }

    function test_executeChugSplashAction_revert_noActiveBundle() external {
        vm.expectRevert("ChugSplashManager: no bundle has been approved for execution");
        manager.executeChugSplashAction(
            firstAction, actionIndexes[0], proofs[0]
        );
    }

    function test_executeChugSplashAction_revert_alreadyExecuted() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();

        vm.expectRevert("ChugSplashManager: action has already been executed");
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function test_executeChugSplashAction_revert_wrongExecutor() external {
        helper_proposeThenApproveThenFundThenClaimBundle();

        vm.prank(executor2);
        vm.expectRevert("ChugSplashManager: caller is not approved executor for active bundle ID");
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function test_executeChugSplashAction_revert_invalidProof() external {
        helper_proposeThenApproveThenFundThenClaimBundle();

        uint256 incorrectActionIndex = actionIndexes[0] + 1;
        hoax(executor1);
        vm.expectRevert("ChugSplashManager: invalid bundle action proof");
        manager.executeChugSplashAction(firstAction, incorrectActionIndex, proofs[0]);
    }

    function test_executeChugSplashAction_revert_noAdapter() external {
        helper_proposeThenApproveThenFundThenClaimBundle();

        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(registry.adapters.selector, bytes32(0)),
            abi.encode(address(0))
        );
        hoax(executor1);
        vm.expectRevert("ChugSplashManager: proxy type has no adapter");
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function test_executeChugSplashAction_success_deployProxyAndImplementation() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        address payable proxyAddress = manager.getProxyByTargetName(firstAction.target);
        assertEq(proxyAddress.code.length, 0);
        // We add 1 here to account for the Proxy deployment that occurs before the implementation deployment.
        uint256 implementationDeploymentNonce = 1 + vm.getNonce(address(manager));
        address implementationAddress = computeCreateAddress(address(manager), implementationDeploymentNonce);
        assertEq(implementationAddress.code.length, 0);
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashActionExecuted")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashActionExecuted(bundleId, executor1, actionIndexes[0]);
        helper_executeFirstAction();
        uint256 finalTotalDebt = manager.totalDebt();
        uint256 finalExecutorDebt = manager.debt(executor1);

        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        uint256 executionGasUsed = 1696119;
        uint256 estExecutorPayment = baseFee * executionGasUsed * (100 + executorPaymentPercentage) / 100;

        assertGt(proxyAddress.code.length, 0);
        assertGt(implementationAddress.code.length, 0);
        assertEq(bundle.actionsExecuted, 1);
        assertTrue(bundle.executions[actionIndexes[0]]);
        assertEq(manager.implementations(firstAction.target), implementationAddress);
        assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
        assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
    }

    function test_executeChugSplashAction_success_setStorage() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashActionExecuted")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashActionExecuted(bundleId, executor1, actionIndexes[1]);
        helper_executeSecondAction();
        uint256 finalTotalDebt = manager.totalDebt();
        uint256 finalExecutorDebt = manager.debt(executor1);

        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        address payable proxyAddress = manager.getProxyByTargetName(firstAction.target);
        vm.prank(address(manager));
        address implementationAddress = Proxy(proxyAddress).implementation();
        (bytes32 storageKey, bytes32 expectedStorageValue) = abi.decode(secondAction.data, (bytes32, bytes32));
        bytes32 storageValue = vm.load(proxyAddress, storageKey);
        uint256 executionGasUsed = 67190;
        uint256 estExecutorPayment = baseFee * executionGasUsed * (100 + executorPaymentPercentage) / 100;

        assertEq(bundle.actionsExecuted, 2);
        assertTrue(bundle.executions[actionIndexes[1]]);
        assertEq(implementationAddress, address(0));
        assertEq(storageValue, expectedStorageValue);
        assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
        assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
    }

    function test_executeChugSplashAction_success_setImplementationToZeroAddress() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);

        vm.startPrank(address(manager));
        address payable proxyAddress = manager.getProxyByTargetName(firstAction.target);
        vm.store(proxyAddress, EIP1967_IMPLEMENTATION_KEY, bytes32(uint256(1)));
        assertEq(Proxy(proxyAddress).implementation(), address(1));
        vm.stopPrank();

        helper_executeSecondAction();
        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        bytes32 newImplementationBytes = vm.load(proxyAddress, EIP1967_IMPLEMENTATION_KEY);
        (bytes32 storageKey, bytes32 expectedStorageValue) = abi.decode(secondAction.data, (bytes32, bytes32));
        bytes32 storageValue = vm.load(proxyAddress, storageKey);
        uint256 finalTotalDebt = manager.totalDebt();
        uint256 finalExecutorDebt = manager.debt(executor1);
        uint256 executionGasUsed = 72301;
        uint256 estExecutorPayment = baseFee * executionGasUsed * (100 + executorPaymentPercentage) / 100;

        assertEq(bundle.actionsExecuted, 2);
        assertTrue(bundle.executions[actionIndexes[1]]);
        assertEq(newImplementationBytes, bytes32(0));
        assertEq(storageValue, expectedStorageValue);
        assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
        assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
    }

    function test_completeChugSplashBundle_revert_noActiveBundle() external {
        vm.expectRevert("ChugSplashManager: no bundle has been approved for execution");
        helper_completeBundle(executor1);
    }

    function test_completeChugSplashBundle_revert_wrongExecutor() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        vm.expectRevert("ChugSplashManager: caller is not approved executor for active bundle ID");
        helper_completeBundle(executor2);
    }

    function test_completeChugSplashBundle_revert_invalidProof() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        setImplementationProofArray[0][0] = bytes32(0);
        vm.expectRevert("ChugSplashManager: invalid bundle action proof");
        helper_completeBundle(executor1);
    }

    function test_completeChugSplashBundle_revert_incompleteBundle() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        vm.expectRevert("ChugSplashManager: bundle was not completed");
        helper_completeBundle(executor1);
    }

    function test_completeChugSplashBundle_success() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeActions();
        ChugSplashBundleState memory prevBundle = manager.bundles(bundleId);
        address payable proxyAddress = manager.getProxyByTargetName(firstAction.target);
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);
        uint256 actionIndex = setImplementationActionIndexArray[0];
        uint256 numActions = actionIndex + 1;

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashActionExecuted")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashActionExecuted(bundleId, executor1, actionIndex);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleCompleted")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleCompleted(bundleId, executor1, numActions);
        helper_completeBundle(executor1);

        uint256 finalTotalDebt = manager.totalDebt();
        uint256 finalExecutorDebt = manager.debt(executor1);
        address expectedImplementation = manager.implementations(firstAction.target);
        ChugSplashBundleState memory bundle = manager.bundles(bundleId);
        uint256 gasUsed = 45472;
        uint256 estExecutorPayment = baseFee * gasUsed * (100 + executorPaymentPercentage) / 100;
        vm.prank(address(manager));
        address implementation = Proxy(proxyAddress).implementation();

        assertEq(bundle.actionsExecuted, prevBundle.actionsExecuted + 1);
        assertTrue(bundle.executions[actions.length]);
        assertEq(implementation, expectedImplementation);
        assertEq(uint8(bundle.status), uint8(ChugSplashBundleStatus.COMPLETED));
        assertEq(manager.activeBundleId(), bytes32(0));
        assertGt(finalTotalDebt, estExecutorPayment + initialTotalDebt);
        assertGt(finalExecutorDebt, estExecutorPayment + initialExecutorDebt);
        assertEq(finalTotalDebt, finalExecutorDebt);
    }

    // cancelActiveChugSplashBundle:
    // - reverts if not called by owner
    function test_cancelActiveChugSplashBundle_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.cancelActiveChugSplashBundle();
    }

    // cancelActiveChugSplashBundle:
    // - reverts if no bundle is active
    function test_cancelActiveChugSplashBundle_revert_noActiveBundle() external {
        vm.prank(owner);
        vm.expectRevert('ChugSplashManager: no bundle is currently active');
        manager.cancelActiveChugSplashBundle();
    }

    function test_cancelActiveChugSplashBundle_success_withinExecutionLockTime() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        uint256 timeClaimed = manager.bundles(bundleId).timeClaimed;
        uint256 actionsExecuted = manager.bundles(bundleId).actionsExecuted;
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);

        vm.warp(executionLockTime + timeClaimed);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleCancelled")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleCancelled(bundleId, owner, actionsExecuted);
        vm.prank(owner);
        manager.cancelActiveChugSplashBundle();

        assertEq(manager.debt(executor1), initialExecutorDebt + ownerBondAmount + executorBondAmount);
        assertEq(manager.totalDebt(), initialTotalDebt + ownerBondAmount);
        assertEq(manager.activeBundleId(), bytes32(0));
        assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.CANCELLED));
    }

    // cancelActiveChugSplashBundle:
    // - if bundle is NOT cancelled within the `executionLockTime` window:
    //   - decreases the `totalDebt` by `executorBondAmount`
    // - removes active bundle id
    // - sets bundle status to `CANCELLED`
    // - emits ChugSplashBundleCancelled
    // - calls registry.announce with ChugSplashBundleCancelled
    function test_cancelActiveChugSplashBundle_success_afterExecutionLockTime() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        uint256 timeClaimed = manager.bundles(bundleId).timeClaimed;
        uint256 actionsExecuted = manager.bundles(bundleId).actionsExecuted;
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorDebt = manager.debt(executor1);

        vm.warp(executionLockTime + timeClaimed + 1);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleCancelled")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleCancelled(bundleId, owner, actionsExecuted);
        vm.prank(owner);
        manager.cancelActiveChugSplashBundle();

        assertEq(manager.debt(executor1), initialExecutorDebt);
        assertEq(manager.totalDebt(), initialTotalDebt - executorBondAmount);
        assertEq(manager.activeBundleId(), bytes32(0));
        assertEq(uint8(manager.bundles(bundleId).status), uint8(ChugSplashBundleStatus.CANCELLED));
    }

    // claimBundle:
    // - reverts if there is no active bundle
    function test_claimBundle_revert_noActiveBundle() external {
        vm.expectRevert('ChugSplashManager: no bundle is currently active');
        manager.claimBundle();
    }

    // claimBundle:
    // - reverts if callvalue is less than the `executorBondAmount`
    function test_claimBundle_revert_insufficientBond() external {
        helper_proposeThenApproveBundle();
        vm.expectRevert('ChugSplashManager: incorrect executor bond amount');
        manager.claimBundle{ value: executorBondAmount - 1}();
    }

    // claimBundle:
    // - reverts if bundle is currently claimed by another executor
    function test_claimBundle_revert_alreadyClaimed() external {
        helper_proposeThenApproveBundle();
        helper_claimBundle(executor1);

        vm.warp(initialTimestamp + executionLockTime);
        vm.expectRevert("ChugSplashManager: bundle is currently claimed by an executor");
        helper_claimBundle(executor2);
    }

    // claimBundle:
    // - see helper_claimBundle
    // - if there was no previous executor:
    //   - increases `totalDebt` by `executorBondAmount`
    function test_claimBundle_success_noPreviousExecutor() external {
        helper_proposeThenApproveBundle();

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleClaimed")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleClaimed(bundleId, executor1);
        helper_claimBundle(executor1);

        ChugSplashBundleState memory bundle = manager.bundles(bundleId);

        assertEq(bundle.timeClaimed, block.timestamp);
        assertEq(bundle.selectedExecutor, executor1);
        assertEq(manager.totalDebt(), executorBondAmount);
    }

    // claimBundle:
    // - see helper_claimBundle
    // - if there was a previous executor:
    //   - `totalDebt` remains the same
    function test_claimBundle_success_withPreviousExecutor() external {
        helper_proposeThenApproveBundle();
        helper_claimBundle(executor1);
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 secondClaimedBundleTimestamp = initialTimestamp + executionLockTime + 1;
        vm.warp(secondClaimedBundleTimestamp);

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ChugSplashBundleClaimed")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ChugSplashBundleClaimed(bundleId, executor2);
        helper_claimBundle(executor2);

        ChugSplashBundleState memory bundle = manager.bundles(bundleId);

        assertEq(bundle.timeClaimed, secondClaimedBundleTimestamp);
        assertEq(bundle.selectedExecutor, executor2);
        assertEq(manager.totalDebt(), initialTotalDebt);
    }

    // claimExecutorPayment:
    // - decreases `debt` and `totalDebt` by the withdrawn amount
    // - emits ExecutorPaymentClaimed
    // - calls registry.announce with ExecutorPaymentClaimed
    function test_claimExecutorPayment_success() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeFirstAction();
        uint256 executorDebt = manager.debt(executor1);
        uint256 initialTotalDebt = manager.totalDebt();
        uint256 initialExecutorBalance = address(executor1).balance;

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ExecutorPaymentClaimed")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ExecutorPaymentClaimed(executor1, executorDebt);
        vm.prank(executor1);
        manager.claimExecutorPayment();

        assertEq(address(executor1).balance, executorDebt + initialExecutorBalance);
        assertEq(manager.debt(executor1), 0);
        assertEq(manager.totalDebt(), initialTotalDebt - executorDebt);
    }

    // transferProxyOwnership:
    // - reverts if not called by owner
    function test_transferProxyOwnership_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.transferProxyOwnership(firstAction.target, owner);
    }

    // transferProxyOwnership:
    // - reverts if there is a currently active bundle
    function test_transferProxyOwnership_revert_activeBundle() external {
        helper_proposeThenApproveBundle();

        vm.prank(owner);
        vm.expectRevert("ChugSplashManager: bundle is currently active");
        manager.transferProxyOwnership(firstAction.target, owner);
    }

    // transferProxyOwnership:
    // - calls the adapter to change ownership
    // - emits ProxyOwnershipTransferred
    // - calls registry.announce with ProxyOwnershipTransferred
    function test_transferProxyOwnership_success() external {
        helper_proposeThenApproveThenFundThenClaimBundle();
        helper_executeActions();
        helper_completeBundle(executor1);
        address payable proxyAddress = manager.getProxyByTargetName(firstAction.target);
        vm.prank(address(manager));
        assertEq(Proxy(proxyAddress).admin(), address(manager));

        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ProxyOwnershipTransferred")
            )
        );
        vm.expectEmit(true, true, true, true);
        emit ProxyOwnershipTransferred(firstAction.target, proxyAddress, bytes32(0), executor1, firstAction.target);
        vm.prank(owner);
        manager.transferProxyOwnership(firstAction.target, executor1);

        vm.prank(executor1);
        assertEq(Proxy(proxyAddress).admin(), executor1);
    }

    // withdrawOwnerETH:
    // - reverts if not called by owner
    function test_withdrawOwnerETH_revert_nonOwner() external {
        vm.prank(nonOwner);
        vm.expectRevert('Ownable: caller is not the owner');
        manager.withdrawOwnerETH();
    }

    // withdrawOwnerETH:
    // - reverts if there is an active bundle
    function test_withdrawOwnerETH_revert_noActiveBundle() external {
        helper_proposeThenApproveBundle();

        vm.prank(owner);
        vm.expectRevert("ChugSplashManager: cannot withdraw funds while bundle is active");
        manager.withdrawOwnerETH();
    }

    function test_withdrawOwnerETH_success() external {
        uint256 managerBalance = 1 ether;
        uint256 totalDebt = 1 gwei;
        uint256 amountWithdrawn = managerBalance - totalDebt;
        helper_fundChugSplashManager(managerBalance);
        stdstore
            .target(address(manager))
            .sig("totalDebt()")
            .checked_write(totalDebt);
        uint256 prevOwnerBalance = address(owner).balance;

        vm.expectEmit(true, true, true, true);
        emit OwnerWithdrewETH(owner, amountWithdrawn);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("OwnerWithdrewETH")
            )
        );
        vm.prank(owner);
        manager.withdrawOwnerETH();

        assertEq(address(owner).balance, prevOwnerBalance + amountWithdrawn);
    }

    function test_receive_success() external {
        uint256 amountDeposited = 1 ether;
        uint256 prevManagerBalance = address(manager).balance;

        hoax(owner);
        vm.expectEmit(true, true, true, true);
        emit ETHDeposited(owner, amountDeposited);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ChugSplashRegistry.announce,
                ("ETHDeposited")
            )
        );
        helper_fundChugSplashManager(amountDeposited);

        assertEq(address(manager).balance, prevManagerBalance + amountDeposited);
    }

    function helper_proposeThenApproveBundle() internal {
        startHoax(owner);
        manager.proposeChugSplashBundle(bundleRoot, bundleSize, configUri);
        (bool success, ) = address(manager).call{ value: ownerBondAmount }(new bytes(0));
        assertTrue(success);
        manager.approveChugSplashBundle(bundleId);
        vm.stopPrank();
    }

    function helper_executeActions() internal {
        for (uint256 i = 0; i < actions.length; i++) {
            hoax(executor1);
            manager.executeChugSplashAction(actions[i], actionIndexes[i], proofs[i]);
        }
    }

    function helper_completeBundle(address _executor) internal {
        hoax(_executor);
        manager.completeChugSplashBundle(setImplementationActionArray, setImplementationActionIndexArray, setImplementationProofArray);
    }

    function helper_executeSecondAction() internal {
        hoax(executor1);
        manager.executeChugSplashAction(secondAction, actionIndexes[1], proofs[1]);
    }

    function helper_proposeThenApproveThenFundThenClaimBundle() internal {
        helper_proposeThenApproveBundle();
        helper_fundChugSplashManager(bundleExecutionCost);
        helper_claimBundle(executor1);
    }

    function helper_fundChugSplashManager(uint256 _amount) internal {
        (bool success, ) = address(manager).call{ value: _amount }(new bytes(0));
        assertTrue(success);
    }

    function helper_executeFirstAction() internal {
        hoax(executor1);
        manager.executeChugSplashAction(firstAction, actionIndexes[0], proofs[0]);
    }

    function helper_claimBundle(address _executor) internal {
        hoax(_executor);
        manager.claimBundle{ value: executorBondAmount }();
    }
}
