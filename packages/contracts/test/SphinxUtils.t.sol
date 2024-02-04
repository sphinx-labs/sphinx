// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/forge-std/src/Test.sol";
import { VmSafe } from "../lib/forge-std/src/Vm.sol";
import { SphinxUtils } from "../contracts/foundry/SphinxUtils.sol";
import { SphinxForkCheck } from "../contracts/foundry/SphinxForkCheck.sol";
import {
    FoundryContractConfig,
    OptionalString,
    ContractKindEnum,
    ParsedCallAction,
    Network,
    ParsedAccountAccess
} from "../contracts/foundry/SphinxPluginTypes.sol";

contract SphinxUtils_Test is Test, SphinxUtils {
    address dummySafeAddress = address(0x1234);

    function setUp() public {}

    function test_checkFork_passes() external {
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
            storageAccesses: new Vm.StorageAccess[](0)
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
            storageAccesses: new Vm.StorageAccess[](0)
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
            storageAccesses: new Vm.StorageAccess[](0)
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
            storageAccesses: new Vm.StorageAccess[](0)
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
            storageAccesses: new Vm.StorageAccess[](0)
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
            storageAccesses: new Vm.StorageAccess[](0)
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
            storageAccesses: new Vm.StorageAccess[](0)
        });

        bool passedCheck = checkAccesses(
            accountAccesses,
            keccak256(type(SphinxForkCheck).creationCode),
            keccak256(type(SphinxForkCheck).runtimeCode)
        );
        assertEq(passedCheck, false);
    }

    function test_getUniqueAddresses_success_allUnique() external {
        address[] memory addresses = new address[](3);
        addresses[0] = address(0x1);
        addresses[1] = address(0x2);
        addresses[2] = address(0x3);

        address[] memory uniqueAddresses = getUniqueAddresses(addresses);

        assertEq(uniqueAddresses.length, 3);
        assertEq(uniqueAddresses[0], address(0x1));
        assertEq(uniqueAddresses[1], address(0x2));
        assertEq(uniqueAddresses[2], address(0x3));
    }

    function test_getUniqueAddresses_success_allDuplicates() external {
        address[] memory addresses = new address[](3);
        addresses[0] = address(0);
        addresses[1] = address(0);
        addresses[2] = address(0);

        address[] memory uniqueAddresses = getUniqueAddresses(addresses);

        assertEq(uniqueAddresses.length, 1);
        assertEq(uniqueAddresses[0], address(0));
    }

    function test_getUniqueAddresses_success_mixed() external {
        address[] memory addresses = new address[](8);
        addresses[0] = address(0);
        addresses[1] = address(0x1);
        addresses[2] = address(0x2);
        addresses[3] = address(0x1);
        addresses[4] = address(0x3);
        addresses[5] = address(0x3);
        addresses[6] = address(0x3);
        addresses[7] = address(0);

        address[] memory uniqueAddresses = getUniqueAddresses(addresses);

        assertEq(uniqueAddresses.length, 4);
        assertEq(uniqueAddresses[0], address(0));
        assertEq(uniqueAddresses[1], address(0x1));
        assertEq(uniqueAddresses[2], address(0x2));
        assertEq(uniqueAddresses[3], address(0x3));
    }

    function test_getUniqueAddresses_success_emptyArray() external {
        address[] memory addresses = new address[](0);

        address[] memory uniqueAddresses = getUniqueAddresses(addresses);

        assertEq(uniqueAddresses.length, 0);
    }

    function test_getUniqueUint256_success_allUnique() external {
        uint256[] memory values = new uint256[](3);
        values[0] = 2;
        values[1] = 1;
        values[2] = 3;

        uint256[] memory uniqueValues = getUniqueUint256(values);

        assertEq(uniqueValues.length, 3);
        assertEq(uniqueValues[0], 2);
        assertEq(uniqueValues[1], 1);
        assertEq(uniqueValues[2], 3);
    }

    function test_getUniqueUint256_success_allDuplicates() external {
        uint256[] memory values = new uint256[](3);
        values[0] = 1;
        values[1] = 1;
        values[2] = 1;

        uint256[] memory uniqueValues = getUniqueUint256(values);

        assertEq(uniqueValues.length, 1);
        assertEq(uniqueValues[0], 1);
    }

    function test_getUniqueUint256_success_mixed() external {
        uint256[] memory values = new uint256[](8);
        values[0] = 0;
        values[1] = 1;
        values[2] = 2;
        values[3] = 1;
        values[4] = 3;
        values[5] = 3;
        values[6] = 3;
        values[7] = 0;

        uint256[] memory uniqueValues = getUniqueUint256(values);

        assertEq(uniqueValues.length, 4);
        assertEq(uniqueValues[0], 0);
        assertEq(uniqueValues[1], 1);
        assertEq(uniqueValues[2], 2);
        assertEq(uniqueValues[3], 3);
    }

    function test_getUniqueUint256_success_emptyArray() external {
        uint256[] memory values = new uint256[](0);

        uint256[] memory uniqueValues = getUniqueUint256(values);

        assertEq(uniqueValues.length, 0, "The returned array should be empty");
    }

    function test_parseAccountAccesses_emptyInput() public {
        Vm.AccountAccess[] memory accesses;
        ParsedAccountAccess[] memory parsed = parseAccountAccesses(accesses, dummySafeAddress);
        assertEq(parsed.length, 0);
    }

    function test_parseAccountAccesses_noRoots() public {
        Vm.AccountAccess[] memory accesses = new Vm.AccountAccess[](3);
        accesses[0] = makeAccountAccess({
            _accessor: address(0x1),
            _kind: VmSafe.AccountAccessKind.Call
        });
        accesses[1] = makeAccountAccess({
            _accessor: address(0x2),
            _kind: VmSafe.AccountAccessKind.Create
        });
        accesses[2] = makeAccountAccess({
            _accessor: address(0x3),
            _kind: VmSafe.AccountAccessKind.Extcodesize
        });

        ParsedAccountAccess[] memory parsed = parseAccountAccesses(accesses, dummySafeAddress);
        assertEq(parsed.length, 0);
    }

    function test_parseAccountAccesses_noNested() public {
        Vm.AccountAccess[] memory accesses = new Vm.AccountAccess[](2);
        accesses[0] = makeAccountAccess({
            _accessor: dummySafeAddress,
            _kind: VmSafe.AccountAccessKind.Call
        });
        accesses[1] = makeAccountAccess({
            _accessor: dummySafeAddress,
            _kind: VmSafe.AccountAccessKind.Create
        });

        ParsedAccountAccess[] memory parsed = parseAccountAccesses(accesses, dummySafeAddress);
        assertEq(parsed.length, 2);

        assertEq(parsed[0].root.accessor, dummySafeAddress);
        assertEq(parsed[0].root.kind, VmSafe.AccountAccessKind.Call);
        assertEq(parsed[0].nested.length, 0);

        assertEq(parsed[1].root.accessor, dummySafeAddress);
        assertEq(parsed[1].root.kind, VmSafe.AccountAccessKind.Create);
        assertEq(parsed[1].nested.length, 0);
    }

    function makeAccountAccess(
        address _accessor,
        Vm.AccountAccessKind _kind
    ) private pure returns (Vm.AccountAccess memory) {
        Vm.AccountAccess memory access;
        access.kind = _kind;
        access.accessor = _accessor;
        return access;
    }

    function assertEq(VmSafe.AccountAccessKind _a, VmSafe.AccountAccessKind _b) private {
        assertEq(uint8(_a), uint8(_b));
    }
}
