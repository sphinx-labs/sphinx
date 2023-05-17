pragma solidity ^0.8.15;

// SPDX-License-Identifier: MIT
import "forge-std/Script.sol";
import "forge-std/Test.sol";
import "lib/solidity-stringutils/src/strings.sol";

contract ChugSplash is Script, Test {
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

    string rpcUrl = vm.rpcUrl(network);
    string filePath = vm.envOr("DEV_FILE_PATH", string('./node_modules/@chugsplash/plugins/dist/foundry/index.js'));
    bool isChugSplashTest = vm.envOr("IS_CHUGSPLASH_TEST", false);

    struct ChugSplashContract {
        string referenceName;
        string contractName;
        address contractAddress;
    }

    constructor() {
        vm.makePersistent(address(this));
        _initializeChugSplash();
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

    function _initializeChugSplash() private {
        string[] memory cmds = new string[](7);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "initializeChugSplash";
        cmds[4] = rpcUrl;
        cmds[5] = network;
        cmds[6] = privateKey;

        vm.ffi(cmds);
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

        require(addr.code.length > 0, "Couldn't find registry address");

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
