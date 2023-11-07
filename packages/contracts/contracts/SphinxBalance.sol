// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title SphinxBalance
 * @notice The SphinxBalance contract is where an organization stores its USDC, which pays for
 *         deployments in the Sphinx DevOps platform. This contract is only meant to exist on
 *         Optimism Mainnet and Optimism Goerli.
 *
 *         This contract is owned by a single address, which belongs to the organization. Anyone can
 *         transfer USDC to this contract, but only the owner and the corresponding escrow contract
 *         can transfer these funds elsewhere. To fund a deployment, the owner of this contract
 *         sends a transaction that transfers USDC to this contract. The Sphinx Managed backend then
 *         transfers funds for a deployment to the SphinxEscrow contract after the deployment has
 *         been approved by the user.
 *
 *         There is a one-to-one mapping between SphinxBalance and SphinxEscrow contracts. Both are
 *         deployed by the SphinxBalanceFactory contract. After the deployment is completed, the
 *         Sphinx Managed backend withdraws the cost of the deployment from the escrow contract and
 *         sends the remaining funds back to the corresponding balance contract.
 *
 *         Note To make the escrow process smooth, we rely on setting the allowance of the escrow
 *         contract to the maximum value. This means the user only needs to deposit funds for the
 *         deployment and then the Sphinx Managed backend can handle the rest. While the pratice of
 *         using unlimited allowances on ERC20s is generally discouraged, we believe it is
 *         reasonable in this case because the allowance is limited to the balance contract and
 *         therefore does not put funds in their personal wallet at risk.
 *
 *         Note that we don't need to check the boolean values that are returned from function calls
 *         to the USDC contract, such as `usdc.transfer`. The is because these functions in the USDC
 *         contract always return true.
 */
contract SphinxBalance is Ownable {

    address public immutable escrow;
    
    ERC20 public usdc;

    string public orgId;

    constructor(string memory _orgId, address _owner, address _usdc, address _escrow) {
        orgId = _orgId;
        usdc = ERC20(_usdc);
        escrow = _escrow;
        usdc.increaseAllowance(_escrow, type(uint256).max);
        _transferOwnership(_owner);
    }

    function transfer(address _to, uint256 _amount) external onlyOwner {
        usdc.transfer(_to, _amount);
    }
}
