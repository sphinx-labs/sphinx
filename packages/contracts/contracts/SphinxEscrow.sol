// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SphinxEscrow
 * @notice The SphinxEscrow contract receives USDC from its corresponding SphinxBalance contract to
 *         pay for deployments in the Sphinx DevOps platform. Each organization is meant to have one
 *         SphinxBalance contract and SphinxEscrow contract.
 *
 *         USDC can only be transferred from this contract by addresses that belong to the Sphinx
 *         DevOps platform. These addresses can also transfer funds away from any contract that has
 *         given an allowance to this contract.
 *
 *         This contract is only meant to exist on Optimism Mainnet and Optimism Goerli.
 *
 *         Note that we don't need to check the boolean values that are returned from function calls
 *         to the USDC contract, such as `usdc.transfer`. The is because these functions in the USDC
 *         contract always return true.
 */
contract SphinxEscrow {
    bytes32 private constant FUNDER_ROLE = keccak256("FUNDER_ROLE");

    IERC20 public immutable usdc;

    IAccessControl public immutable managedService;

    string public orgId;

    modifier onlyFunder() {
        require(
            managedService.hasRole(FUNDER_ROLE, msg.sender),
            "SphinxEscrow: caller is not a funder"
        );
        _;
    }

    constructor(string memory _orgId, address _usdc, address _managedService) {
        orgId = _orgId;
        usdc = IERC20(_usdc);
        managedService = IAccessControl(_managedService);
    }

    function batchTransfer(address[] memory _to, uint256[] memory _amounts) external onlyFunder {
        require(_to.length == _amounts.length, "SphinxEscrow: array length mismatch");
        for (uint256 i = 0; i < _to.length; i++) {
            usdc.transfer(_to[i], _amounts[i]);
        }
    }

    function transferFrom(address _from, address _to, uint256 _amount) external onlyFunder {
        usdc.transferFrom(_from, _to, _amount);
    }
}
