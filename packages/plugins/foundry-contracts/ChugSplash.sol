pragma solidity ^0.8.15;

// SPDX-License-Identifier: MIT
import "forge-std/Script.sol";
import "forge-std/Test.sol";
import { StdChains } from "forge-std/StdChains.sol";
import "lib/solidity-stringutils/src/strings.sol";
import { ChugSplashBootloaderOne } from "@chugsplash/contracts/contracts/deployment/ChugSplashBootloaderOne.sol";
import { ChugSplashBootloaderTwo } from "@chugsplash/contracts/contracts/deployment/ChugSplashBootloaderTwo.sol";
import { ChugSplashRegistry } from "@chugsplash/contracts/contracts/ChugSplashRegistry.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { DeterministicDeployer } from "@chugsplash/contracts/contracts/deployment/DeterministicDeployer.sol";
import { ChugSplashLocalExecutor } from "./ChugSplashLocalExecutor.sol";

contract ChugSplash is Script, Test, ChugSplashLocalExecutor {
    using strings for *;

    string constant NONE = "none";
    uint256 constant DEFAULT_PRIVATE_KEY_UINT = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    string constant DEFAULT_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    string constant DEFAULT_NETWORK = "localhost";

    // Optional env vars
    string privateKey = vm.envOr("PRIVATE_KEY", DEFAULT_PRIVATE_KEY);
    string network = vm.envOr("NETWORK", DEFAULT_NETWORK);
    address newOwnerAddress = vm.envOr("NEW_OWNER", vm.addr(vm.envOr("PRIVATE_KEY", DEFAULT_PRIVATE_KEY_UINT)));
    string newOwner = vm.toString(newOwnerAddress);
    string ipfsUrl = vm.envOr("IPFS_URL", NONE);
    bool skipStorageCheck = vm.envOr("SKIP_STORAGE_CHECK", false);
    bool allowManagedProposals = vm.envOr("ALLOW_MANAGED_PROPOSALS", false);

    // Get owner address
    uint key = vm.envOr("CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY", uint(0));
    address systemOwnerAddress = key != 0 ? vm.rememberKey(key) : 0x226F14C3e19788934Ff37C653Cf5e24caD198341;

    string rpcUrl = vm.rpcUrl(network);
    string filePath = vm.envOr("DEV_FILE_PATH", string('./node_modules/@chugsplash/plugins/dist/foundry/index.js'));
    bool isChugSplashTest = vm.envOr("IS_CHUGSPLASH_TEST", false);

    struct ChugSplashContract {
        string referenceName;
        string contractName;
        address contractAddress;
    }

    struct DeploymentBytecode {
        bytes bootloaderOne;
        bytes bootloaderTwo;
    }

    constructor() {
        vm.makePersistent(address(this));
        _ensureChugSplashInitialized();
    }

    function fetchPaths() private view returns (string memory outPath, string memory buildInfoPath) {
        outPath = './out';
        buildInfoPath = './out/build-info';
        string memory tomlPath = "foundry.toml";


        strings.slice memory fileSlice = vm.readFile(tomlPath).toSlice();
        strings.slice memory delim = "\n".toSlice();
        uint parts = fileSlice.count(delim);

        for (uint i = 0; i < parts + 1; i++) {
            strings.slice memory line = fileSlice.split(delim);
            if (line.startsWith("out".toSlice())) {
                outPath = line.rsplit("=".toSlice()).toString();
            }
            if (line.startsWith("build_info_path".toSlice())) {
                buildInfoPath = line.rsplit("=".toSlice()).toString();
            }
        }
    }

    function getBootloaderBytecode() private returns (DeploymentBytecode memory) {
        string[] memory cmds = new string[](4);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getBootloaderBytecode";

        bytes memory result = vm.ffi(cmds);
        return abi.decode(result, (DeploymentBytecode));
    }

    function isLiveNetwork() private returns (bool) {
        StdChains.Chain memory activeChain = StdChains.getChain(block.chainid);
        strings.slice memory sliceUrl = activeChain.rpcUrl.toSlice();
        string memory host = sliceUrl.split(":".toSlice()).toString();

        if (keccak256(bytes(host)) == keccak256("http://127.0.0.1") || keccak256(bytes(host)) == keccak256("http://localhost")) {
            return false;
        } else {
            return true;
        }
    }

    function _ensureChugSplashInitialized() private {
        // Fetch bytecode from artifacts
        DeploymentBytecode memory bootloaderBytecode = getBootloaderBytecode();
        ChugSplashRegistry registry = ChugSplashRegistry(getRegistryAddress());

        // If the registry is not already deployed
        if (address(registry).code.length == 0) {
            // If the target chain is a local network
            if (!isLiveNetwork()) {
                // Setup determinisitic deployment proxy
                address DeterministicDeploymentProxy = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
                vm.etch(DeterministicDeploymentProxy, hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3");

                // Deploy the adapters
                bytes memory bootloaderOneCreationCode = bootloaderBytecode.bootloaderOne;
                address bootloaderOneAddress = Create2.computeAddress(bytes32(0), keccak256(bootloaderOneCreationCode), DeterministicDeploymentProxy);
                DeterministicDeployer.deploy(
                    bootloaderOneCreationCode,
                    type(ChugSplashBootloaderOne).name
                );

                // Deploy the bootloader
                bytes memory bootloaderTwoCreationCode = bootloaderBytecode.bootloaderTwo;
                address bootloaderTwoAddress = Create2.computeAddress(bytes32(0), keccak256(bootloaderTwoCreationCode), DeterministicDeploymentProxy);
                DeterministicDeployer.deploy(
                    bootloaderTwoCreationCode,
                    type(ChugSplashBootloaderOne).name
                );

                ChugSplashBootloaderOne chugSplashBootloaderOne = ChugSplashBootloaderOne(bootloaderOneAddress);
                ChugSplashBootloaderTwo chugSplashBootloaderTwo = ChugSplashBootloaderTwo(bootloaderTwoAddress);

                require(address(chugSplashBootloaderTwo.registry()) == address(registry), "Registry deployed to incorrect address");

                // Impersonate system owner
                vm.startPrank(systemOwnerAddress);

                // Add initial manager version
                registry.addVersion(
                    chugSplashBootloaderTwo.managerImplementationAddress()
                );

                // Add transparent proxy type
                registry.addContractKind(keccak256('oz-transparent'), chugSplashBootloaderOne.ozTransparentAdapterAddr());

                // Add uups ownable proxy type
                registry.addContractKind(keccak256('oz-ownable-uups'), chugSplashBootloaderOne.ozUUPSOwnableAdapterAddr());

                // Add uups access control proxy type
                registry.addContractKind(keccak256('oz-access-control-uups'), chugSplashBootloaderOne.ozUUPSAccessControlAdapterAddr());

                // Add default proxy type
                registry.addContractKind(bytes32(0), chugSplashBootloaderOne.defaultAdapterAddr());

                vm.stopPrank();
            } else {
                // If the target chain is not a local network and the registry has not bee deployed, then throw an error
                revert("ChugSplash is not available on this network. If you are working on a local network, please report this error to the developers. If you are working on a live network, then it may not be officially supported yet. Feel free to drop a messaging in the Discord and we'll see what we can do!");
            }
        }
    }

    function claim(string memory configPath) public returns (bytes memory) {
        return claim(configPath, false);
    }

    function claim(
        string memory configPath,
        bool silent
    ) public returns (bytes memory) {
        (string memory outPath, string memory buildInfoPath) = fetchPaths();

        string[] memory cmds = new string[](13);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "claim";
        cmds[4] = configPath;
        cmds[5] = rpcUrl;
        cmds[6] = network;
        cmds[7] = privateKey;
        cmds[8] = silent == true ? "true" : "false";
        cmds[9] = outPath;
        cmds[10] = buildInfoPath;
        cmds[11] = newOwner;
        cmds[12] = allowManagedProposals == true ? "true" : "false";

        bytes memory result = vm.ffi(cmds);

        if (!silent) {
            emit log(string(result));
            emit log(string("\n"));
        }

        return result;
    }

    function propose(
        string memory configPath,
        bool silent
    ) external returns (bytes memory) {
        (string memory outPath, string memory buildInfoPath) = fetchPaths();

        string[] memory cmds = new string[](13);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "propose";
        cmds[4] = configPath;
        cmds[5] = rpcUrl;
        cmds[6] = network;
        cmds[7] = privateKey;
        cmds[8] = silent == true ? "true" : "false";
        cmds[9] = outPath;
        cmds[10] = buildInfoPath;
        cmds[11] = ipfsUrl;

        bytes memory result = vm.ffi(cmds);

        if (!silent) {
            emit log(string(result));
            emit log(string("\n"));
        }

        return result;
    }

    function deploy(
        string memory configPath
    ) external {
        deploy(configPath, false);
    }

    function deploy(
        string memory configPath,
        bool silent
    ) public {
        (string memory outPath, string memory buildInfoPath) = fetchPaths();

        string[] memory cmds = new string[](12);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "deploy";
        cmds[4] = configPath;
        cmds[5] = rpcUrl;
        cmds[6] = network;
        cmds[7] = privateKey;
        cmds[8] = silent == true ? "true" : "false";
        cmds[9] = outPath;
        cmds[10] = buildInfoPath;
        cmds[11] = newOwner;

        bytes memory result = vm.ffi(cmds);
        if (isChugSplashTest) {
            emit log("Attempting to decode deploy command results:");
            emit log_bytes(result);
        }
        ChugSplashContract[] memory deployedContracts = abi.decode(result, (ChugSplashContract[]));
        if (isChugSplashTest) {
            emit log("Successfully decoded");
        }

        if (silent == false) {
            emit log("Success!");
            for (uint i = 0; i < deployedContracts.length; i++) {
                ChugSplashContract memory deployed = deployedContracts[i];
                emit log(string.concat(deployed.referenceName, ': ', vm.toString(deployed.contractAddress)));
            }
            emit log("\nThank you for using ChugSplash! We'd love to see you in the Discord: https://discord.gg/7Gc3DK33Np\n");
        }

    }

    function cancel(
        string memory configPath
    ) external {
        cancel(configPath, false);
    }

    function cancel(
        string memory configPath,
        bool silent
    ) public returns (bytes memory) {
        string[] memory cmds = new string[](8);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "cancel";
        cmds[4] = configPath;
        cmds[5] = rpcUrl;
        cmds[6] = network;
        cmds[7] = privateKey;

        bytes memory result = vm.ffi(cmds);
        if (!silent) {
            emit log(string(result));
            emit log(string("\n"));
        }

        return result;
    }

    function listProjects() external returns (bytes memory) {
        string[] memory cmds = new string[](7);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "listProjects";
        cmds[4] = rpcUrl;
        cmds[5] = network;
        cmds[6] = privateKey;

        bytes memory result = vm.ffi(cmds);
        emit log(string(result));
        emit log(string("\n"));

        return result;
    }

    function exportProxy(
        string memory configPath,
        string memory referenceName,
        bool silent
    ) external returns (bytes memory) {
        (string memory outPath, string memory buildInfoPath) = fetchPaths();

        string[] memory cmds = new string[](12);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "exportProxy";
        cmds[4] = configPath;
        cmds[5] = rpcUrl;
        cmds[6] = network;
        cmds[7] = privateKey;
        cmds[8] = silent == true ? "true" : "false";
        cmds[9] = outPath;
        cmds[10] = buildInfoPath;
        cmds[11] = referenceName;

        bytes memory result = vm.ffi(cmds);

        if (!silent) {
            emit log(string(result));
            emit log(string("\n"));
        }

        return result;
    }

    function importProxy(
        string memory configPath,
        address proxyAddress,
        bool silent
    ) external returns (bytes memory) {
        string[] memory cmds = new string[](10);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "importProxy";
        cmds[4] = configPath;
        cmds[5] = rpcUrl;
        cmds[6] = network;
        cmds[7] = privateKey;
        cmds[8] = silent == true ? "true" : "false";
        cmds[9] = vm.toString(proxyAddress);

        bytes memory result = vm.ffi(cmds);

        if (!silent) {
            emit log(string(result));
            emit log(string("\n"));
        }

        return result;
    }

    function getAddress(string memory _configPath, string memory _referenceName) public returns (address) {
        (string memory outPath, string memory buildInfoPath) = fetchPaths();

        string[] memory cmds = new string[](8);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getAddress";
        cmds[4] = _configPath;
        cmds[5] = _referenceName;
        cmds[6] = outPath;
        cmds[7] = buildInfoPath;

        bytes memory addrBytes = vm.ffi(cmds);
        address addr;
        assembly {
            addr := mload(add(addrBytes, 20))
        }

        string memory errorMsg = string.concat(
            "Could not find contract: ",
            _referenceName,
            ". ",
            "Did you misspell the contract's reference name or forget to call `chugsplash.deploy`?"
        );
        require(addr.code.length > 0, errorMsg);

        return addr;
    }

    function getRegistryAddress() public returns (address) {
        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getRegistryAddress";
        cmds[4] = rpcUrl;

        bytes memory addrBytes = vm.ffi(cmds);
        address addr;
        assembly {
            addr := mload(add(addrBytes, 20))
        }

        return addr;
    }

    function getEIP1967ProxyAdminAddress(address _proxyAddress) public returns (address) {
        string[] memory cmds = new string[](6);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getEIP1967ProxyAdminAddress";
        cmds[4] = rpcUrl;
        cmds[5] = vm.toString(_proxyAddress);

        bytes memory addrBytes = vm.ffi(cmds);
        address addr;
        assembly {
            addr := mload(add(addrBytes, 20))
        }

        require(addr != address(0), "Couldn't find proxy admin address");

        return addr;
    }

    function refresh() public returns (uint) {
        uint forkId = vm.createFork(rpcUrl);
        vm.selectFork(forkId);
        return forkId;
    }
}
