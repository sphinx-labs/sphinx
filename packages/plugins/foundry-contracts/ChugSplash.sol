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
    ChugSplashActionBundle
} from "@chugsplash/contracts/contracts/ChugSplashDataTypes.sol";
import { DefaultCreate3 } from "@chugsplash/contracts/contracts/DefaultCreate3.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

// TODO: use vm.rpcUrl(alias) everywhere you need the provider in TypeScript
contract ChugSplash is Script, Test, DefaultCreate3, ChugSplashManagerEvents, ChugSplashRegistryEvents {
    using strings for *;

    Vm.Log[] private executionLogs;

    string constant NONE = "none";
    uint256 constant DEFAULT_PRIVATE_KEY_UINT =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    string constant DEFAULT_PRIVATE_KEY =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    string constant DEFAULT_NETWORK = "localhost";

    // Optional env vars
    string privateKey = vm.envOr("PRIVATE_KEY", DEFAULT_PRIVATE_KEY);
    string network = vm.envOr("NETWORK", DEFAULT_NETWORK);
    address newOwnerAddress = vm.envOr("NEW_OWNER", vm.addr(vm.envOr("PRIVATE_KEY", DEFAULT_PRIVATE_KEY_UINT)));
    string newOwnerString = vm.toString(newOwnerAddress);
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
        OptionalBytes32 deployedCreationCodeWithArgsHash;
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

    struct OptionalBytes32 {
        bytes32 value;
        bool exists;
    }

    struct OptionalLog {
        Vm.Log value;
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

        ConfigCache memory configCache = getConfigCache(minimalParsedConfig, registry, manager);

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
        ChugSplashRegistry _registry,
        ChugSplashManager _manager
    ) internal returns (ConfigCache memory) {
        MinimalParsedContractConfig[] memory contractConfigs = _minimalConfig
            .contracts;

        bool liveNetwork = isLiveNetwork();
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
                        liveNetwork
                    )
                : OptionalString({ exists: false, value: "" });

            OptionalBytes32 memory deployedCreationCodeWithArgsHash = isTargetDeployed ?
            OptionalBytes32({exists: true, value: getDeployedCreationCodeWithArgsHash(_manager, contractConfig.referenceName, contractConfig.targetAddress)}) : OptionalBytes32({ exists: false, value: "" });

            // TODO: we need to get helpful logs from the ChugSplashManager if contract deployment
            // fails during execution

            // TODO(docs): we skip attempting to deploy the contract because forge script does
            // local simulation before sending any transactions. if a constructor reverts, it'll be
            // caught in that step and displayed to the user.

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
                liveNetwork: liveNetwork,
                networkName: networkName,
                contractConfigCache: contractConfigCache
            });
    }

    function getDeployedCreationCodeWithArgsHash(
        ChugSplashManager _manager,
        string memory _referenceName,
        address _contractAddress
    ) private view returns (bytes32) {
        OptionalLog memory latestDeploymentEvent = getLatestEvent(
            address(_manager),
            ContractDeployed.selector,
            OptionalBytes32({ exists: true, value: keccak256(bytes(_referenceName)) }),
            OptionalBytes32({ exists: true, value: toBytes32(_contractAddress) }),
            OptionalBytes32({ exists: false, value: bytes32(0) })
        );

        if (!latestDeploymentEvent.exists) {
            revert("TODO");
        } else {
            (, , bytes32 creationCodeWithArgsHash) = abi.decode(latestDeploymentEvent.value.data, (string, uint256, bytes32));
            return creationCodeWithArgsHash;
        }
    }

    function getEIP1967ProxyAdminAddress(address _proxyAddress) public view returns (address) {
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
        bool _liveNetwork
    ) private returns (OptionalString memory) {
        // TODO(docs): explain why this is different from TS
        if (_liveNetwork) {
            return ffiGetPreviousConfigUri(_registry, _proxyAddress);
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

    // TODO(ryan): Most of these FFI functions are missing input variables, since I wasn't sure what
    // would be necessary. I believe they all have the correct return values though.

    // TODO(ryan): should return the value of `CURRENT_CHUGSPLASH_MANAGER_VERSION` in
    // core/src/constants.ts
    function ffiGetCurrentChugSplashManagerVersion() private returns (Version memory) {}

    // TODO(ryan): I implemented most of this function already in 'foundry/index.ts'
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

    // TODO(ryan): this just calls `postParsingValidation` in TS
    function ffiPostParsingValidation(ConfigCache memory _configCache) private {}

    // TODO(ryan): should just return the string configUri and the ChugSplashBundles from `getCanonicalConfigData` in TS.
    function ffiGetCanonicalConfigData()
        private
        returns (string memory, ChugSplashBundles memory)
    {}

    // TODO(ryan): for context, the previous config URI is mainly for retrieving the previous
    // canonical config, which is necessary for the OpenZeppelin storage slot checker. this function
    // is only called on non-anvil networks (i.e. on live or forked networks). so, it's safe to
    // assume that there's a valid rpc URL. we get the rpc url via `vm.rpcUrl(chainAlias)` then pass
    // it in to the FFI call. Note that `chainAlias` can be retrieved by doing:
    // `getChainId(block.chainid).chainAlias`. The typescript function to call is
    // `getPreviousConfigUri`.
    function ffiGetPreviousConfigUri(ChugSplashRegistry _registry, address _proxyAddress) private returns (OptionalString memory) {}

    // TODO(ryan): this is only necessary for the propose task, but feel free to implement anyway.
    // this should just call these two functions:
    // https://github.com/chugsplash/chugsplash/blob/sg/port-deploy-task/packages/core/src/tasks/index.ts#L1016-L1032
    function ffiCommitToIPFS(bytes32 _deploymentId) private {}

    // TODO(ryan): only necessary for the propose task. it should call this stuff:
    // https://github.com/chugsplash/chugsplash/blob/sg/port-deploy-task/packages/core/src/tasks/index.ts#L1036-L1086
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
        cmds[11] = newOwnerString;
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

    function refresh() public returns (uint) {
        uint forkId = vm.createFork(rpcUrl);
        vm.selectFork(forkId);
        return forkId;
    }

    function inefficientSlice(BundledChugSplashAction[] memory selected, uint start, uint end) public pure returns (BundledChugSplashAction[] memory sliced) {
        for (uint i = start; i < end; i++) {
            sliced[i] = selected[i + 1];
        }
    }

    /**
     * @notice Splits up a bundled action into its components
     */
    function disassembleActions(BundledChugSplashAction[] memory actions) public pure returns (RawChugSplashAction[] memory, uint256[] memory, bytes32[][] memory) {
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
        ChugSplashManager manager,
        uint maxGasLimit
    ) public view returns (bool) {
        (RawChugSplashAction[] memory actions, uint256[] memory _actionIndexes, bytes32[][] memory _proofs) = disassembleActions(selected);
        (bool success, ) = address(manager).staticcall{ gas: maxGasLimit }(abi.encodeCall(ChugSplashManager.executeActions, (actions, _actionIndexes, _proofs)));
        return success;
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
    ) public view returns (uint) {
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
    ) public returns (DeploymentStatus) {
        // Pull the deployment state from the contract to make sure we're up to date
        bytes32 activeDeploymentId = manager.activeDeploymentId();
        DeploymentState memory state = manager.deployments(activeDeploymentId);

        // Filter out actions that have already been executed
        uint length = 0;
        BundledChugSplashAction[] memory filteredActions = new BundledChugSplashAction[](length);
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            if (state.actions[action.proof.actionIndex] == false) {
                length += 1;
            }
        }
        for (uint i = 0; i < actions.length; i++) {
            BundledChugSplashAction memory action = actions[i];
            if (state.actions[action.proof.actionIndex] == false) {
                filteredActions[i] = action;
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
    ) internal returns (bool) {
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
        for (uint i = 0; i < bundles.actionBundle.actions.length; i++) {
            BundledChugSplashAction memory action = bundles.actionBundle.actions[i];
            if (action.action.actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                deployContractActions[i] = action;
            } else {
                setStorageActions[i] = action;
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

    function getNumActions(BundledChugSplashAction[] memory _actions) internal pure returns (uint256, uint256)  {
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

    function toBytes32(address _addr) private pure returns (bytes32) {
        return bytes32(uint256(uint160(_addr)));
    }
}
