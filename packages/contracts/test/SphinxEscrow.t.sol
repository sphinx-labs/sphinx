// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "forge-std/Test.sol";
import { SphinxEscrow } from "../contracts/SphinxEscrow.sol";
import { ManagedService } from "../contracts/ManagedService.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Tests for the SphinxEscrow contract on a fork of Optimism mainnet.
 */
contract SphinxEscrow_Test is Test {
    using stdStorage for StdStorage;

    bytes32 constant FUNDER_ROLE = keccak256("FUNDER_ROLE");

    string alchemyApiKey = vm.envString("ALCHEMY_API_KEY");
    string optimismRpcUrl =
        string(abi.encodePacked("https://opt-mainnet.g.alchemy.com/v2/", alchemyApiKey));

    string orgId = "test-org-id";
    address funder = address(1);
    address nonFunder = address(2);
    address managedServiceOwner = address(3);
    address receiverOne = address(4);
    address receiverTwo = address(5);
    address user = address(6);
    uint256 usdcTransferAmountOne = 5 * (10 ** 18); // 5 USDC
    uint256 usdcTransferAmountTwo = 3 * (10 ** 18); // 3 USDC

    // USDC contract on Optimism mainnet
    ERC20 usdc = ERC20(0x7F5c764cBc14f9669B88837ca1490cCa17c31607);

    SphinxEscrow escrow;
    ManagedService managedService;

    function setUp() public {
        vm.createSelectFork(optimismRpcUrl);

        managedService = new ManagedService(managedServiceOwner, address(usdc));

        // Grant the funder role to the funder
        vm.prank(managedServiceOwner);
        managedService.grantRole(FUNDER_ROLE, funder);

        escrow = new SphinxEscrow(orgId, address(usdc), address(managedService));

        // Give the SphinxEscrow contract some USDC
        uint256 usdcAmount = usdcTransferAmountOne + usdcTransferAmountTwo;
        stdstore
            .target(address(usdc))
            .sig("balanceOf(address)")
            .with_key(address(escrow))
            .checked_write(usdcAmount);

        // Sanity check that the SphinxEscrow contract has the USDC
        assertEq(usdc.balanceOf(address(escrow)), usdcAmount);
    }

    function test_constructor_succeeds() external {
        assertEq(escrow.orgId(), orgId);
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(address(escrow.managedService()), address(managedService));
    }

    function test_batchTransfer_nonFunder_reverts() external {
        vm.prank(nonFunder);
        vm.expectRevert("SphinxEscrow: caller is not a funder");
        escrow.batchTransfer(new address[](0), new uint256[](0));
    }

    function test_batchTransfer_arrayLengthMismatch_reverts() external {
        vm.prank(funder);
        vm.expectRevert("SphinxEscrow: array length mismatch");
        escrow.batchTransfer(new address[](1), new uint256[](2));
    }

    function test_batchTransfer_succeeds() external {
        address[] memory to = new address[](2);
        to[0] = receiverOne;
        to[1] = receiverTwo;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = usdcTransferAmountOne;
        amounts[1] = usdcTransferAmountTwo;

        vm.prank(funder);
        escrow.batchTransfer(to, amounts);

        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(receiverOne), usdcTransferAmountOne);
        assertEq(usdc.balanceOf(receiverTwo), usdcTransferAmountTwo);
    }

    function test_transferFrom_nonFunder_reverts() external {
        vm.prank(nonFunder);
        vm.expectRevert("SphinxEscrow: caller is not a funder");
        escrow.transferFrom(address(escrow), receiverOne, usdcTransferAmountOne);
    }

    function test_transferFrom_succeeds() external {
        uint256 amount = 10 * (10 ** 18); // 10 USDC
        stdstore
            .target(address(usdc))
            .sig("balanceOf(address)")
            .with_key(address(user))
            .checked_write(amount);

        // Sanity check that the user has the USDC
        assertEq(usdc.balanceOf(address(user)), amount);

        // Approve the Escrow contract to spend the user's USDC
        vm.prank(user);
        usdc.approve(address(escrow), amount);
        // Check that the Escrow contract has the allowance
        assertEq(usdc.allowance(address(user), address(escrow)), amount);

        assertEq(usdc.balanceOf(receiverOne), 0);

        vm.prank(funder);
        escrow.transferFrom(user, receiverOne, amount);

        assertEq(usdc.balanceOf(user), 0);
        assertEq(usdc.balanceOf(receiverOne), amount);
        assertEq(usdc.allowance(address(user), address(escrow)), 0);
    }

    function test_receive_reverts() external {
        vm.expectRevert("SphinxEscrow: cannot receive ETH");
        (bool success, ) = address(escrow).call{ value: 1 }(new bytes(0));
        assertEq(success, false);
    }
}
