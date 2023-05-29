pragma solidity ^0.8.15;

// SPDX-License-Identifier: MIT
import "forge-std/Script.sol";
import "forge-std/Test.sol";
import { StdChains } from "forge-std/StdChains.sol";
import "lib/solidity-stringutils/src/strings.sol";
import {
    ChugSplashBootloaderOne
} from "@chugsplash/contracts/contracts/deployment/ChugSplashBootloaderOne.sol";
import {
    ChugSplashBootloaderTwo
} from "@chugsplash/contracts/contracts/deployment/ChugSplashBootloaderTwo.sol";
import { ChugSplashRegistry } from "@chugsplash/contracts/contracts/ChugSplashRegistry.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import {
    DeterministicDeployer
} from "@chugsplash/contracts/contracts/deployment/DeterministicDeployer.sol";
import { ChugSplashLocalExecutor } from "./ChugSplashLocalExecutor.sol";
import { ChugSplashManager } from "@chugsplash/contracts/contracts/ChugSplashManager.sol";
import { ChugSplashManagerProxy } from "@chugsplash/contracts/contracts/ChugSplashManagerProxy.sol";
import { Version } from "@chugsplash/contracts/contracts/Semver.sol";
import {
    ChugSplashBundles,
    DeploymentState,
    DeploymentStatus
} from "@chugsplash/contracts/contracts/ChugSplashDataTypes.sol";
import { DefaultCreate3 } from "@chugsplash/contracts/contracts/DefaultCreate3.sol";

// TODO: merge this contract with LocalExecutor?
contract ChugSplash is Script, Test, ChugSplashLocalExecutor, DefaultCreate3 {
    using strings for *;

    string constant NONE = "none";
    uint256 constant DEFAULT_PRIVATE_KEY_UINT =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    string constant DEFAULT_PRIVATE_KEY =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    string constant DEFAULT_NETWORK = "localhost";

    // Optional env vars
    string privateKey = vm.envOr("PRIVATE_KEY", DEFAULT_PRIVATE_KEY);
    string network = vm.envOr("NETWORK", DEFAULT_NETWORK);
    string ipfsUrl = vm.envOr("IPFS_URL", NONE);
    bool skipStorageCheck = vm.envOr("SKIP_STORAGE_CHECK", false);
    bool allowManagedProposals = vm.envOr("ALLOW_MANAGED_PROPOSALS", false);

    // Get owner address
    uint key = vm.envOr("CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY", uint(0));
    address systemOwnerAddress =
        key != 0 ? vm.rememberKey(key) : 0x226F14C3e19788934Ff37C653Cf5e24caD198341;

    string rpcUrl = vm.rpcUrl(network);
    string filePath =
        vm.envOr(
            "DEV_FILE_PATH",
            string("./node_modules/@chugsplash/plugins/dist/foundry/index.js")
        );
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

    struct MinimalParsedConfig {
        bytes32 organizationID;
        string projectName;
        MinimalParsedContractConfig[] contracts;
    }

    struct MinimalParsedContractConfig {
        string referenceName;
        bytes creationCodeWithConstructorArgs;
        address targetAddress;
        ContractKindEnum kind;
        bytes32 salt;
    }

    struct ConfigCache {
        uint256 blockGasLimit;
        bool liveNetwork;
        string networkName;
        ContractConfigCache[] contractConfigCache;
    }

    struct ContractConfigCache {
        string referenceName;
        bool isTargetDeployed;
        DeploymentRevertCache deploymentRevert;
        ImportCache importCache;
        OptionalString deployedCreationCodeWithArgsHash;
        OptionalBool isImplementationDeployed;
        OptionalString previousConfigUri;
    }

    struct DeploymentRevertCache {
        bool deploymentReverted;
        OptionalString revertString;
    }

    struct ImportCache {
        bool requiresImport;
        OptionalAddress currProxyAdmin;
    }

    enum ContractKindEnum {
        INTERNAL_DEFAULT,
        OZ_TRANSPARENT,
        OZ_OWNABLE_UUPS,
        OZ_ACCESS_CONTROL_UUPS,
        EXTERNAL_DEFAULT,
        NO_PROXY
    }

    enum ProposalRoute {
        RELAY,
        REMOTE_EXECUTION,
        LOCAL_EXECUTION
    }

    struct ConfigContractInfo {
        string referenceName;
        address contractAddress;
    }

    struct OptionalAddress {
        address value;
        bool exists;
    }

    struct OptionalBool {
        bool value;
        bool exists;
    }

    struct OptionalString {
        string value;
        bool exists;
    }

    constructor() {
        vm.makePersistent(address(this));
        _ensureChugSplashInitialized();
    }

    // TODO(bundling): sort by ascending actionIndex, and remove the sort in `executeTask`

    // TODO(test): etherscan verification: https://book.getfoundry.sh/tutorials/solidity-scripting. i'd be
    //   surprised if this works since we deploy contracts in a non-standard way

    // TODO(test): you should throw a helpful error message in foundry/index.ts if reading from
    // state on the in-process node (e.g. in async user config).

    // TODO: spinner

    function deploy(string memory _configPath) public {
        OptionalAddress memory newOwner;
        newOwner.exists = false;
        deploy(_configPath, newOwner);
    }

    // TODO(inputs):
    // TODO(docs): this is the plugins deployTask and the deployAbstractTask
    // TODO: internal/public/external -> private? don't want users to accidentally overwrite these functions
    function deploy(string memory _configPath, OptionalAddress memory _newOwner) private {
        MinimalParsedConfig memory minimalParsedConfig = ffiGetMinimalParsedConfig(_configPath);

        ChugSplashRegistry registry = getChugSplashRegistry();
        ChugSplashManager manager = getChugSplashManager(
            registry,
            minimalParsedConfig.organizationID
        );

        ConfigCache memory configCache = getConfigCache(minimalParsedConfig, registry);

        ffiPostParsingValidation(configCache);

        string memory networkName = configCache.networkName;
        uint256 blockGasLimit = configCache.blockGasLimit;
        bool liveNetwork = configCache.liveNetwork;

        // TODO: what happens to msg.sender when startBroadcast(addr) is used?
        finalizeRegistration(
            registry,
            manager,
            minimalParsedConfig.organizationID,
            msg.sender,
            false
        );

        // TODO(docs): explain why this version doesn't have the canonicalconfig
        (string memory configUri, ChugSplashBundles memory bundles) = ffiGetCanonicalConfigData();

        if (bundles.actionBundle.actions.length == 0 && bundles.targetBundle.targets.length == 0) {
            // TODO(spinner): logger is probably justified here
            return;
        }

        bytes32 deploymentId = getDeploymentId(bundles, configUri);
        DeploymentState memory deploymentState = manager.deployments(deploymentId);
        DeploymentStatus currDeploymentStatus = deploymentState.status;

        if (currDeploymentStatus == DeploymentStatus.CANCELLED) {
            revert(
                string.concat(
                    minimalParsedConfig.projectName,
                    " was previously cancelled on ",
                    networkName
                )
            );
        }

        if (currDeploymentStatus == DeploymentStatus.EMPTY) {
            proposeChugSplashDeployment(
                manager,
                deploymentId,
                bundles,
                configUri,
                ProposalRoute.LOCAL_EXECUTION
            );
            currDeploymentStatus = DeploymentStatus.PROPOSED;
        }

        if (deploymentState.status == DeploymentStatus.PROPOSED) {
            approveDeployment(deploymentId, manager);
            currDeploymentStatus = DeploymentStatus.APPROVED;
        }

        if (
            currDeploymentStatus == DeploymentStatus.APPROVED ||
            currDeploymentStatus == DeploymentStatus.PROXIES_INITIATED
        ) {
            bool success = executeDeployment(manager, bundles, blockGasLimit);

            if (!success) {
                revert(
                    string.concat(
                        "ChugSplash: failed to execute ",
                        minimalParsedConfig.projectName,
                        "likely because one of the user's constructors reverted during the deployment."
                    )
                );
            }
        }

        if (_newOwner.exists) {
            transferProjectOwnership(manager, _newOwner.value);
        }

        ffiPostDeploymentActions(manager, deploymentId, configUri, liveNetwork, networkName);

        // TODO: output table-like thing (see old deploy function)
    }

    function finalizeRegistration(
        ChugSplashRegistry _registry,
        ChugSplashManager _manager,
        bytes32 _organizationID,
        address _newOwner,
        bool _allowManagedProposals
    ) internal {
        if (!isProjectClaimed(_registry, address(_manager))) {
            bytes memory initializerData = abi.encode(
                _manager,
                _organizationID,
                _allowManagedProposals
            );

            Version memory managerVersion = ffiGetCurrentChugSplashManagerVersion();
            _registry.finalizeRegistration(
                _organizationID,
                _newOwner,
                managerVersion,
                initializerData
            );
        } else {
            address existingOwner = _manager.owner();
            if (existingOwner != _newOwner) {
                revert(
                    string.concat(
                        "ChugSplash: project already owned by: ",
                        vm.toString(existingOwner)
                    )
                );
            } else {
                // TODO: spinner
            }
        }
    }

    function isProjectClaimed(
        ChugSplashRegistry _registry,
        address _manager
    ) internal view returns (bool) {
        return _registry.managerProxies(_manager);
    }

    function proposeChugSplashDeployment(
        ChugSplashManager _manager,
        bytes32 _deploymentId,
        ChugSplashBundles memory _bundles,
        string memory _configUri,
        ProposalRoute _route
    ) internal {
        if (!_manager.isProposer(msg.sender)) {
            revert(
                string.concat(
                    "ChugSplash: caller is not a proposer. Caller's address: ",
                    vm.toString(msg.sender)
                )
            );
        }

        if (_route == ProposalRoute.RELAY || _route == ProposalRoute.REMOTE_EXECUTION) {
            ffiCommitToIPFS(_deploymentId);
        }

        if (_route == ProposalRoute.RELAY) {
            ffiRelayProposal(_deploymentId);
        } else {
            (uint256 numNonProxyContracts, ) = getNumActions(_bundles.actionBundle.actions);
            _manager.propose(
                _bundles.actionBundle.root,
                _bundles.targetBundle.root,
                _bundles.actionBundle.actions.length,
                _bundles.targetBundle.targets.length,
                numNonProxyContracts,
                _configUri,
                _route == ProposalRoute.REMOTE_EXECUTION
            );
        }
    }

    function approveDeployment(bytes32 _deploymentId, ChugSplashManager _manager) internal {
        address projectOwner = _manager.owner();
        if (msg.sender != projectOwner) {
            revert(
                string.concat(
                    "ChugSplash: caller is not the project owner. Caller's address: ",
                    vm.toString(msg.sender),
                    "Owner's address: ",
                    vm.toString(projectOwner)
                )
            );
        }
        _manager.approve(_deploymentId);
    }

    function transferProjectOwnership(ChugSplashManager _manager, address _newOwner) internal {
        if (_newOwner != _manager.owner()) {
            if (_newOwner == address(0)) {
                _manager.renounceOwnership();
            } else {
                _manager.transferOwnership(_newOwner);
            }
        }
    }

    function getConfigCache(
        MinimalParsedConfig memory _minimalConfig,
        ChugSplashRegistry _registry
    ) internal returns (ConfigCache memory) {
        bytes32 organizationID = _minimalConfig.organizationID;
        MinimalParsedContractConfig[] memory minimalParsedContractConfigs = _minimalConfig
            .contracts;

        address managerAddress = address(getChugSplashManager(_registry, organizationID));

        bool liveNetwork = isLiveNetwork();
        string memory networkName = getChain(block.chainid).chainAlias;

        ContractConfigCache[] memory contractConfigCache = new ContractConfigCache[](
            minimalParsedContractConfigs.length
        );
        for (uint256 i = 0; i < contractConfigCache.length; i++) {
            MinimalParsedContractConfig memory minimalContractConfig = minimalParsedContractConfigs[
                i
            ];

            bool isTargetDeployed = minimalContractConfig.targetAddress.code.length > 0;

            OptionalBool memory isImplementationDeployed;
            if (minimalContractConfig.kind != ContractKindEnum.NO_PROXY) {
                // Get the Create3 address of the implementation contract using the DefaultCreate3
                // contract.
                address implAddress = getAddressFromDeployer(
                    minimalContractConfig.salt,
                    managerAddress
                );
                isImplementationDeployed = OptionalBool({
                    value: implAddress.code.length > 0,
                    exists: true
                });
            }

            OptionalString memory previousConfigUri = isTargetDeployed &&
                minimalContractConfig.kind != ContractKindEnum.NO_PROXY
                ? OptionalString({
                    exists: true,
                    value: getPreviousConfigUri(_registry, minimalContractConfig.targetAddress)
                })
                : OptionalString({ exists: false, value: "" });

            // TODO: finish this
        }

        return
            ConfigCache({
                blockGasLimit: block.gaslimit,
                liveNetwork: liveNetwork,
                networkName: networkName,
                contractConfigCache: contractConfigCache
            });
    }

    function getDeploymentId(
        ChugSplashBundles memory _bundles,
        string memory _configUri
    ) private pure returns (bytes32) {
        bytes32 actionRoot = _bundles.actionBundle.root;
        bytes32 targetRoot = _bundles.targetBundle.root;
        uint256 numActions = _bundles.actionBundle.actions.length;
        uint256 numTargets = _bundles.targetBundle.targets.length;
        (uint256 numNonProxyContracts, ) = getNumActions(_bundles.actionBundle.actions);

        return
            keccak256(
                abi.encode(
                    actionRoot,
                    targetRoot,
                    numActions,
                    numTargets,
                    numNonProxyContracts,
                    _configUri
                )
            );
    }

    function getPreviousConfigUri(
        ChugSplashRegistry _registry,
        address _proxyAddress
    ) private returns (string memory) {}

    function ffiGetCurrentChugSplashManagerVersion() private returns (Version memory) {}

    function ffiGetMinimalParsedConfig(
        string memory _configPath
    ) internal returns (MinimalParsedConfig memory) {
        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getMinimalParsedConfig";
        cmds[4] = _configPath;
        // TODO: the rest of the params

        bytes memory minimalParsedConfigBytes = vm.ffi(cmds);
        return abi.decode(minimalParsedConfigBytes, (MinimalParsedConfig));
    }

    function ffiPostParsingValidation(ConfigCache memory _configCache) private {}

    function ffiGetCanonicalConfigData()
        private
        returns (string memory, ChugSplashBundles memory)
    {}

    function ffiCommitToIPFS(bytes32 _deploymentId) private {}

    function ffiRelayProposal(bytes32 _deploymentId) private {}

    function ffiPostDeploymentActions(
        ChugSplashManager _manager,
        bytes32 _deploymentId,
        string memory _configUri,
        bool _liveNetwork,
        string memory _networkName
    ) private {}

    function fetchPaths()
        private
        view
        returns (string memory outPath, string memory buildInfoPath)
    {
        outPath = "./out";
        buildInfoPath = "./out/build-info";
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

        if (
            keccak256(bytes(host)) == keccak256("http://127.0.0.1") ||
            keccak256(bytes(host)) == keccak256("http://localhost")
        ) {
            return false;
        } else {
            return true;
        }
    }

    function _ensureChugSplashInitialized() private {
        // Fetch bytecode from artifacts
        DeploymentBytecode memory bootloaderBytecode = getBootloaderBytecode();
        ChugSplashRegistry registry = getChugSplashRegistry();

        // TODO: i think this needs to be fixed / aligned with the TS version

        // If the registry is not already deployed
        if (address(registry).code.length == 0) {
            // If the target chain is a local network
            if (!isLiveNetwork()) {
                // Setup determinisitic deployment proxy
                address DeterministicDeploymentProxy = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
                vm.etch(
                    DeterministicDeploymentProxy,
                    hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
                );

                // Deploy the adapters
                bytes memory bootloaderOneCreationCode = bootloaderBytecode.bootloaderOne;
                address bootloaderOneAddress = Create2.computeAddress(
                    bytes32(0),
                    keccak256(bootloaderOneCreationCode),
                    DeterministicDeploymentProxy
                );
                DeterministicDeployer.deploy(
                    bootloaderOneCreationCode,
                    type(ChugSplashBootloaderOne).name
                );

                // Deploy the bootloader
                bytes memory bootloaderTwoCreationCode = bootloaderBytecode.bootloaderTwo;
                address bootloaderTwoAddress = Create2.computeAddress(
                    bytes32(0),
                    keccak256(bootloaderTwoCreationCode),
                    DeterministicDeploymentProxy
                );
                DeterministicDeployer.deploy(
                    bootloaderTwoCreationCode,
                    type(ChugSplashBootloaderOne).name
                );

                ChugSplashBootloaderOne chugSplashBootloaderOne = ChugSplashBootloaderOne(
                    bootloaderOneAddress
                );
                ChugSplashBootloaderTwo chugSplashBootloaderTwo = ChugSplashBootloaderTwo(
                    bootloaderTwoAddress
                );

                require(
                    address(chugSplashBootloaderTwo.registry()) == address(registry),
                    "Registry deployed to incorrect address"
                );

                // Impersonate system owner
                vm.startPrank(systemOwnerAddress);

                // Add initial manager version
                registry.addVersion(chugSplashBootloaderTwo.managerImplementationAddress());

                // Add transparent proxy type
                registry.addContractKind(
                    keccak256("oz-transparent"),
                    chugSplashBootloaderOne.ozTransparentAdapterAddr()
                );

                // Add uups ownable proxy type
                registry.addContractKind(
                    keccak256("oz-ownable-uups"),
                    chugSplashBootloaderOne.ozUUPSOwnableAdapterAddr()
                );

                // Add uups access control proxy type
                registry.addContractKind(
                    keccak256("oz-access-control-uups"),
                    chugSplashBootloaderOne.ozUUPSAccessControlAdapterAddr()
                );

                // Add default proxy type
                registry.addContractKind(bytes32(0), chugSplashBootloaderOne.defaultAdapterAddr());

                vm.stopPrank();
            } else {
                // If the target chain is not a local network and the registry has not bee deployed, then throw an error
                revert(
                    "ChugSplash is not available on this network. If you are working on a local network, please report this error to the developers. If you are working on a live network, then it may not be officially supported yet. Feel free to drop a messaging in the Discord and we'll see what we can do!"
                );
            }
        }
    }

    function claim(string memory configPath) public returns (bytes memory) {
        return claim(configPath, false);
    }

    function claim(string memory configPath, bool silent) public returns (bytes memory) {
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

    function propose(string memory configPath, bool silent) external returns (bytes memory) {
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

    function cancel(string memory configPath) external {
        cancel(configPath, false);
    }

    function cancel(string memory configPath, bool silent) public returns (bytes memory) {
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

    function getAddress(
        string memory _configPath,
        string memory _referenceName
    ) public returns (address) {
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

    function getChugSplashRegistry() public returns (ChugSplashRegistry) {
        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getChugSplashRegistry";
        cmds[4] = rpcUrl;

        bytes memory addrBytes = vm.ffi(cmds);
        address addr;
        assembly {
            addr := mload(add(addrBytes, 20))
        }

        return ChugSplashRegistry(addr);
    }

    function getChugSplashManager(
        ChugSplashRegistry _registry,
        bytes32 _organizationID
    ) internal pure returns (ChugSplashManager) {
        bytes memory creationCodeWithConstructorArgs = abi.encodePacked(
            type(ChugSplashManagerProxy).creationCode,
            address(_registry),
            address(_registry)
        );
        address managerAddress = Create2.computeAddress(
            _organizationID,
            keccak256(creationCodeWithConstructorArgs),
            address(_registry)
        );
        return ChugSplashManager(payable(managerAddress));
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
