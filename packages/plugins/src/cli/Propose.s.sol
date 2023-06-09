import "forge-std/Script.sol";
import "forge-std/Test.sol";
import "../../foundry-contracts/ChugSplash.sol";

contract ChugSplashScript is Script, Test, ChugSplash {
    string private networkAlias = vm.envString("CHUGSPLASH_INTERNAL_NETWORK");
    string private configPath = vm.envString("CHUGSPLASH_INTERNAL_CONFIG_PATH");

    function run() public {
        propose(configPath, vm.rpcUrl(networkAlias));
    }
}
