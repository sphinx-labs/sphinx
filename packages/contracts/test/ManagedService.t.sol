// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../contracts/forge-std/src/Test.sol";
import { ManagedService } from "contracts/core/ManagedService.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

contract Endpoint {
    // Selector of Error(string), which is a generic error thrown by Solidity when a low-level
    // call/delegatecall fails.
    bytes constant ERROR_SELECTOR = hex"08c379a0";
    bool public reentrancyBlocked;

    uint public x;

    error CustomError(uint256 value, address a, address b, address c, bytes32 d);

    constructor(uint _x) {
        x = _x;
    }

    function set(uint _x) public returns (uint) {
        x = _x;

        return x;
    }

    function acceptPayment() external payable returns (uint) {
        return msg.value;
    }

    function reenter(address _to, bytes memory _data) external {
        (bool success, bytes memory retdata) = _to.call(_data);
        require(!success, "Endpoint: reentrancy succeeded");
        require(
            keccak256(retdata) ==
                keccak256(
                    abi.encodePacked(ERROR_SELECTOR, abi.encode("ReentrancyGuard: reentrant call"))
                ),
            "Endpoint: incorrect error"
        );
        reentrancyBlocked = true;
    }

    function doRevert() public pure {
        revert("did revert");
    }

    function doRevertCustom() public pure {
        revert CustomError(10, address(1), address(2), address(3), bytes32(uint(1)));
    }

    function doSilentRevert() public pure {
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

    constructor() ManagedService(address(1)) {}

    function setUp() public {
        vm.startPrank(owner);

        service = new ManagedService(owner);
        endpoint = new Endpoint(1);

        service.grantRole(service.RELAYER_ROLE(), sender);
    }

    function test_RevertCallerIsNotRelayer() external {
        vm.startPrank(invalidSender);
        vm.expectRevert(
            abi.encodePacked(
                "AccessControl: account ",
                Strings.toHexString(invalidSender),
                " is missing role ",
                Strings.toHexString(uint256(service.RELAYER_ROLE()), 32)
            )
        );
        service.exec(payable(address(endpoint)), abi.encodeWithSelector(Endpoint.set.selector, 2));
    }

    function test_RevertIfUnderlyingCallReverts() external {
        vm.startPrank(sender);
        vm.expectRevert("did revert");
        service.exec(
            payable(address(endpoint)),
            abi.encodeWithSelector(Endpoint.doRevert.selector)
        );
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
        service.exec(
            payable(address(endpoint)),
            abi.encodeWithSelector(Endpoint.doRevertCustom.selector)
        );
    }

    function test_RevertSilently() external {
        vm.startPrank(sender);
        vm.expectRevert("ManagedService: Transaction reverted silently");
        service.exec(
            payable(address(endpoint)),
            abi.encodeWithSelector(Endpoint.doSilentRevert.selector)
        );
    }

    function test_RevertIfTargetZeroAddress() external {
        vm.startPrank(sender);
        vm.expectRevert("ManagedService: target is address(0)");
        service.exec(payable(address(0)), abi.encodeWithSelector(Endpoint.set.selector, 2));
    }

    function test_RevertNoReentrancy() external {
        assertFalse(endpoint.reentrancyBlocked());
        vm.startPrank(sender);

        bytes memory setData = abi.encodeWithSelector(Endpoint.set.selector, 2);
        bytes memory execData = abi.encodeWithSelector(
            ManagedService.exec.selector,
            address(endpoint),
            setData
        );
        bytes memory txData = abi.encodeWithSelector(
            Endpoint.reenter.selector,
            address(service),
            execData
        );

        // Expect the correct event is emitted
        vm.expectEmit(address(service));
        emit Called(sender, payable(address(endpoint)), 0, keccak256(txData));

        // Execute the call
        service.exec(payable(address(endpoint)), txData);

        // Check that the set function was not called (via reentrancy)
        assertEq(endpoint.x(), 1);

        // Expect that the reentrancy was blocked
        assertTrue(endpoint.reentrancyBlocked());
    }

    function test_SuccessfulCall() external {
        vm.startPrank(sender);

        bytes memory txData = abi.encodeWithSelector(Endpoint.set.selector, 2);

        // Expect the correct event is emitted
        vm.expectEmit(address(service));
        emit Called(sender, payable(address(endpoint)), 0, keccak256(txData));

        // Execute the call
        bytes memory res = service.exec(payable(address(endpoint)), txData);

        // Check that the function was properly called
        assertEq(endpoint.x(), 2);

        // Check that the response was returned
        assertEq(abi.decode(res, (uint)), 2);
    }

    function test_SuccessfulCallWithValue() external {
        vm.startPrank(sender);

        // Check that the `Endpoint` has an initial balance of 0.
        assertEq(address(endpoint).balance, 0);

        // Give the `sender` 1 ETH.
        vm.deal(sender, 1 ether);

        bytes memory txData = abi.encodePacked(Endpoint.acceptPayment.selector);

        // Expect the correct event is emitted
        vm.expectEmit(address(service));
        emit Called(sender, payable(address(endpoint)), 1 ether, keccak256(txData));

        // Execute the call
        bytes memory res = service.exec{ value: 1 ether }(payable(address(endpoint)), txData);

        // Check that the ETH was transferred
        assertEq(address(endpoint).balance, 1 ether);

        // Check that the response was returned
        assertEq(abi.decode(res, (uint)), 1 ether);
    }

    function test_RevertIfOwnerIsAddressZero() external {
        vm.expectRevert("ManagedService: admin cannot be address(0)");
        new ManagedService(address(0));
    }
}
