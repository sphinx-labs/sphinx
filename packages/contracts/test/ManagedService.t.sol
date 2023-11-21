// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "sphinx-forge-std/Test.sol";
import { ManagedService } from "contracts/core/ManagedService.sol";

contract Endpoint {
    uint public x;

    error CustomError(uint256 value, address a, address b, address c, bytes32 d);

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

    function doRevertCustom() public {
        revert CustomError(10, address(1), address(2), address(3), bytes32(uint(1)));
    }

    function doSilentRevert() public {
        revert();
    }

    receive() external payable {
        revert("cannot send funds to this contract");
    }
}

contract ManagedService_Test is Test, ManagedService {
    ManagedService service;
    Endpoint endpoint;
    address owner = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address sender = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address invalidSender = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    bytes invalidCallerError = "ManagedService: invalid caller";

    constructor () ManagedService(address(1)) {}

    function setUp() public {
        vm.startPrank(owner);

        service = new ManagedService(owner);
        endpoint = new Endpoint(1);

        service.grantRole(service.RELAYER_ROLE(), sender);
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

    function test_RevertIfUnderlyingCallRevertsWithCustomError() external {
        vm.startPrank(sender);
        vm.expectRevert(
            abi.encodeWithSelector(
                Endpoint.CustomError.selector,
                10,
                address(1),
                address(2),
                address(3),
                bytes32(uint(1))
            )
        );
        service.exec(address(endpoint), abi.encodeWithSelector(Endpoint.doRevertCustom.selector));
    }

    function test_RevertSilently() external {
        vm.startPrank(sender);
        vm.expectRevert("ManagedService: Transaction reverted silently");
        service.exec(address(endpoint), abi.encodeWithSelector(Endpoint.doSilentRevert.selector));
    }

    function test_RevertIfTargetZeroAddress() external {
        vm.startPrank(sender);
        vm.expectRevert("ManagedService: target is address(0)");
        service.exec(address(0), abi.encodeWithSelector(Endpoint.set.selector, 2));
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

    function test_RevertIfOwnerIsAddressZero() external {
        vm.expectRevert("ManagedService: admin cannot be address(0)");
        new ManagedService{ salt: keccak256("1") }(address(0));
    }
}
