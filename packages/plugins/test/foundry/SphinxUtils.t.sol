// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "forge-std/Test.sol";
import { SphinxUtils } from "../../contracts/foundry/SphinxUtils.sol";
import { FoundryContractConfig, OptionalString, ContractKindEnum, ParsedCallAction } from "../../contracts/foundry/SphinxPluginTypes.sol";

contract SphinxUtils_Test is Test, SphinxUtils {
    function setUp() public {}

    function test_getUniqueAddresses_succeeds_allUnique() external {
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

    function test_getUniqueAddresses_succeeds_allDuplicates() external {
        address[] memory addresses = new address[](3);
        addresses[0] = address(0);
        addresses[1] = address(0);
        addresses[2] = address(0);

        address[] memory uniqueAddresses = getUniqueAddresses(addresses);

        assertEq(uniqueAddresses.length, 1);
        assertEq(uniqueAddresses[0], address(0));
    }

    function test_getUniqueAddresses_succeeds_mixed() external {
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

    function test_findReferenceNameForAddress_succeeds_containsReferenceName() external {
        FoundryContractConfig[] memory contractConfigs = new FoundryContractConfig[](3);
        contractConfigs[0] = FoundryContractConfig({ referenceName: "a", addr: address(0x1), kind: ContractKindEnum.IMMUTABLE, userSaltHash: bytes32(0) });
        contractConfigs[1] = FoundryContractConfig({ referenceName: "b", addr: address(0x2), kind: ContractKindEnum.IMMUTABLE, userSaltHash: bytes32(0) });
        contractConfigs[2] = FoundryContractConfig({ referenceName: "c", addr: address(0x3), kind: ContractKindEnum.IMMUTABLE, userSaltHash: bytes32(0) });

        OptionalString memory optionalString = findReferenceNameForAddress(address(0x2), contractConfigs);

        assertEq(optionalString.exists, true);
        assertEq(optionalString.value, "b");
    }

    function test_findReferenceNameForAddress_succeeds_doesNotContainReferenceName() external {
        FoundryContractConfig[] memory contractConfigs = new FoundryContractConfig[](3);
        contractConfigs[0] = FoundryContractConfig({ referenceName: "a", addr: address(0x1), kind: ContractKindEnum.IMMUTABLE, userSaltHash: bytes32(0) });
        contractConfigs[1] = FoundryContractConfig({ referenceName: "b", addr: address(0x2), kind: ContractKindEnum.IMMUTABLE, userSaltHash: bytes32(0) });
        contractConfigs[2] = FoundryContractConfig({ referenceName: "c", addr: address(0x3), kind: ContractKindEnum.IMMUTABLE, userSaltHash: bytes32(0) });

        OptionalString memory optionalString = findReferenceNameForAddress(address(0x4), contractConfigs);

        assertEq(optionalString.exists, false);
        assertEq(optionalString.value, "");
    }

    function test_getUndeployedExternalContracts_succeeds() external {
        address[] memory uniquePostDeployAddresses = new address[](5);
        // These contracts will be defined in the config, which means they are not external.
        uniquePostDeployAddresses[0] = address(0x11);
        uniquePostDeployAddresses[1] = address(0x22);
        uniquePostDeployAddresses[2] = address(0x33);
        // These contracts are external.
        uniquePostDeployAddresses[3] = address(0x44);
        uniquePostDeployAddresses[4] = address(0x55);

        // Set the deployed bytecode at some of the addresses to mimic a deployed contract
        vm.etch(address(0x11), hex"1234");
        vm.etch(address(0x33), hex"5678");
        vm.etch(address(0x55), hex"9abc");

        FoundryContractConfig[] memory contractConfigs = new FoundryContractConfig[](3);
        contractConfigs[0] = FoundryContractConfig({ referenceName: "a", addr: address(0x11), kind: ContractKindEnum.IMMUTABLE, userSaltHash: bytes32(0) });
        contractConfigs[1] = FoundryContractConfig({ referenceName: "b", addr: address(0x22), kind: ContractKindEnum.IMMUTABLE, userSaltHash: bytes32(0) });
        contractConfigs[2] = FoundryContractConfig({ referenceName: "c", addr: address(0x33), kind: ContractKindEnum.IMMUTABLE, userSaltHash: bytes32(0) });

        address[] memory undeployedExternalContracts = getUndeployedExternalContracts(uniquePostDeployAddresses, contractConfigs);

        assertEq(undeployedExternalContracts.length, 1);
        assertEq(undeployedExternalContracts[0], address(0x44));
    }
}
