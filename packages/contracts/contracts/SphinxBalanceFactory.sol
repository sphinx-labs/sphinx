// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SphinxBalance } from "./SphinxBalance.sol";
import { SphinxEscrow } from "./SphinxEscrow.sol";

/**
 * @title SphinxBalanceFactory
 * @notice Allows anyone to deploy a SphinxBalance contract and SphinxEscrow contract for a given
 *         org ID. These two contracts handle payments in the Sphinx DevOps platform. The addresses
 *         of both contracts are calculated via Create2 using the org ID as the salt. This contract
 *         is only meant to exist on Optimism Mainnet and Optimism Goerli.
 */
contract SphinxBalanceFactory {
    event BalanceFactoryDeployment(
        string indexed orgIdHash,
        address owner,
        string orgId,
        address caller,
        address balance,
        address escrow
    );

    address public immutable usdc;

    address public immutable managedService;

    mapping(bytes32 => bool) public isDeployed;

    constructor(address _usdc, address _managedService) {
        usdc = _usdc;
        managedService = _managedService;
    }

    function deploy(string memory _orgId, address _owner) external {
        require(_owner != address(0), "SphinxBalanceFactory: owner cannot be address(0)");

        bytes32 salt = keccak256(abi.encode(_orgId));
        require(!isDeployed[salt], "SphinxBalanceFactory: org id already deployed");

        isDeployed[salt] = true;

        // Next, we'll deploy the SphinxBalance and SphinxEscrow contracts. We don't need to check
        // that they've been deployed at the correct Create2 address because their constructors
        // can't revert and because it's not possible for a contract to already exist at the Create2
        // address.

        SphinxEscrow escrow = new SphinxEscrow{ salt: salt }(_orgId, usdc, managedService);

        // Deploy a SphinxBalance contract with this contract as the initial owner. This makes it
        // easy to calculate the Create2 address of the SphinxBalance contract off-chain, since we
        // don't need to know the owner's address to calculate it.
        SphinxBalance balance = new SphinxBalance{ salt: salt }(
            _orgId,
            address(this),
            usdc,
            address(escrow)
        );

        // Transfer ownership of the SphinxBalance contract to the specified owner.
        Ownable(balance).transferOwnership(_owner);

        emit BalanceFactoryDeployment(
            _orgId,
            _owner,
            _orgId,
            msg.sender,
            address(balance),
            address(escrow)
        );
    }
}
