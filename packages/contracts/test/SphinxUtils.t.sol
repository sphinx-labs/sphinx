// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../contracts/forge-std/src/Test.sol";
import { VmSafe } from "../contracts/forge-std/src/Vm.sol";
import { SphinxUtils } from "../contracts/foundry/SphinxUtils.sol";
import { SphinxForkCheck } from "../contracts/foundry/SphinxForkCheck.sol";
import {
    FoundryContractConfig,
    OptionalString,
    ContractKindEnum,
    ParsedCallAction,
    Network,
    InitialChainState,
    FoundryDeploymentInfo,
    InternalSphinxConfig,
    ParsedAccountAccess,
    UserSphinxConfig
} from "../contracts/foundry/SphinxPluginTypes.sol";
import { SphinxTestUtils } from "./SphinxTestUtils.sol";

contract SphinxUtils_Test is Test, SphinxUtils, SphinxTestUtils {
    address dummySafeAddress = address(0x1234);

    function setUp() public {}

    function test_checkAccesses_passes() external {
        vm.startStateDiffRecording();
        new SphinxForkCheck{ salt: 0 }();
        Vm.AccountAccess[] memory accountAccesses = vm.stopAndReturnStateDiff();

        assertEq(
            checkAccesses(
                accountAccesses,
                keccak256(type(SphinxForkCheck).creationCode),
                keccak256(type(SphinxForkCheck).runtimeCode)
            ),
            true
        );
    }

    function test_sphinxCheckAccesses_fails_did_not_use_default_factory() external {
        address expectedAddress = vm.computeCreate2Address(
            0,
            keccak256(type(SphinxForkCheck).creationCode),
            DETERMINISTIC_DEPLOYMENT_PROXY
        );

        Vm.AccountAccess[] memory accountAccesses = new Vm.AccountAccess[](2);
        accountAccesses[0] = VmSafe.AccountAccess({
            chainInfo: VmSafe.ChainInfo(0, 1),
            kind: VmSafe.AccountAccessKind.Call,
            // This is the incorrect field for this test.
            // This covers the case that the address of the create2 factory used
            // is incorrect for some reason.
            account: address(0x11),
            accessor: address(this),
            initialized: false,
            oldBalance: 0,
            newBalance: 0,
            deployedCode: new bytes(0),
            value: 0,
            data: type(SphinxForkCheck).creationCode,
            reverted: false,
            storageAccesses: new Vm.StorageAccess[](0),
            depth: 0
        });
        accountAccesses[1] = VmSafe.AccountAccess({
            chainInfo: VmSafe.ChainInfo(0, 1),
            kind: VmSafe.AccountAccessKind.Create,
            account: address(expectedAddress),
            accessor: DETERMINISTIC_DEPLOYMENT_PROXY,
            initialized: false,
            oldBalance: 0,
            newBalance: 0,
            deployedCode: type(SphinxForkCheck).runtimeCode,
            value: 0,
            data: type(SphinxForkCheck).creationCode,
            reverted: false,
            storageAccesses: new Vm.StorageAccess[](0),
            depth: 1
        });

        bool passedCheck = checkAccesses(
            accountAccesses,
            keccak256(type(SphinxForkCheck).creationCode),
            keccak256(type(SphinxForkCheck).runtimeCode)
        );
        assertEq(passedCheck, false);
    }

    function test_sphinxCheckAccesses_fails_incorrect_deployed_code_in_simulation() external {
        address expectedAddress = vm.computeCreate2Address(
            0,
            keccak256(type(SphinxForkCheck).creationCode),
            DETERMINISTIC_DEPLOYMENT_PROXY
        );

        Vm.AccountAccess[] memory accountAccesses = new Vm.AccountAccess[](2);
        accountAccesses[0] = VmSafe.AccountAccess({
            chainInfo: VmSafe.ChainInfo(0, 1),
            kind: VmSafe.AccountAccessKind.Call,
            account: address(DETERMINISTIC_DEPLOYMENT_PROXY),
            accessor: address(this),
            initialized: false,
            oldBalance: 0,
            newBalance: 0,
            deployedCode: new bytes(0),
            value: 0,
            data: type(SphinxForkCheck).creationCode,
            reverted: false,
            storageAccesses: new Vm.StorageAccess[](0),
            depth: 0
        });
        accountAccesses[1] = VmSafe.AccountAccess({
            chainInfo: VmSafe.ChainInfo(0, 1),
            kind: VmSafe.AccountAccessKind.Create,
            account: address(expectedAddress),
            accessor: DETERMINISTIC_DEPLOYMENT_PROXY,
            initialized: false,
            oldBalance: 0,
            newBalance: 0,
            // This field is correct, and that is expected because this function is testing the case
            // where the code at the expected address is incorrect in the actual simulation.
            // The code will be incorrect in this case because we did not deploy the contract to the
            // expected address.
            deployedCode: type(SphinxForkCheck).runtimeCode,
            value: 0,
            data: type(SphinxForkCheck).creationCode,
            reverted: false,
            storageAccesses: new Vm.StorageAccess[](0),
            depth: 1
        });

        bool passedCheck = checkAccesses(
            accountAccesses,
            keccak256(type(SphinxForkCheck).creationCode),
            keccak256(type(SphinxForkCheck).runtimeCode)
        );
        assertEq(passedCheck, false);
    }

    function test_sphinxCheckAccesses_fails_incorrect_address() external {
        Vm.AccountAccess[] memory accountAccesses = new Vm.AccountAccess[](2);
        accountAccesses[0] = VmSafe.AccountAccess({
            chainInfo: VmSafe.ChainInfo(0, 1),
            kind: VmSafe.AccountAccessKind.Call,
            account: address(DETERMINISTIC_DEPLOYMENT_PROXY),
            accessor: address(this),
            initialized: false,
            oldBalance: 0,
            newBalance: 0,
            deployedCode: new bytes(0),
            value: 0,
            data: type(SphinxForkCheck).creationCode,
            reverted: false,
            storageAccesses: new Vm.StorageAccess[](0),
            depth: 0
        });
        accountAccesses[1] = VmSafe.AccountAccess({
            chainInfo: VmSafe.ChainInfo(0, 1),
            kind: VmSafe.AccountAccessKind.Create,
            // This is the field we're testing. This covers the case
            // where the address of the deploy contract is incorrect
            // for some reason.
            account: address(0x11),
            accessor: DETERMINISTIC_DEPLOYMENT_PROXY,
            initialized: false,
            oldBalance: 0,
            newBalance: 0,
            deployedCode: type(SphinxForkCheck).runtimeCode,
            value: 0,
            data: type(SphinxForkCheck).creationCode,
            reverted: false,
            storageAccesses: new Vm.StorageAccess[](0),
            depth: 1
        });

        bool passedCheck = checkAccesses(
            accountAccesses,
            keccak256(type(SphinxForkCheck).creationCode),
            keccak256(type(SphinxForkCheck).runtimeCode)
        );
        assertEq(passedCheck, false);
    }

    function test_sphinxCheckAccesses_false_single_access() external {
        Vm.AccountAccess[] memory accountAccesses = new Vm.AccountAccess[](1);
        accountAccesses[0] = VmSafe.AccountAccess({
            chainInfo: VmSafe.ChainInfo(0, 1),
            kind: VmSafe.AccountAccessKind.Create,
            account: address(0x11),
            accessor: address(this),
            initialized: false,
            oldBalance: 0,
            newBalance: 0,
            deployedCode: abi.encode(1),
            value: 0,
            data: type(SphinxForkCheck).creationCode,
            reverted: false,
            storageAccesses: new Vm.StorageAccess[](0),
            depth: 0
        });

        bool passedCheck = checkAccesses(
            accountAccesses,
            keccak256(type(SphinxForkCheck).creationCode),
            keccak256(type(SphinxForkCheck).runtimeCode)
        );
        assertEq(passedCheck, false);
    }

    function test_parseAccountAccesses_emptyInput() public {
        Vm.AccountAccess[] memory accesses;
        ParsedAccountAccess[] memory parsed = parseAccountAccesses(
            accesses,
            dummySafeAddress,
            defaultCallDepth,
            block.chainid
        );
        assertEq(parsed.length, 0);
    }

    function test_parseAccountAccesses_noRoots() public {
        Vm.AccountAccess[] memory accesses = new Vm.AccountAccess[](3);
        accesses[0] = makeAccountAccess({
            _accessor: address(0x1),
            _kind: VmSafe.AccountAccessKind.Call,
            _depth: 3
        });
        accesses[1] = makeAccountAccess({
            _accessor: address(0x2),
            _kind: VmSafe.AccountAccessKind.Create,
            _depth: 3
        });
        accesses[2] = makeAccountAccess({
            _accessor: address(0x3),
            _kind: VmSafe.AccountAccessKind.Extcodesize,
            _depth: 3
        });

        ParsedAccountAccess[] memory parsed = parseAccountAccesses(
            accesses,
            dummySafeAddress,
            defaultCallDepth,
            block.chainid
        );
        assertEq(parsed.length, 0);
    }

    function test_parseAccountAccesses_noNested() public {
        Vm.AccountAccess[] memory accesses = new Vm.AccountAccess[](2);
        accesses[0] = makeAccountAccess({
            _accessor: dummySafeAddress,
            _kind: VmSafe.AccountAccessKind.Call,
            _depth: 2
        });
        accesses[1] = makeAccountAccess({
            _accessor: dummySafeAddress,
            _kind: VmSafe.AccountAccessKind.Create,
            _depth: 2
        });

        ParsedAccountAccess[] memory parsed = parseAccountAccesses(
            accesses,
            dummySafeAddress,
            defaultCallDepth,
            block.chainid
        );
        assertEq(parsed.length, 2);

        assertEq(parsed[0].root.accessor, dummySafeAddress);
        assertEq(parsed[0].root.kind, VmSafe.AccountAccessKind.Call);
        assertEq(parsed[0].nested.length, 0);

        assertEq(parsed[1].root.accessor, dummySafeAddress);
        assertEq(parsed[1].root.kind, VmSafe.AccountAccessKind.Create);
        assertEq(parsed[1].nested.length, 0);
    }

    /**
     * @notice Check that the serialization function starts with a fresh state for the object key.
     *         This ensures existing items in the object key aren't included in the serialized JSON.
     *         We enforce this by including `vm.serializeJson(objKey, "{}")` at the beginning of the
     *         serialization function.
     */
    function test_serializeInitialChainState_success_clearsObjectKey() external {
        InitialChainState memory initialState;
        // Add an item to the object key, which is the same object key used in the serialization
        // function.
        string memory serialized = vm.serializeString(initialStateKey, "myKey", "myVal");
        // Check that the item has been added.
        assertTrue(vm.keyExists(serialized, ".myKey"));

        serialized = serializeInitialChainState(initialState);
        // Check that the item no longer exists in the JSON.
        assertFalse(vm.keyExists(serialized, ".myKey"));
    }

    /**
     * @notice Check that the serialization function starts with a fresh state for the object key.
     *         This ensures existing items in the object key aren't included in the serialized JSON.
     *         We enforce this by including `vm.serializeJson(objKey, "{}")` at the beginning of the
     *         serialization function.
     */
    function test_serializeFoundryDeploymentInfo_success_clearsObjectKey() external {
        FoundryDeploymentInfo memory deploymentInfo;
        // Add an item to the object key, which is the same object key used in the serialization
        // function.
        string memory serialized = vm.serializeString(deploymentInfoKey, "myKey", "myVal");
        // Check that the item has been added.
        assertTrue(vm.keyExists(serialized, ".myKey"));

        serialized = serializeFoundryDeploymentInfo(deploymentInfo);
        // Check that the item no longer exists in the JSON.
        assertFalse(vm.keyExists(serialized, ".myKey"));
    }

    /**
     * @notice Check that the serialization function starts with a fresh state for the object key.
     *         This ensures existing items in the object key aren't included in the serialized JSON.
     *         We enforce this by including `vm.serializeJson(objKey, "{}")` at the beginning of the
     *         serialization function.
     */
    function test_serializeSphinxConfig_success_clearsObjectKey() external {
        InternalSphinxConfig memory sphinxConfig;
        // Add an item to the object key, which is the same object key used in the serialization
        // function.
        string memory serialized = vm.serializeString(sphinxConfigKey, "myKey", "myVal");
        // Check that the item has been added.
        assertTrue(vm.keyExists(serialized, ".myKey"));

        serialized = serializeSphinxConfig(sphinxConfig);
        // Check that the item no longer exists in the JSON.
        assertFalse(vm.keyExists(serialized, ".myKey"));
    }

    function test_validate_revert_empty_config() external {
        UserSphinxConfig memory config;
        vm.expectRevert(
            "Sphinx: Detected missing Sphinx config. Are you sure you implemented the `configureSphinx` function correctly?\nSee the configuration options reference for more information:\nhttps://github.com/sphinx-labs/sphinx/blob/master/docs/writing-scripts.md#configuration-options"
        );
        validate(config);
    }

    function test_getNumNestedAccountAccesses_success_nextAccessIsRootWithDifferentChainId()
        external
    {
        Vm.AccountAccess[] memory accesses = new Vm.AccountAccess[](2);
        // Root account access:
        accesses[0] = makeAccountAccess({
            _accessor: dummySafeAddress,
            _kind: VmSafe.AccountAccessKind.Create,
            _depth: 2
        });
        // Next account access, which has a different chain ID:
        Vm.AccountAccess memory nextAccess = makeAccountAccess({
            _accessor: dummySafeAddress,
            _kind: VmSafe.AccountAccessKind.Create,
            _depth: 2 // Also a root account access
        });
        nextAccess.chainInfo.chainId = block.chainid - 1;
        accesses[1] = nextAccess;

        uint256 numNested = getNumNestedAccountAccesses({
            _accesses: accesses,
            _rootIdx: 0,
            _safeAddress: dummySafeAddress,
            _callDepth: defaultCallDepth,
            _chainId: block.chainid
        });

        assertEq(numNested, 0);
    }

    function test_getNumNestedAccountAccesses_success_nextAccessIsNestedWithDifferentChainId()
        external
    {
        Vm.AccountAccess[] memory accesses = new Vm.AccountAccess[](2);
        // Root account access:
        accesses[0] = makeAccountAccess({
            _accessor: dummySafeAddress,
            _kind: VmSafe.AccountAccessKind.Create,
            _depth: 2
        });
        // Next account access, which has a different chain ID:
        Vm.AccountAccess memory nextAccess = makeAccountAccess({
            _accessor: dummySafeAddress,
            _kind: VmSafe.AccountAccessKind.Create,
            _depth: 3 // Nested account access
        });
        nextAccess.chainInfo.chainId = block.chainid - 1;
        accesses[1] = nextAccess;

        uint256 numNested = getNumNestedAccountAccesses({
            _accesses: accesses,
            _rootIdx: 0,
            _safeAddress: dummySafeAddress,
            _callDepth: defaultCallDepth,
            _chainId: block.chainid
        });

        assertEq(numNested, 0);
    }

    /////////////////////////////////// Helpers //////////////////////////////////////

    function makeAccountAccess(
        address _accessor,
        Vm.AccountAccessKind _kind,
        uint64 _depth
    ) private view returns (Vm.AccountAccess memory) {
        Vm.AccountAccess memory access;
        access.kind = _kind;
        access.accessor = _accessor;
        access.depth = _depth;
        access.chainInfo.chainId = block.chainid;
        return access;
    }

    function assertEq(VmSafe.AccountAccessKind _a, VmSafe.AccountAccessKind _b) private {
        assertEq(uint8(_a), uint8(_b));
    }
}
