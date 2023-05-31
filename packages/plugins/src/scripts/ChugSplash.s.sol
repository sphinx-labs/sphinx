import "forge-std/Script.sol";
import "forge-std/Test.sol";
import "../../foundry-contracts/ChugSplash.sol";
import { Version } from "@chugsplash/contracts/contracts/Semver.sol";
import { SimpleStorage } from "../../contracts/SimpleStorage.sol";

contract ChugSplashScript is Script, Test {

    function run() public {
        ChugSplash chugsplash = new ChugSplash();
        chugsplash.deploy('./chugsplash/foundry/claim.t.js');
    }
}
