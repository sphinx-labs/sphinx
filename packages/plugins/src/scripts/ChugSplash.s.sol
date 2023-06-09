import "forge-std/Script.sol";
import "forge-std/Test.sol";
import "../../foundry-contracts/ChugSplash.sol";

contract ChugSplashScript is Script, Test, ChugSplash {
    function run() public {
        ensureChugSplashInitialized(vm.rpcUrl("anvil"));
    }
}
