import "forge-std/Script.sol";
import "forge-std/Test.sol";
import "../../foundry-contracts/ChugSplash.sol";
import { Version } from "@chugsplash/contracts/contracts/Semver.sol";
import { SimpleStorage } from "../../contracts/SimpleStorage.sol";
import "../../contracts/Storage.sol";
import { SimpleStorage } from "../../contracts/SimpleStorage.sol";
import { Stateless } from "../../contracts/Stateless.sol";
import { ComplexConstructorArgs } from "../../contracts/ComplexConstructorArgs.sol";
import { ChugSplashRegistry } from "@chugsplash/contracts/contracts/ChugSplashRegistry.sol";
import { ChugSplashManager } from "@chugsplash/contracts/contracts/ChugSplashManager.sol";
import { Semver } from "@chugsplash/contracts/contracts/Semver.sol";
import { ChugSplashManagerProxy } from "@chugsplash/contracts/contracts/ChugSplashManagerProxy.sol";
import { IChugSplashManager } from "@chugsplash/contracts/contracts/interfaces/IChugSplashManager.sol";
import { IProxyAdapter } from "@chugsplash/contracts/contracts/interfaces/IProxyAdapter.sol";
import { IProxyUpdater } from "@chugsplash/contracts/contracts/interfaces/IProxyUpdater.sol";
import { IGasPriceCalculator } from "@chugsplash/contracts/contracts/interfaces/IGasPriceCalculator.sol";
import { ICreate3 } from "@chugsplash/contracts/contracts/interfaces/ICreate3.sol";

contract ChugSplashScript is Script, Test, ChugSplash {

    function run() public {
        generateArtifacts('./chugsplash/foundry/claim.t.js', vm.rpcUrl("anvil"));
    }
}
