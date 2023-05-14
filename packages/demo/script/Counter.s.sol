// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../contracts/Counter.sol";

contract CounterScript is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(0x4856e043a1F2CAA8aCEfd076328b4981Aca91000);

        Counter counter = new Counter(2);
        console.log(address(counter));
        console.log(type(Counter).name);

        vm.stopBroadcast();
    }
}
