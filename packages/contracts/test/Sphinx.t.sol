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

import { Sphinx, Network } from "../contracts/foundry/Sphinx.sol";
import { IGnosisSafe } from "../contracts/foundry/interfaces/IGnosisSafe.sol";
import {
    SystemContractInfo,
    FoundryDeploymentInfo,
    ParsedAccountAccess
} from "../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxTestUtils } from "./SphinxTestUtils.sol";
import { MySimpleContract } from "../test/helpers/MyTestContracts.t.sol";

contract Sphinx_Test is Test, Sphinx, SphinxTestUtils {
    string dummyDeploymentInfoPath;

    function setUp() public {
        SystemContractInfo[] memory contracts = getSystemContractInfo();
        deploySphinxSystem(contracts);

        dummyDeploymentInfoPath = vm.envString("DUMMY_DEPLOYMENT_INFO_PATH");
    }

    function configureSphinx() public override {
        sphinxConfig.projectName = "test_project";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.threshold = 1;
        sphinxConfig.orgId = "test-org-id";
    }

    function test_sphinxModule_success_standard() external {
        IGnosisSafe safeProxy = IGnosisSafe(deploySphinxModuleAndGnosisSafe(sphinxConfig));

        (address[] memory modules,) = safeProxy.getModulesPaginated(address(0x1), 1);
        address sphinxModule = modules[0];

        address expectedAddress = this.sphinxModule();

        assertEq(expectedAddress, sphinxModule);
    }

    function test_sphinxModule_success_nonZeroSaltNonce() external {
        sphinxConfig.saltNonce = 1;
        IGnosisSafe safeProxy = IGnosisSafe(deploySphinxModuleAndGnosisSafe(sphinxConfig));

        (address[] memory modules,) = safeProxy.getModulesPaginated(address(0x1), 1);
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
        ParsedAccountAccess memory access =
            abi.decode(deploymentInfo.encodedAccountAccesses[0], (ParsedAccountAccess));
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
