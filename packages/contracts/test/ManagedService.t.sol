// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "sphinx-forge-std/Test.sol";
import { ManagedService } from "contracts/core/ManagedService.sol";

contract Endpoint {
    uint public x;

    constructor(uint _x) {
        x = _x;
    }

    function set(uint _x) public returns (uint) {
        x = _x;

        return x;
    }

    function doRevert() public {
        revert("did revert");
    }
}

contract ManagedService_Test is Test {
    ManagedService service;
    Endpoint endpoint;
    address owner = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address sender = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address invalidSender = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    bytes invalidCallerError = "ManagedService: invalid caller";

    event Called(address indexed relayer, address indexed to, bytes32 data);
    event Withdew(address indexed recipient, uint256 amount);

    function setUp() public {
        vm.startPrank(owner);

        service = new ManagedService(owner);
        endpoint = new Endpoint(1);

        service.grantRole(service.RELAYER_ROLE(), sender);
    }

    function test_RevertIfBalanceToLow() external {
        vm.startPrank(sender);
        vm.txGasPrice(2);

        vm.expectRevert("ManagedService: failed to refund caller");
        service.exec(address(endpoint), abi.encodeWithSelector(Endpoint.set.selector, 2));

        assertEq(endpoint.x(), 1);
    }

    function test_RevertCallerIsNotRelayer() external {
        vm.startPrank(invalidSender);
        vm.expectRevert(invalidCallerError);
        service.exec(address(endpoint), abi.encodeWithSelector(Endpoint.set.selector, 2));
    }

    function test_RevertIfUnderlyingCallReverts() external {
        vm.startPrank(sender);
        vm.expectRevert("did revert");
        service.exec(address(endpoint), abi.encodeWithSelector(Endpoint.doRevert.selector));
    }

    function test_SuccessfulCall() external {
        vm.startPrank(sender);
        vm.txGasPrice(2);
        vm.deal(address(service), 1 ether);

        bytes memory txData = abi.encodeWithSelector(Endpoint.set.selector, 2);

        // Expect the correct event is emitted
        vm.expectEmit(address(service));
        emit Called(sender, address(endpoint), keccak256(txData));

        // Call and calculate the gas used
        uint256 start = gasleft();
        bytes memory res = service.exec(address(endpoint), txData);
        uint256 end = gasleft();
        uint256 used = (start - end) * tx.gasprice;

        // Check that the senders balance is greater than or equal to the expected amount used
        assertGe(address(sender).balance, used);

        // Check that the function was properly called
        assertEq(endpoint.x(), 2);

        // Check that the response was returned
        assertEq(abi.decode(res, (uint)), 2);
    }

    function test_WithdrawRevertsIfNotRelayer() external {
        vm.startPrank(invalidSender);
        vm.deal(address(service), 1 ether);

        vm.expectRevert(invalidCallerError);
        service.withdraw(0.5 ether);
    }

    function test_WithdrawRevertsIfNotEnoughFunds() external {
        vm.startPrank(sender);

        vm.expectRevert("ManagedService: insufficient funds");
        service.withdraw(2 ether);
    }

    function test_WithdrawRevertsIfRecipientZeroAddress() external {
        vm.startPrank(sender);
        vm.deal(address(service), 1 ether);

        vm.expectRevert("ManagedService: recipient is zero address");
        service.withdrawTo(0.5 ether, address(0));
    }

    function test_depositeAndSuccessfulWithdraw() external {
        vm.startPrank(sender);
        uint depositeAmount = 1 ether;

        vm.deal(address(sender), depositeAmount);
        payable(address(service)).transfer(depositeAmount);

        uint withdrawAmount = 0.5 ether;
        vm.expectEmit(address(service));
        emit Withdew(sender, withdrawAmount);

        service.withdraw(withdrawAmount);
        assertEq(sender.balance, withdrawAmount);
    }

    function test_depositeAndSuccessfulWithdrawTo() external {
        vm.startPrank(sender);
        uint depositeAmount = 1 ether;

        vm.deal(address(sender), depositeAmount);
        payable(address(service)).transfer(depositeAmount);

        uint withdrawAmount = 0.5 ether;
        vm.expectEmit(address(service));
        emit Withdew(invalidSender, withdrawAmount);

        service.withdrawTo(withdrawAmount, invalidSender);
        assertEq(invalidSender.balance, withdrawAmount);
    }
}
