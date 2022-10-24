// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ERC20 } from "@rari-capital/solmate/src/tokens/ERC20.sol";

contract MyToken is ERC20 {
    constructor() ERC20("MyToken", "MTK", 18) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
