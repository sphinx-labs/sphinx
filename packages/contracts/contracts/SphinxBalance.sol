// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title SphinxBalance
 * @notice The SphinxBalance contract is where an organization stores its USDC, which pays for
 *         deployments in the Sphinx DevOps platform. This contract is only meant to exist on
 *         Optimism Mainnet and Optimism Goerli.
 *
 *         This contract is owned by a single address, which belongs to the organization. Anyone can
 *         transfer USDC to this contract, but only the owner can transfer these funds elsewhere. To
 *         fund a deployment, the owner of this contract sends a transaction that transfers USDC to
 *         the corresponding SphinxEscrow contract. There is a one-to-one mapping between
 *         SphinxBalance and SphinxEscrow contracts. Both are deployed by the SphinxBalanceFactory
 *         contract.
 *
 *         The owner of this contract can also increase or decrease the USDC allowance of an
 *         arbitrary spender address using the standard ERC20 allowance mechanism. By setting the
 *         corresponding SphinxEscrow contract as the spender, the owner can fund deployments via
 *         this allowance mechanism.
 *
 *         Note that we don't need to check the boolean values that are returned from function calls
 *         to the USDC contract, such as `usdc.transfer`. The is because these functions in the USDC
 *         contract always return true.
 */
contract SphinxBalance is Ownable {
    ERC20 public immutable usdc;

    address public immutable escrow;

    string public orgId;

    constructor(string memory _orgId, address _owner, address _usdc, address _escrow) {
        orgId = _orgId;
        usdc = ERC20(_usdc);
        escrow = _escrow;
        _transferOwnership(_owner);
    }

    function transfer(address _to, uint256 _amount) external onlyOwner {
        usdc.transfer(_to, _amount);
    }

    function increaseAllowance(address _spender, uint256 _addedAmount) external onlyOwner {
        usdc.increaseAllowance(_spender, _addedAmount);
    }

    function decreaseAllowance(address _spender, uint256 _subtractedAmount) external onlyOwner {
        usdc.decreaseAllowance(_spender, _subtractedAmount);
    }
}
