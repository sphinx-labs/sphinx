// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * We do not use remappings for forge-std because if we did, the user would need to define them
 * in their remappings, or our library contracts would not work. Technically, we could use a
 * forge-std remapping in our non-production contracts (scripts, tests, etc.), such as this file,
 * without forcing the user to define a remapping. We chose not to because doing that would increase
 * the chance of accidentally shipping something that may not compile in the user's project because
 * we accidentally relied on a remapping in the wrong file.
 */
import "../contracts/forge-std/src/Test.sol";
import { VmSafe } from "../contracts/forge-std/src/Vm.sol";

import { Sphinx, Network } from "../contracts/foundry/Sphinx.sol";
import { IGnosisSafe } from "../contracts/foundry/interfaces/IGnosisSafe.sol";
import {
    SystemContractInfo,
    FoundryDeploymentInfo,
    ParsedAccountAccess,
    NetworkInfo,
    GnosisSafeTransaction
} from "../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxTestUtils } from "./SphinxTestUtils.sol";
import { MySimpleContract } from "../test/helpers/MyTestContracts.t.sol";

abstract contract Sphinx_Test_Abstract is Test, Sphinx, SphinxTestUtils {
    string dummyDeploymentInfoPath;

    function setUp() public {
        SystemContractInfo[] memory contracts = getSystemContractInfo();
        deploySphinxSystem(contracts);

        dummyDeploymentInfoPath = vm.envString("DUMMY_DEPLOYMENT_INFO_PATH");
    }

    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
    }
}

contract Sphinx_Test is Sphinx_Test_Abstract {
    function test_sphinxModule_success_standard() external {
        IGnosisSafe safeProxy = IGnosisSafe(deploySphinxModuleAndGnosisSafe());

        (address[] memory modules, ) = safeProxy.getModulesPaginated(address(0x1), 1);
        address sphinxModule = modules[0];

        address expectedAddress = this.sphinxModule();

        assertEq(expectedAddress, sphinxModule);
    }

    function test_sphinxModule_success_nonZeroSaltNonce() external {
        sphinxConfig.projectName = "Simple_Project_1";
        IGnosisSafe safeProxy = IGnosisSafe(deploySphinxModuleAndGnosisSafe());

        (address[] memory modules, ) = safeProxy.getModulesPaginated(address(0x1), 1);
        address sphinxModule = modules[0];

        address expectedAddress = this.sphinxModule();

        assertEq(expectedAddress, sphinxModule);
    }

    function test_sphinxCollectProposal_success_multiFork() external {
        vm.createSelectFork("ethereum");
        uint256 expectedChainId = block.chainid;
        deploySphinxSystem(getSystemContractInfo());
        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(this.runMultiFork.selector),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        assertEq(deploymentInfo.encodedAccountAccesses.length, 1);
        ParsedAccountAccess memory access = abi.decode(
            deploymentInfo.encodedAccountAccesses[0],
            (ParsedAccountAccess)
        );
        assertEq(access.root.chainInfo.chainId, expectedChainId);
        assertEq(access.root.accessor, safeAddress());
        assertEq(access.root.account, CREATE2_FACTORY);
        // The data sent to the CREATE2 Factory is the 32-byte CREATE2 salt appended with the
        // contract's init code.
        bytes memory create2FactoryInputData = bytes.concat(
            bytes32(0), // The salt to deploy `MySimpleContract` on Ethereum in `runMultiFork`.
            type(MySimpleContract).creationCode
        );
        assertEq(access.root.data, create2FactoryInputData);
        // Check that the nested accesses have the correct chain ID.
        for (uint256 i = 0; i < access.nested.length; i++) {
            assertEq(access.nested[i].chainInfo.chainId, expectedChainId);
        }
    }

    /////////////////////////////////// Helpers //////////////////////////////////////

    function runMultiFork() public sphinx {
        vm.createSelectFork("ethereum");
        new MySimpleContract{ salt: 0 }();
        vm.createSelectFork("optimism");
        new MySimpleContract{ salt: hex"01" }();
    }
}

contract Sphinx_Test_Airdrop_Funds is Test, Sphinx, SphinxTestUtils {
    string dummyDeploymentInfoPath;

    function setUp() public {
        SystemContractInfo[] memory contracts = getSystemContractInfo();
        deploySphinxSystem(contracts);

        dummyDeploymentInfoPath = vm.envString("DUMMY_DEPLOYMENT_INFO_PATH");
    }

    function configureSphinx() public override {
        sphinxConfig.projectName = "Simple_Project";
    }

    function test_sphinxCollectProposal_success_fundSafe_anvil() external {
        deploySphinxSystem(getSystemContractInfo());
        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(this.runTransferFundsAnvil.selector),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        uint requestedFunds = 1 ether;
        uint safeBalance = 1 ether;
        uint zeroAddressBalance = 0 ether;
        assertCorrectValues(requestedFunds, safeBalance, zeroAddressBalance, deploymentInfo);
        assertCorrectFundCheckAction(deploymentInfo, 1 ether);
    }

    function test_sphinxCollectProposal_success_fundSafe_ethereum() external {
        vm.createSelectFork("ethereum");
        deploySphinxSystem(getSystemContractInfo());
        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(this.runTransferFundsEthereum.selector),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        uint requestedFunds = 0.15 ether;
        uint safeBalance = 0.15 ether;
        uint zeroAddressBalance = 0 ether;
        assertCorrectValues(requestedFunds, safeBalance, zeroAddressBalance, deploymentInfo);
        assertCorrectFundCheckAction(deploymentInfo, 0.15 ether);
    }

    function test_sphinxCollectProposal_success_fundSafe_less_than_max() external {
        deploySphinxSystem(getSystemContractInfo());
        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(
                this.runTransferFundsLessThanMax.selector
            ),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        uint requestedFunds = 0.15 ether;
        uint safeBalance = 0.15 ether;
        uint zeroAddressBalance = 0 ether;
        assertCorrectValues(requestedFunds, safeBalance, zeroAddressBalance, deploymentInfo);
        assertCorrectFundCheckAction(deploymentInfo, 0.15 ether);
    }

    function test_sphinxCollectProposal_success_fundSafe_then_use_funds() external {
        deploySphinxSystem(getSystemContractInfo());
        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(this.runTransferThenUseFunds.selector),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        uint requestedFunds = 1 ether;
        uint safeBalance = 0.85 ether;
        uint zeroAddressBalance = 0.15 ether;
        assertCorrectValues(requestedFunds, safeBalance, zeroAddressBalance, deploymentInfo);
        assertCorrectFundCheckAction(deploymentInfo, 1 ether);
    }

    function test_sphinxCollectProposal_success_fundSafe_already_has_funds() external {
        vm.deal(safeAddress(), 1 ether);
        deploySphinxSystem(getSystemContractInfo());
        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(
                this.runTransferThenUseFundsIncludingPreviousBalance.selector
            ),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        uint requestedFunds = 1 ether;
        uint safeBalance = 0 ether;
        uint zeroAddressBalance = 2 ether;
        assertCorrectValues(requestedFunds, safeBalance, zeroAddressBalance, deploymentInfo);
        assertCorrectFundCheckAction(deploymentInfo, 2 ether);
    }

    function test_sphinxCollectProposal_success_fundSafe_multiple_calls() external {
        deploySphinxSystem(getSystemContractInfo());
        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(
                this.runRequestTransferFundsMultipleTimes.selector
            ),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        uint requestedFunds = 1 ether;
        uint safeBalance = 0 ether;
        uint zeroAddressBalance = 1 ether;
        assertCorrectValues(requestedFunds, safeBalance, zeroAddressBalance, deploymentInfo);
        assertCorrectFundCheckAction(deploymentInfo, 1 ether);
    }

    function test_fundSafe_revert_greater_than_max() external {
        deploySphinxSystem(getSystemContractInfo());
        vm.expectRevert(
            "Sphinx: Gnosis Safe funding request exceeds the maximum value allowed on anvil. Please update your script to request less than or equal to the maximum value of 1 ETH"
        );
        this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(this.runTranferGreaterThanMax.selector),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });
    }

    function test_fundSafe_revert_multiple_calls_greater_than_max() external {
        deploySphinxSystem(getSystemContractInfo());
        vm.expectRevert(
            "Sphinx: Gnosis Safe funding request exceeds the maximum value allowed on anvil. Please update your script to request less than or equal to the maximum value of 1 ETH"
        );
        this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(
                this.runTranferGreaterThanMaxMultipleCalls.selector
            ),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });
    }

    function test_fundSafe_success_multifork_ethereum() external {
        vm.createSelectFork("ethereum");
        deploySphinxSystem(getSystemContractInfo());
        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(this.runMultiFork.selector),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        uint requestedFunds = 0.1 ether;
        uint safeBalance = 0.08 ether;
        uint zeroAddressBalance = 0.02 ether;
        assertCorrectValues(requestedFunds, safeBalance, zeroAddressBalance, deploymentInfo);
        assertCorrectFundCheckAction(deploymentInfo, 0.1 ether);
    }

    function test_fundSafe_success_multifork_optimism() external {
        vm.createSelectFork("optimism");
        deploySphinxSystem(getSystemContractInfo());
        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(this.runMultiFork.selector),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        uint requestedFunds = 0.025 ether;
        uint safeBalance = 0 ether;
        uint zeroAddressBalance = 0.025 ether;
        assertCorrectValues(requestedFunds, safeBalance, zeroAddressBalance, deploymentInfo);
        assertCorrectFundCheckAction(deploymentInfo, 0.025 ether);
    }

    function test_fundSafe_revert_safe_under_funded() external {
        vm.createSelectFork("optimism");
        deploySphinxSystem(getSystemContractInfo());

        uint256 snapshotId = vm.snapshot();

        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(this.runMultiFork.selector),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        vm.revertTo(snapshotId);

        // Ensure the Safe is deployed so we can test calling it with the balance check
        configureSphinx();
        deployModuleAndGnosisSafe(
            deploymentInfo.newConfig.owners,
            deploymentInfo.newConfig.threshold,
            deploymentInfo.safeAddress
        );

        // We have to prank the module or the call into the Safe will revert completely
        vm.startPrank(deploymentInfo.moduleAddress);

        ParsedAccountAccess memory balanceCheckAccess = decodeParsedAccountAcccesses(
            deploymentInfo
        )[0];
        GnosisSafeTransaction memory txn = makeGnosisSafeTransaction(balanceCheckAccess.root);

        // Confirm the Safe does not have a balance (this triggers the failure we are testing)
        assertEq(safeAddress().balance, 0 ether);

        // Execute the check balance action (we expect this to fail because the Safe is not funded)
        bool shouldFail = IGnosisSafe(deploymentInfo.safeAddress).execTransactionFromModule(
            txn.to,
            txn.value,
            txn.txData,
            txn.operation
        );

        // Expect the check balance action to fail because the Safe doesn't have the required funds
        assertEq(shouldFail, false);

        // Set the balance of the Safe
        vm.deal(safeAddress(), 1 ether);

        // Execute the check balance action (we expect this to succeed because the Safe is now funded)
        bool shouldSucceed = IGnosisSafe(deploymentInfo.safeAddress).execTransactionFromModule(
            txn.to,
            txn.value,
            txn.txData,
            txn.operation
        );

        // Expect the check balance action to fail because the Safe doesn't have the required funds
        assertEq(shouldSucceed, true);
    }

    function test_sphinxCollectProposal_success_no_transfer() external {
        deploySphinxSystem(getSystemContractInfo());
        FoundryDeploymentInfo memory deploymentInfo = this.sphinxCollectProposal({
            _scriptFunctionCalldata: abi.encodeWithSelector(this.runNoTransfer.selector),
            _deploymentInfoPath: dummyDeploymentInfoPath,
            // The call depth is one greater than the default call depth because we're calling
            // `sphinxCollectProposal` from within a Forge test.
            _callDepth: defaultCallDepth + 1
        });

        uint requestedFunds = 0 ether;
        uint safeBalance = 0 ether;
        uint zeroAddressBalance = 0 ether;
        assertCorrectValues(requestedFunds, safeBalance, zeroAddressBalance, deploymentInfo);

        ParsedAccountAccess[] memory accesses = decodeParsedAccountAcccesses(deploymentInfo);
        assertEq(accesses.length, 1);
        assertEq(accesses[0].root.value, 0);
        assertEq(
            uint(accesses[0].root.kind),
            uint(VmSafe.AccountAccessKind.Create),
            "incorrect type"
        );
    }

    /////////////////////////////////// Helpers //////////////////////////////////////

    function runTransferFundsAnvil() public sphinx {
        fundSafe(1 ether);
    }

    function runTransferFundsEthereum() public sphinx {
        vm.createSelectFork("ethereum");
        fundSafe(0.15 ether);
    }

    function runTransferFundsLessThanMax() public sphinx {
        fundSafe(0.15 ether);
    }

    function runTransferThenUseFunds() public sphinx {
        fundSafe(1 ether);
        payable(address(0)).transfer(0.15 ether);
    }

    function runTransferThenUseFundsIncludingPreviousBalance() public sphinx {
        fundSafe(1 ether);
        payable(address(0)).transfer(2 ether);
    }

    function runRequestTransferFundsMultipleTimes() public sphinx {
        fundSafe(0.25 ether);
        fundSafe(0.25 ether);
        fundSafe(0.25 ether);
        fundSafe(0.25 ether);
        payable(address(0)).transfer(1 ether);
    }

    function runTranferGreaterThanMax() public sphinx {
        fundSafe(2 ether);
    }

    function runTranferGreaterThanMaxMultipleCalls() public sphinx {
        fundSafe(0.15 ether);
        fundSafe(1 ether);
    }

    function runMultiFork() public sphinx {
        vm.createSelectFork("ethereum");
        fundSafe(0.1 ether);
        payable(address(0)).transfer(0.02 ether);

        vm.createSelectFork("optimism");
        fundSafe(0.025 ether);
        payable(address(0)).transfer(0.025 ether);
    }

    function runNoTransfer() public sphinx {
        new MySimpleContract();
    }

    /////////////////////////////////// Custom Assertions //////////////////////////////////////

    function assertCorrectValues(
        uint _requestedFunds,
        uint _safeBalance,
        uint _zeroAddressBalance,
        FoundryDeploymentInfo memory _deploymentInfo
    ) public {
        assertEq(safeAddress().balance, _safeBalance);
        assertEq(address(0).balance, _zeroAddressBalance);
        assertEq(_deploymentInfo.fundsRequestedForSafe, _requestedFunds);
    }

    function assertCorrectFundCheckAction(
        FoundryDeploymentInfo memory _deploymentInfo,
        uint _expectedValue
    ) public {
        ParsedAccountAccess memory fundTransferAccess = decodeParsedAccountAcccesses(
            _deploymentInfo
        )[0];
        assertEq(fundTransferAccess.root.accessor, _deploymentInfo.safeAddress);
        assertEq(fundTransferAccess.root.account, _deploymentInfo.safeAddress);
        assertEq(fundTransferAccess.root.value, _expectedValue);
        assertEq(uint(fundTransferAccess.root.kind), uint(VmSafe.AccountAccessKind.Call));
        assertEq(fundTransferAccess.root.data, "");
        assertEq(fundTransferAccess.nested.length, 0);
    }
}
