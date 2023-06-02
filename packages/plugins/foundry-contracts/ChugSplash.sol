// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

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
import { ChugSplashManager } from "@chugsplash/contracts/contracts/ChugSplashManager.sol";
import { ChugSplashManagerEvents } from "@chugsplash/contracts/contracts/ChugSplashManagerEvents.sol";
import { ChugSplashRegistryEvents } from "@chugsplash/contracts/contracts/ChugSplashRegistryEvents.sol";
import { ChugSplashManagerProxy } from "@chugsplash/contracts/contracts/ChugSplashManagerProxy.sol";
import { Version } from "@chugsplash/contracts/contracts/Semver.sol";
import {
    ChugSplashBundles,
    DeploymentState,
    DeploymentStatus,
    BundledChugSplashAction,
    RawChugSplashAction,
    ChugSplashActionType,
    ChugSplashTarget,
    BundledChugSplashTarget,
    ChugSplashActionBundle,
    ChugSplashTargetBundle,
    BundledChugSplashTarget
} from "@chugsplash/contracts/contracts/ChugSplashDataTypes.sol";
import { DefaultCreate3 } from "@chugsplash/contracts/contracts/DefaultCreate3.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import {
    ChugSplashContract,
    DeploymentBytecode,
    MinimalParsedConfig,
    MinimalParsedContractConfig,
    ConfigCache,
    ContractConfigCache,
    DeploymentRevertCache,
    ImportCache,
    ContractKindEnum,
    ProposalRoute,
    ConfigContractInfo,
    OptionalAddress,
    OptionalBool,
    OptionalString,
    OptionalBytes32
} from "./ChugSplashPluginTypes.sol";
import { ChugSplashUtils } from "./ChugSplashUtils.sol";

contract ChugSplash is Script, Test, DefaultCreate3, ChugSplashManagerEvents, ChugSplashRegistryEvents {
    using strings for *;

    struct OptionalLog {
        Vm.Log value;
        bool exists;
    }

    Vm.Log[] private executionLogs;

    ChugSplashUtils private immutable utils;

    string private constant NONE = "none";
    uint256 private constant DEFAULT_PRIVATE_KEY_UINT =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    string private constant DEFAULT_PRIVATE_KEY =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    string private constant DEFAULT_NETWORK = "localhost";

    // Optional env vars
    string private privateKey = vm.envOr("PRIVATE_KEY", DEFAULT_PRIVATE_KEY);
    string private network = vm.envOr("NETWORK", DEFAULT_NETWORK);
    address private newOwnerAddress = vm.envOr("NEW_OWNER", vm.addr(vm.envOr("PRIVATE_KEY", DEFAULT_PRIVATE_KEY_UINT)));
    string private newOwnerString = vm.toString(newOwnerAddress);
    string private ipfsUrl = vm.envOr("IPFS_URL", NONE);
    bool private skipStorageCheck = vm.envOr("SKIP_STORAGE_CHECK", false);
    bool private allowManagedProposals = vm.envOr("ALLOW_MANAGED_PROPOSALS", false);

    // Get owner address
    uint private key = vm.envOr("CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY", uint(0));
    address private systemOwnerAddress =
        key != 0 ? vm.rememberKey(key) : 0x226F14C3e19788934Ff37C653Cf5e24caD198341;

    string private filePath =
        vm.envOr(
            "DEV_FILE_PATH",
            string("./node_modules/@chugsplash/plugins/dist/foundry/index.js")
        );
    bool private isChugSplashTest = vm.envOr("IS_CHUGSPLASH_TEST", false);

    modifier onlyWhenInitialized() {
        ensureChugSplashInitialized();
        _;
    }

    /**
     * @notice This constructor must not revert, or else an opaque error message will be displayed
       to the user.
     */
    constructor() {
        utils = new ChugSplashUtils();
    }

    // TODO(test): you should throw a helpful error message in foundry/index.ts if reading from
    // state on the in-process node (e.g. in async user config).

    // TODO(test): spinner/logs of some sort

    // This is the entry point for the ChugSplash deploy command.
    function deploy(string memory _configPath) internal {
        OptionalAddress memory newOwner;
        newOwner.exists = false;
        deploy(_configPath, newOwner);
    }

    // TODO(test): remove all of the old ffi functions

    // TODO: create utils contract. change on and off chain logic accordingly

    function deploy(string memory _configPath, OptionalAddress memory _newOwner) private onlyWhenInitialized {
        MinimalParsedConfig memory minimalParsedConfig = ffiGetMinimalParsedConfig(_configPath);

        ChugSplashRegistry registry = getChugSplashRegistry();
        ChugSplashManager manager = getChugSplashManager(
            registry,
            minimalParsedConfig.organizationID
        );

        ConfigCache memory configCache = getConfigCache(minimalParsedConfig, registry, manager);

        ffiPostParsingValidation(configCache);

        string memory networkName = configCache.networkName;
        uint256 blockGasLimit = configCache.blockGasLimit;
        bool localNetwork = configCache.localNetwork;

        // TODO: what happens to msg.sender when startBroadcast(addr) is used?
        address deployer = utils.msgSender();
        finalizeRegistration(
            registry,
            manager,
            minimalParsedConfig.organizationID,
            deployer,
            false
        );

        address realManagerAddress = registry.projects(minimalParsedConfig.organizationID);
        require(realManagerAddress == address(manager), "Computed manager address is different from expected address");

        // Unlike the TypeScript version, we don't get the CanonicalConfig since Solidity doesn't
        // support complex types like the 'variables' field.
        (string memory configUri, ChugSplashBundles memory bundles) = ffiGetCanonicalConfigData(configCache);

        if (bundles.actionBundle.actions.length == 0 && bundles.targetBundle.targets.length == 0) {
            // TODO(test): logger is probably justified here
            return;
        }

        bytes32 deploymentId = getDeploymentId(bundles, configUri);
        DeploymentState memory deploymentState = manager.deployments(deploymentId);

        if (deploymentState.status == DeploymentStatus.CANCELLED) {
            revert(
                string.concat(
                    minimalParsedConfig.projectName,
                    " was previously cancelled on ",
                    networkName
                )
            );
        }

        if (deploymentState.status == DeploymentStatus.EMPTY) {
            proposeChugSplashDeployment(
                manager,
                bundles,
                configUri,
                ProposalRoute.LOCAL_EXECUTION
            );
            deploymentState.status = DeploymentStatus.PROPOSED;
        }

        if (deploymentState.status == DeploymentStatus.PROPOSED) {
            approveDeployment(deploymentId, manager);
            deploymentState.status = DeploymentStatus.APPROVED;
        }

        if (
            deploymentState.status == DeploymentStatus.APPROVED ||
            deploymentState.status == DeploymentStatus.PROXIES_INITIATED
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

        // ffiPostDeploymentActions(manager, deploymentId, configUri, localNetwork, networkName);

        // TODO: output table-like thing (see old deploy function)
    }

    function finalizeRegistration(
        ChugSplashRegistry _registry,
        ChugSplashManager _manager,
        bytes32 _organizationID,
        address _newOwner,
        bool _allowManagedProposals
    ) private {
        if (!isProjectClaimed(_registry, address(_manager))) {
            bytes memory initializerData = abi.encode(
                _newOwner,
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
    ) private view returns (bool) {
        return _registry.managerProxies(_manager);
    }

    // TODO: separate the local proposal logic from the remote proposal logic in both TS and foundry.
    function proposeChugSplashDeployment(
        ChugSplashManager _manager,
        ChugSplashBundles memory _bundles,
        string memory _configUri,
        ProposalRoute _route
    ) private {
        address deployer = utils.msgSender();
        if (!_manager.isProposer(deployer)) {
            revert(
                string.concat(
                    "ChugSplash: caller is not a proposer. Caller's address: ",
                    vm.toString(deployer)
                )
            );
        }

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

    function approveDeployment(bytes32 _deploymentId, ChugSplashManager _manager) private {
        address projectOwner = _manager.owner();
        address deployer = utils.msgSender();
        if (deployer != projectOwner) {
            revert(
                string.concat(
                    "ChugSplash: caller is not the project owner. Caller's address: ",
                    vm.toString(deployer),
                    "Owner's address: ",
                    vm.toString(projectOwner)
                )
            );
        }
        _manager.approve(_deploymentId);
    }

    function transferProjectOwnership(ChugSplashManager _manager, address _newOwner) private {
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
        ChugSplashRegistry _registry,
        ChugSplashManager _manager
    ) private returns (ConfigCache memory) {
        MinimalParsedContractConfig[] memory contractConfigs = _minimalConfig
            .contracts;

        bool localNetwork = isLocalNetwork();
        string memory networkName = getChain(block.chainid).chainAlias;

        ContractConfigCache[] memory contractConfigCache = new ContractConfigCache[](
            contractConfigs.length
        );
        for (uint256 i = 0; i < contractConfigCache.length; i++) {
            MinimalParsedContractConfig memory contractConfig = contractConfigs[
                i
            ];

            bool isTargetDeployed = contractConfig.targetAddress.code.length > 0;

            OptionalBool memory isImplementationDeployed;
            if (contractConfig.kind != ContractKindEnum.NO_PROXY) {
                // Get the Create3 address of the implementation contract using the DefaultCreate3
                // contract.
                address implAddress = getAddressFromDeployer(
                    contractConfig.salt,
                    address(_manager)
                );
                isImplementationDeployed = OptionalBool({
                    value: implAddress.code.length > 0,
                    exists: true
                });
            }

            OptionalString memory previousConfigUri = isTargetDeployed &&
                contractConfig.kind != ContractKindEnum.NO_PROXY
                ?
                    getPreviousConfigUri(
                        _registry,
                        contractConfig.targetAddress,
                        localNetwork
                    )
                : OptionalString({ exists: false, value: "" });

            OptionalBytes32 memory deployedCreationCodeWithArgsHash = isTargetDeployed ?
            getDeployedCreationCodeWithArgsHash(_manager, contractConfig.referenceName, contractConfig.targetAddress)
             : OptionalBytes32({ exists: false, value: "" });

            // TODO(test): we need to get helpful logs from the ChugSplashManager if contract deployment
            // fails during execution

            // At this point in the TypeScript version of this function, we attempt to deploy all of
            // the non-proxy contracts. We skip this step here because it's unnecessary in this
            // context. Forge does local simulation before broadcasting any transactions, so if a
            // constructor reverts, it'll be caught before anything happens on the live network.
            DeploymentRevertCache memory deploymentRevert = DeploymentRevertCache({
                deploymentReverted: false,
                revertString: OptionalString({exists: false, value: ""})
            });

            ImportCache memory importCache;
            if (isTargetDeployed) {
                // TODO(docs): explain why we skip the UUPS check: can't do it on the in-process anvil
                // node, and it doesn't impact UX because of local simulation. (well technically it does
                // impact UX slightly. 1 error message instead of potentially several, but this isn't a
                // big enough deal to warrant a janky workaround imo. fwiw this is standard behavior on
                // forge scripts, since the script halts on the first error)
                // In the TypeScript version of this function, we check that the ChugSplashManager can call
                // the 'upgradeTo' function if it's a UUPS proxy. However, we skip this step here because
                // TODO: does staticcall
                if (contractConfig.kind == ContractKindEnum.EXTERNAL_DEFAULT || contractConfig.kind == ContractKindEnum.INTERNAL_DEFAULT || contractConfig.kind == ContractKindEnum.OZ_TRANSPARENT) {
                    // Check that the ChugSplashManager is the owner of the Transparent proxy.
                    address currProxyAdmin = getEIP1967ProxyAdminAddress(
                        contractConfig.targetAddress
                    );

                    if (currProxyAdmin != address(_manager)) {
                        importCache = ImportCache({
                            requiresImport: true,
                            currProxyAdmin: OptionalAddress({exists: true, value: currProxyAdmin})
                        });
                    }
                }
            }

            contractConfigCache[i] = ContractConfigCache({
                referenceName: contractConfig.referenceName,
                isTargetDeployed: isTargetDeployed,
                deployedCreationCodeWithArgsHash: deployedCreationCodeWithArgsHash,
                deploymentRevert: deploymentRevert,
                importCache: importCache,
                isImplementationDeployed: isImplementationDeployed,
                previousConfigUri: previousConfigUri
            });
        }

        return
            ConfigCache({
                blockGasLimit: block.gaslimit,
                localNetwork: localNetwork,
                networkName: networkName,
                contractConfigCache: contractConfigCache
            });
    }

    function getDeployedCreationCodeWithArgsHash(
        ChugSplashManager _manager,
        string memory _referenceName,
        address _contractAddress
    ) private view returns (OptionalBytes32 memory) {
        OptionalLog memory latestDeploymentEvent = getLatestEvent(
            address(_manager),
            ContractDeployed.selector,
            OptionalBytes32({ exists: true, value: keccak256(bytes(_referenceName)) }),
            OptionalBytes32({ exists: true, value: toBytes32(_contractAddress) }),
            OptionalBytes32({ exists: false, value: bytes32(0) })
        );

        if (!latestDeploymentEvent.exists) {
            return OptionalBytes32({ exists: false, value: bytes32(0) });
        } else {
            (, , bytes32 creationCodeWithArgsHash) = abi.decode(latestDeploymentEvent.value.data, (string, uint256, bytes32));
            return OptionalBytes32({ exists: true, value: creationCodeWithArgsHash });
        }
    }

    function getEIP1967ProxyAdminAddress(address _proxyAddress) internal view returns (address) {
        // The EIP-1967 storage slot that holds the address of the owner.
        // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
        bytes32 ownerKey = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

        bytes32 ownerBytes32 = vm.load(_proxyAddress, ownerKey);

        // Convert the bytes32 value to an address.
        return address(uint160(uint256(ownerBytes32)));
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
        address _proxyAddress,
        bool _localNetwork
    ) private returns (OptionalString memory) {
        // TODO(docs): explain why this is different from TS
        if (!_localNetwork) {
            return ffiGetPreviousConfigUri(_proxyAddress);
        } else {
            OptionalLog memory latestRegistryEvent = getLatestEvent(
                address(_registry),
                EventAnnouncedWithData.selector,
                OptionalBytes32({ exists: true, value: keccak256("ProxyUpgraded") }),
                OptionalBytes32({ exists: false, value: bytes32(0) }),
                OptionalBytes32({ exists: true, value: keccak256(abi.encodePacked(_proxyAddress)) })
            );

            if (!latestRegistryEvent.exists) {
                return OptionalString({ exists: false, value: "" });
            }

            // TODO(docs)
            bytes memory managerBytes = bytes.concat(latestRegistryEvent.value.topics[2]);
            address manager = abi.decode(managerBytes, (address));

            OptionalLog memory latestUpgradeEvent = getLatestEvent(
                manager,
                ProxyUpgraded.selector,
                OptionalBytes32({ exists: false, value: bytes32(0) }),
                OptionalBytes32({ exists: true, value: toBytes32(_proxyAddress) }),
                OptionalBytes32({ exists: false, value: bytes32(0) })
            );

            if (!latestUpgradeEvent.exists) {
                return OptionalString({ exists: false, value: "" });
            }

            bytes32 deploymentId = latestUpgradeEvent.value.topics[1];

            DeploymentState memory deploymentState = ChugSplashManager(payable(manager)).deployments(deploymentId);

            return OptionalString({exists: true, value: deploymentState.configUri});
        }
    }

    // TODO(docs): this has the same behavior as the ethersjs function, sort of.
    function getLatestEvent(
        address _emitter,
        bytes32 _topic0, // TODO(docs): this is the event selector unless the event is anonymous
        OptionalBytes32 memory _topic1,
        OptionalBytes32 memory _topic2,
        OptionalBytes32 memory _topic3
    ) private view returns (OptionalLog memory) {
        // TODO(docs): we iterate over the events in descending order because...
        for (uint256 i = executionLogs.length - 1; i >= 0; i--) {
            Vm.Log memory log = executionLogs[i];
            uint256 numTopics = log.topics.length;
            if (
                log.emitter == _emitter &&
                (numTopics > 0 && _topic0 == log.topics[0]) &&
                (!_topic1.exists || (numTopics > 1 && _topic1.value == log.topics[1])) &&
                (!_topic2.exists || (numTopics > 2 && _topic2.value == log.topics[2])) &&
                (!_topic3.exists || (numTopics > 3 && _topic3.value == log.topics[3]))
            ) {
                return OptionalLog({ exists: true, value: log });
            }
        }
        // TODO: return blank log to stop solidity warning
    }

    function ffiGetCurrentChugSplashManagerVersion() private returns (Version memory) {
        string[] memory cmds = new string[](4);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getCurrentChugSplashManagerVersion";

        bytes memory versionBytes = vm.ffi(cmds);
        return abi.decode(versionBytes, (Version));
    }

    function ffiGetMinimalParsedConfig(
        string memory _configPath
    ) private returns (MinimalParsedConfig memory) {
        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getMinimalParsedConfig";
        cmds[4] = _configPath;

        bytes memory minimalParsedConfigBytes = vm.ffi(cmds);
        MinimalParsedConfig memory config = abi.decode(minimalParsedConfigBytes, (MinimalParsedConfig));
        return config;
    }

    function ffiPostParsingValidation(ConfigCache memory _configCache) private {
        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "postParsingValidation";
        bytes memory encodedCache = abi.encode(_configCache);
        cmds[4] = vm.toString(encodedCache);

        vm.ffi(cmds);
    }

    function ffiGetCanonicalConfigData(ConfigCache memory _configCache)
        private
        returns (string memory, ChugSplashBundles memory)
    {
        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getCanonicalConfigData";
        bytes memory encodedCache = abi.encode(_configCache);
        cmds[4] = vm.toString(encodedCache);

        bytes memory result = vm.ffi(cmds);

        // TODO(docs): explain what's happening and why we can't just abi.decode(configUri, bundles)

        bytes memory splitIdxBytes = utils.slice(result, result.length - 64, result.length);
        (uint256 splitIdx1, uint256 splitIdx2) = abi.decode(splitIdxBytes, (uint256, uint256));

        bytes memory configUriBytes = utils.slice(result, 0, splitIdx1);
        (string memory configUri) = abi.decode(configUriBytes, (string));

        bytes memory actionBundleBytes = utils.slice(result, splitIdx1, splitIdx2);
        bytes memory targetBundleBytes = utils.slice(result, splitIdx2, result.length);
        (ChugSplashActionBundle memory actionBundle) = abi.decode(actionBundleBytes, (ChugSplashActionBundle));
        (ChugSplashTargetBundle memory targetBundle) = abi.decode(targetBundleBytes, (ChugSplashTargetBundle));
        return (configUri, ChugSplashBundles({ actionBundle: actionBundle, targetBundle: targetBundle }));
    }

    function ffiGetPreviousConfigUri(address _proxyAddress) private returns (OptionalString memory) {
        string[] memory cmds = new string[](6);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getPreviousConfigUri";
        cmds[4] = getRpcUrl();
        cmds[5] = vm.toString(_proxyAddress);

        bytes memory result = vm.ffi(cmds);

        (bool exists, string memory configUri) = abi.decode(result, (bool, string));

        return OptionalString({ exists: exists, value: configUri });
    }

    function ffiPostDeploymentActions(
        ChugSplashManager _manager,
        bytes32 _deploymentId,
        string memory _configUri,
        bool _localNetwork,
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

    function getChugSplashManagerProxyBytecode() private returns (bytes memory) {
        string[] memory cmds = new string[](4);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getChugSplashManagerProxyBytecode";

        return vm.ffi(cmds);
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

    // TODO(docs): when a user inputs a random chain ID, our system doesn't work. this can happen
    // through the CLI (--chain-id), and maybe in the foundry.toml (not sure if there's an
    // equivalent to --chain-id there). We should throw a helpful error message and/or document
    // this.

    function getRpcUrl() internal returns (string memory) {
        string memory chainAlias = getChain(block.chainid).chainAlias;
        try vm.rpcUrl(chainAlias) returns (string memory rpcUrl) {
            return rpcUrl;
        } catch (bytes memory) {
            revert(string.concat("Detected a non-standard RPC endpoint name in foundry.toml. Please use: ", chainAlias));
        }
    }

    /**
     * @notice Returns true if the current network is either the in-process or standalone Anvil
     * node. Returns false if the current network is a forked or live network.
     */
    function isLocalNetwork() private returns (bool) {
        strings.slice memory sliceUrl = getRpcUrl().toSlice();
        strings.slice memory delim = ":".toSlice();
        string[] memory parts = new string[](sliceUrl.count(delim) + 1);
        for(uint i = 0; i < parts.length; i++) {
            parts[i] = sliceUrl.split(delim).toString();
        }
        string memory host = parts[1];

        if (
            keccak256(bytes(host)) == keccak256(bytes("//127.0.0.1")) ||
            keccak256(bytes(host)) == keccak256(bytes("//localhost"))
        ) {
            return true;
        } else {
            return false;
        }
    }

    function ensureChugSplashInitialized() private {
        ChugSplashRegistry registry = getChugSplashRegistry();
        // if (address(registry).code.length > 0) {
        //     return;
        // } else if (isLocalNetwork()) {
        //     // Fetch bytecode from artifacts
        //     DeploymentBytecode memory bootloaderBytecode = getBootloaderBytecode();

        //     // Setup determinisitic deployment proxy
        //     address DeterministicDeploymentProxy = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
        //     vm.etch(
        //         DeterministicDeploymentProxy,
        //         hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
        //     );

        //     // Deploy the adapters
        //     bytes memory bootloaderOneCreationCode = bootloaderBytecode.bootloaderOne;
        //     address bootloaderOneAddress = Create2.computeAddress(
        //         bytes32(0),
        //         keccak256(bootloaderOneCreationCode),
        //         DeterministicDeploymentProxy
        //     );
        //     DeterministicDeployer.deploy(
        //         bootloaderOneCreationCode,
        //         type(ChugSplashBootloaderOne).name
        //     );

        //     // Deploy the bootloader
        //     bytes memory bootloaderTwoCreationCode = bootloaderBytecode.bootloaderTwo;
        //     address bootloaderTwoAddress = Create2.computeAddress(
        //         bytes32(0),
        //         keccak256(bootloaderTwoCreationCode),
        //         DeterministicDeploymentProxy
        //     );
        //     DeterministicDeployer.deploy(
        //         bootloaderTwoCreationCode,
        //         type(ChugSplashBootloaderOne).name
        //     );

        //     ChugSplashBootloaderOne chugSplashBootloaderOne = ChugSplashBootloaderOne(
        //         bootloaderOneAddress
        //     );
        //     ChugSplashBootloaderTwo chugSplashBootloaderTwo = ChugSplashBootloaderTwo(
        //         bootloaderTwoAddress
        //     );

        //     require(
        //         address(chugSplashBootloaderTwo.registry()) == address(registry),
        //         "Registry deployed to incorrect address"
        //     );

        //     // Impersonate system owner
        //     vm.startPrank(systemOwnerAddress);

        //     // Add initial manager version
        //     registry.addVersion(chugSplashBootloaderTwo.managerImplementationAddress());

        //     // Add transparent proxy type
        //     registry.addContractKind(
        //         keccak256("oz-transparent"),
        //         chugSplashBootloaderOne.ozTransparentAdapterAddr()
        //     );

        //     // Add uups ownable proxy type
        //     registry.addContractKind(
        //         keccak256("oz-ownable-uups"),
        //         chugSplashBootloaderOne.ozUUPSOwnableAdapterAddr()
        //     );

        //     // Add uups access control proxy type
        //     registry.addContractKind(
        //         keccak256("oz-access-control-uups"),
        //         chugSplashBootloaderOne.ozUUPSAccessControlAdapterAddr()
        //     );

        //     // Add default proxy type
        //     registry.addContractKind(bytes32(0), chugSplashBootloaderOne.defaultAdapterAddr());

        //     vm.stopPrank();
        // } else {
        //     // We're on a forked or live network that doesn't have ChugSplash deployed, which
        //     // means we don't support ChugSplash on this network yet.
        //     revert(
        //         "ChugSplash is not available on this network. If you are working on a local network, please report this error to the developers. If you are working on a live network, then it may not be officially supported yet. Feel free to drop a messaging in the Discord and we'll see what we can do!"
        //     );
        // }
    }

    function claim(string memory configPath) internal returns (bytes memory) {
        return claim(configPath, false);
    }

    function claim(string memory configPath, bool silent) internal returns (bytes memory) {
        (string memory outPath, string memory buildInfoPath) = fetchPaths();

        string[] memory cmds = new string[](13);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "claim";
        cmds[4] = configPath;
        cmds[5] = getRpcUrl();
        cmds[6] = network;
        cmds[7] = privateKey;
        cmds[8] = silent == true ? "true" : "false";
        cmds[9] = outPath;
        cmds[10] = buildInfoPath;
        cmds[11] = newOwnerString;
        cmds[12] = allowManagedProposals == true ? "true" : "false";

        bytes memory result = vm.ffi(cmds);

        if (!silent) {
            emit log(string(result));
            emit log(string("\n"));
        }

        return result;
    }

    function propose(string memory configPath, bool silent) internal returns (bytes memory) {
        (string memory outPath, string memory buildInfoPath) = fetchPaths();

        string[] memory cmds = new string[](13);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "propose";
        cmds[4] = configPath;
        cmds[5] = getRpcUrl();
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

    function cancel(string memory configPath) internal {
        cancel(configPath, false);
    }

    function cancel(string memory configPath, bool silent) internal returns (bytes memory) {
        string[] memory cmds = new string[](8);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "cancel";
        cmds[4] = configPath;
        cmds[5] = getRpcUrl();
        cmds[6] = network;
        cmds[7] = privateKey;

        bytes memory result = vm.ffi(cmds);
        if (!silent) {
            emit log(string(result));
            emit log(string("\n"));
        }

        return result;
    }

    function listProjects() internal returns (bytes memory) {
        string[] memory cmds = new string[](7);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "listProjects";
        cmds[4] = getRpcUrl();
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
    ) internal returns (bytes memory) {
        (string memory outPath, string memory buildInfoPath) = fetchPaths();

        string[] memory cmds = new string[](12);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "exportProxy";
        cmds[4] = configPath;
        cmds[5] = getRpcUrl();
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
    ) internal returns (bytes memory) {
        string[] memory cmds = new string[](10);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "importProxy";
        cmds[4] = configPath;
        cmds[5] = getRpcUrl();
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
    ) internal returns (address) {
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

    function getChugSplashRegistry() internal returns (ChugSplashRegistry) {
        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = filePath;
        cmds[3] = "getRegistryAddress";
        cmds[4] = getRpcUrl();

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
    ) private returns (ChugSplashManager) {
        bytes memory proxyBytecode = getChugSplashManagerProxyBytecode();
        bytes memory creationCodeWithConstructorArgs = abi.encodePacked(
            proxyBytecode,
            abi.encode(_registry, address(_registry))
        );
        address managerAddress = Create2.computeAddress(
            _organizationID,
            keccak256(creationCodeWithConstructorArgs),
            address(_registry)
        );
        return ChugSplashManager(payable(managerAddress));
    }

    function inefficientSlice(BundledChugSplashAction[] memory selected, uint start, uint end) private pure returns (BundledChugSplashAction[] memory sliced) {
        sliced = new BundledChugSplashAction[](end - start);
        for (uint i = start; i < end; i++) {
            sliced[i] = selected[i];
        }
    }

    /**
     * @notice Splits up a bundled action into its components
     */
    function disassembleActions(BundledChugSplashAction[] memory actions) private pure returns (RawChugSplashAction[] memory, uint256[] memory, bytes32[][] memory) {
        RawChugSplashAction[] memory rawActions = new RawChugSplashAction[](actions.length);
        uint256[] memory _actionIndexes = new uint256[](actions.length);
        bytes32[][] memory _proofs = new bytes32[][](actions.length);
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            rawActions[i] = action.action;
            _actionIndexes[i] = action.proof.actionIndex;
            _proofs[i] = action.proof.siblings;
        }

        return (rawActions, _actionIndexes, _proofs);
    }

    /**
     * Helper function that determines if a given batch is executable within the specified gas limit.
     */
    function executable(
        BundledChugSplashAction[] memory selected,
        uint maxGasLimit,
        MinimalParsedContractConfig[] contractConfigs
    ) private view returns (bool) {
        (RawChugSplashAction[] memory actions, uint256[] memory _actionIndexes, bytes32[][] memory _proofs) = disassembleActions(selected);

        uint256 estGasUsed = 0;

        for (uint i = 0; i < selected.length; i++) {
            BundledChugSplashAction memory action = selected[i];

            ChugSplashActionType actionType = action.action.actionType;
            string memory referenceName = action.action.referenceName;
            if (actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                uint256 deployContractCost = find(referenceName, contractConfigs).estDeployContractCost;

                // We add 150k as an estimate for the cost of the transaction that executes the
                // DeployContract action.
                estGasUsed += deployContractCost + 150_000;
            } else if (actionType == ChugSplashActionType.SET_STORAGE) {
                estGasUsed += 150_000;
            } else {
                revert("Unknown action type. Should never happen.");
            }
        }
        return maxGasLimit > estGasUsed;
    }

    function find(string memory referenceName, MinimalParsedContractConfig[] memory contractConfigs) private pure returns (MinimalParsedContractConfig memory) {
        for (uint i = 0; i < contractConfigs.length; i++) {
            MinimalParsedContractConfig memory contractConfig = contractConfigs[i];
            if (equals(contractConfig.referenceName, referenceName)) {
                return contractConfig;
            }
        }
        revert("Could not find contract config corresponding to a reference name. Should never happen.");
    }

    /**
     * Helper function for finding the maximum number of batch elements that can be executed from a
     * given input list of actions. This is done by performing a binary search over the possible
     * batch sizes and finding the largest batch size that does not exceed the maximum gas limit.
     */
    function findMaxBatchSize(
        BundledChugSplashAction[] memory actions,
        ChugSplashManager manager,
        uint maxGasLimit
    ) private view returns (uint) {
        // Optimization, try to execute the entire batch at once before doing a binary search
        if (executable(actions, manager, maxGasLimit)) {
            return actions.length;
        }

        // If the full batch isn't executavle, then do a binary search to find the largest executable batch size
        uint min = 0;
        uint max = actions.length;
        while (min < max) {
            uint mid = Math.ceilDiv((min + max), 2);
            BundledChugSplashAction[] memory left = inefficientSlice(actions, 0, mid);
            if (executable(left, manager, maxGasLimit)) {
                min = mid;
            } else {
                max = mid - 1;
            }
        }

        // No possible size works, this is a problem and should never happen
        if (min == 0) {
            revert("Unable to find a batch size that does not exceed the block gas limit");
        }

        return min;
    }

    /**
     * Helper function for executing a list of actions in batches.
     */
    function executeBatchActions(
        BundledChugSplashAction[] memory actions,
        ChugSplashManager manager,
        uint maxGasLimit
    ) private returns (DeploymentStatus) {
        // Pull the deployment state from the contract to make sure we're up to date
        bytes32 activeDeploymentId = manager.activeDeploymentId();
        DeploymentState memory state = manager.deployments(activeDeploymentId);
        // Filter out actions that have already been executed
        uint length = 0;
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            if (state.actions[action.proof.actionIndex] == false) {
                length += 1;
            }
        }
        BundledChugSplashAction[] memory filteredActions = new BundledChugSplashAction[](length);
        uint filteredActionIndex = 0;
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            if (state.actions[action.proof.actionIndex] == false) {
                filteredActions[filteredActionIndex] = action;
                filteredActionIndex += 1;
            }
        }

        // Exit early if there are no actions to execute
        if (filteredActions.length == 0) {
            return state.status;
        }

        uint executed = 0;
        while (executed < filteredActions.length) {
            // Figure out the maximum number of actions that can be executed in a single batch
            uint batchSize = findMaxBatchSize(inefficientSlice(filteredActions, executed, filteredActions.length), manager, maxGasLimit);
            BundledChugSplashAction[] memory batch = inefficientSlice(filteredActions, executed, executed + batchSize);
            (RawChugSplashAction[] memory rawActions, uint256[] memory _actionIndexes, bytes32[][] memory _proofs) = disassembleActions(batch);
            manager.executeActions(rawActions, _actionIndexes, _proofs);

            // Return early if the deployment failed
            state = manager.deployments(activeDeploymentId);
            if (state.status == DeploymentStatus.FAILED) {
                return state.status;
            }

            // Move to next batch if necessary
            executed += batchSize;
        }

        // Return the final status
        return state.status;
    }

    function executeDeployment(
        ChugSplashManager manager,
        ChugSplashBundles memory bundles,
        uint256 blockGasLimit
    ) private returns (bool) {
        vm.recordLogs();

        // We execute all actions in batches to reduce the total number of transactions and reduce the
        // cost of a deployment in general. Approaching the maximum block gas limit can cause
        // transactions to be executed slowly as a result of the algorithms that miners use to select
        // which transactions to include. As a result, we restrict our total gas usage to a fraction of
        // the block gas limit.
        uint maxGasLimit = blockGasLimit / 2;

        // Get number of deploy contract and set state actions
        (uint256 numDeployContractActions, uint256 numSetStorageActions) = getNumActions(bundles.actionBundle.actions);

        // Split up the deploy contract and set storage actions
        BundledChugSplashAction[] memory deployContractActions = new BundledChugSplashAction[](numDeployContractActions);
        BundledChugSplashAction[] memory setStorageActions = new BundledChugSplashAction[](numSetStorageActions);
        uint deployContractIndex = 0;
        uint setStorageIndex = 0;
        for (uint i = 0; i < bundles.actionBundle.actions.length; i++) {
            BundledChugSplashAction memory action = bundles.actionBundle.actions[i];
            if (action.action.actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                deployContractActions[deployContractIndex] = action;
                deployContractIndex += 1;
            } else {
                setStorageActions[setStorageIndex] = action;
                setStorageIndex += 1;
            }
        }

        // Execute all the deploy contract actions and exit early if the deployment failed
        DeploymentStatus status = executeBatchActions(deployContractActions, manager, maxGasLimit);
        if (status == DeploymentStatus.FAILED) {
            return false;
        } else if (status == DeploymentStatus.COMPLETED) {
            return true;
        }

        // Dissemble the set storage actions
        ChugSplashTarget[] memory targets = new ChugSplashTarget[](bundles.targetBundle.targets.length);
        bytes32[][] memory proofs = new bytes32[][](bundles.targetBundle.targets.length);
        for (uint i = 0; i < bundles.targetBundle.targets.length; i++) {
            BundledChugSplashTarget memory target = bundles.targetBundle.targets[i];
            targets[i] = target.target;
            proofs[i] = target.siblings;
        }

        // Start the upgrade
        manager.initiateUpgrade(targets, proofs);

        // Execute all the set storage actions
        executeBatchActions(setStorageActions, manager, maxGasLimit);

        // Complete the upgrade
        manager.finalizeUpgrade(targets, proofs);

        pushRecordedLogs();

        return true;
    }

    function getNumActions(BundledChugSplashAction[] memory _actions) private pure returns (uint256, uint256)  {
        uint256 numDeployContractActions = 0;
        uint256 numSetStorageActions = 0;
        for (uint256 i = 0; i < _actions.length; i++) {
            ChugSplashActionType actionType = _actions[i].action.actionType;
            if (actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                numDeployContractActions += 1;
            } else if (actionType == ChugSplashActionType.SET_STORAGE) {
                numSetStorageActions += 1;
            }
        }
        return (numDeployContractActions, numSetStorageActions);
    }

    function pushRecordedLogs() private {
        // TODO(docs): it's tempting to do `executionLogs.push(vm.getRecordedLogs())`, but we can't
        // because...
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint i = 0; i < logs.length; i++) {
            executionLogs.push(logs[i]);
        }
    }

    function equals(string memory _str1, string memory _str2) private pure returns (bool) {
        return keccak256(abi.encodePacked(_str1)) == keccak256(abi.encodePacked(_str2));
    }

    function toBytes32(address _addr) private pure returns (bytes32) {
        return bytes32(uint256(uint160(_addr)));
    }
}
