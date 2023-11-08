// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "sphinx-forge-std/Test.sol";
import { SphinxBalanceFactory } from "../contracts/SphinxBalanceFactory.sol";
import { SphinxBalance } from "../contracts/SphinxBalance.sol";
import { SphinxEscrow } from "../contracts/SphinxEscrow.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract SphinxBalanceFactory_Test is Test {
    event BalanceFactoryDeployment(
        string indexed orgIdHash,
        address owner,
        string orgId,
        address caller,
        address balance,
        address escrow
    );

    string alchemyApiKey = vm.envString("ALCHEMY_API_KEY");
    string optimismRpcUrl =
        string(abi.encodePacked("https://opt-mainnet.g.alchemy.com/v2/", alchemyApiKey));

    SphinxBalanceFactory factory;

    address usdc = 0x7F5c764cBc14f9669B88837ca1490cCa17c31607;
    address managedService = address(2);
    address owner = address(3);
    address caller = address(4);
    string orgId = "test-org-id";

    function setUp() public {
        vm.createSelectFork(optimismRpcUrl);
        factory = new SphinxBalanceFactory(usdc, managedService);
    }

    function test_constructor_succeeds() external {
        assertEq(factory.usdc(), usdc);
        assertEq(factory.managedService(), managedService);
    }

    function test_deploy_ownerIsZero_reverts() external {
        vm.expectRevert("SphinxBalanceFactory: owner cannot be address(0)");
        factory.deploy(orgId, address(0));
    }

    function test_deploy_isDeployed_reverts() external {
        factory.deploy(orgId, owner);
        vm.expectRevert("SphinxBalanceFactory: org id already deployed");
        factory.deploy(orgId, owner);
    }

    function test_deploy_succeeds() external {
        bytes32 salt = keccak256(abi.encode(orgId));
        bytes memory escrowInitCode = abi.encodePacked(
            type(SphinxEscrow).creationCode,
            abi.encode(orgId, usdc, managedService)
        );
        address escrow = Create2.computeAddress(salt, keccak256(escrowInitCode), address(factory));

        bytes memory balanceInitCode = abi.encodePacked(
            type(SphinxBalance).creationCode,
            abi.encode(orgId, address(factory), usdc, escrow)
        );

        address balance = Create2.computeAddress(
            salt,
            keccak256(balanceInitCode),
            address(factory)
        );

        vm.expectEmit(address(factory));
        emit BalanceFactoryDeployment(orgId, owner, orgId, caller, balance, escrow);

        vm.prank(caller);
        factory.deploy(orgId, owner);
        assertTrue(factory.isDeployed(keccak256(abi.encode(orgId))));

        assertEq(Ownable(balance).owner(), owner);
        assertEq(address(SphinxBalance(balance).usdc()), usdc);
        assertEq(SphinxBalance(balance).orgId(), orgId);
        assertEq(address(SphinxBalance(balance).escrow()), escrow);

        assertEq(address(SphinxEscrow(escrow).usdc()), usdc);
        assertEq(SphinxEscrow(escrow).orgId(), orgId);
        assertEq(address(SphinxEscrow(escrow).managedService()), managedService);
    }
}
