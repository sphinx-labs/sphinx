import { ChugSplash } from "../../foundry-contracts/ChugSplash.sol";

contract ChugSplashScript is ChugSplash {
    string private rpcUrl = vm.envString("CHUGSPLASH_INTERNAL_RPC_URL");
    string private configPath = vm.envString("CHUGSPLASH_INTERNAL_CONFIG_PATH");
    bool private silent = vm.envBool("CHUGSPLASH_INTERNAL_SILENT");

    function run() public {
        if (silent) silence();

        propose(configPath, rpcUrl);
    }
}
