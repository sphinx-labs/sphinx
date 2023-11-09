// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "sphinx-forge-std/Test.sol";
import { SphinxBalance } from "../contracts/core/SphinxBalance.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Tests for the SphinxBalance contract on a fork of Optimism mainnet.
 */
contract SphinxBalance_Test is Test {
    using stdStorage for StdStorage;

    string alchemyApiKey = vm.envString("ALCHEMY_API_KEY");
    string optimismRpcUrl =
        string(abi.encodePacked("https://opt-mainnet.g.alchemy.com/v2/", alchemyApiKey));

    // USDC contract on Optimism mainnet
    ERC20 usdc = ERC20(0x7F5c764cBc14f9669B88837ca1490cCa17c31607);

    SphinxBalance balance;
    string orgId = "test-org-id";
    address owner = address(1);
    address nonOwner = address(2);
    address receiver = address(3);
    address spender = address(4);
    address escrow = address(5);
    uint256 usdcTransferAmount = 2 * (10 ** 18); // 2 USDC
    uint256 allowance = 1 * (10 ** 18);

    function setUp() public {
        vm.createSelectFork(optimismRpcUrl);

        balance = new SphinxBalance(orgId, owner, address(usdc), escrow);

        // Give the SphinxBalance contract some USDC
        stdstore
            .target(address(usdc))
            .sig("balanceOf(address)")
            .with_key(address(balance))
            .checked_write(usdcTransferAmount);

        // Sanity check that the SphinxBalance contract has the USDC
        assertEq(usdc.balanceOf(address(balance)), usdcTransferAmount);
    }

    function test_constructor_succeeds() external {
        assertEq(balance.orgId(), orgId);
        assertEq(balance.owner(), owner);
        assertEq(address(balance.usdc()), address(usdc));
        assertEq(balance.escrow(), escrow);
    }

    function test_transfer_notOwner_reverts() external {
        vm.prank(nonOwner);
        vm.expectRevert("Ownable: caller is not the owner");
        balance.transfer(nonOwner, 1);
    }

    function test_transfer_succeeds() external {
        vm.prank(owner);
        balance.transfer(receiver, usdcTransferAmount);

        assertEq(usdc.balanceOf(address(balance)), 0);
        assertEq(usdc.balanceOf(receiver), usdcTransferAmount);
    }
}
