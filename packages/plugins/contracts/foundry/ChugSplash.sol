// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "forge-std/Script.sol";
import "forge-std/Test.sol";
import { StdChains } from "forge-std/StdChains.sol";
import { strings } from "./lib/strings.sol";
import { ChugSplashRegistry } from "@chugsplash/contracts/contracts/ChugSplashRegistry.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
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
    MinimalConfig,
    MinimalContractConfig,
    ConfigCache,
    DeployContractCost,
    ContractConfigCache,
    DeploymentRevert,
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
import { StdStyle } from "forge-std/StdStyle.sol";
import { ChugSplashContractInfo, ChugSplashConstants } from "./ChugSplashConstants.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";

contract ChugSplash is Script, Test, DefaultCreate3, ChugSplashManagerEvents, ChugSplashRegistryEvents, ChugSplashConstants {
    using strings for *;
    using stdStorage for StdStorage;

    // Source: https://github.com/Arachnid/deterministic-deployment-proxy
    address constant DETERMINISTIC_DEPLOYMENT_PROXY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    struct OptionalLog {
        Vm.Log value;
        bool exists;
    }

    Vm.Log[] private executionLogs;
    bool private silent = false;

    // Maps a ChugSplash config path to a deployed contract's reference name to the deployed
    // contract's address.
    mapping(string => mapping(string => mapping (bytes32 => address))) private deployed;

    ChugSplashUtils private immutable utils;

    // Get owner address
    uint private key = vm.envOr("CHUGSPLASH_INTERNAL__OWNER_PRIVATE_KEY", uint(0));
    address private systemOwnerAddress =
        key != 0 ? vm.rememberKey(key) : 0x226F14C3e19788934Ff37C653Cf5e24caD198341;

    string private rootFfiPath = vm.envOr(
            "DEV_FILE_PATH",
            string("./node_modules/@chugsplash/plugins/dist/foundry/")
        );
    string private mainFfiScriptPath = string.concat(rootFfiPath, "index.js");

    bool private isChugSplashTest = vm.envOr("IS_CHUGSPLASH_TEST", false);

    /**
     * @notice This constructor must not revert, or else an opaque error message will be displayed
       to the user.
     */
    constructor() {
        utils = new ChugSplashUtils();
        ffiDeployOnAnvil();
    }

    function silence() internal {
        silent = true;
    }

    function cancel(string memory _configPath, string memory _rpcUrl) internal {
        ensureChugSplashInitialized(_rpcUrl);
        (MinimalConfig memory minimalConfig, ) = ffiGetMinimalConfig(_configPath);

        ChugSplashRegistry registry = getChugSplashRegistry();
        ChugSplashManager manager = getChugSplashManager(
            registry,
            minimalConfig.organizationID
        );

        manager.cancelActiveChugSplashDeployment();
    }

    // TODO: Test once we are officially supporting upgradable contracts
    function exportProxy(string memory _configPath, string memory _referenceName, address _newOwner, string memory _rpcUrl) internal {
        ensureChugSplashInitialized(_rpcUrl);
        (MinimalConfig memory minimalConfig, ) = ffiGetMinimalConfig(_configPath);

        ChugSplashRegistry registry = getChugSplashRegistry();
        ChugSplashManager manager = ChugSplashManager(
            registry.projects(minimalConfig.organizationID)
        );

        require(address(manager) != address(0), "ChugSplash: No project found for organization ID");

        MinimalContractConfig memory targetContractConfig;

        for (uint256 i = 0; i < minimalConfig.contracts.length; i++) {
            if (keccak256(abi.encodePacked(minimalConfig.contracts[i].referenceName)) == keccak256(abi.encodePacked(_referenceName))) {
                targetContractConfig = minimalConfig.contracts[i];
                break;
            }
        }

        bytes32 contractKindHash;
        if (targetContractConfig.kind == ContractKindEnum.INTERNAL_DEFAULT) {
            contractKindHash = DEFAULT_PROXY_TYPE_HASH;
        } else if (targetContractConfig.kind == ContractKindEnum.OZ_TRANSPARENT) {
            contractKindHash = OZ_TRANSPARENT_PROXY_TYPE_HASH;
        } else if (targetContractConfig.kind == ContractKindEnum.OZ_OWNABLE_UUPS) {
            contractKindHash = OZ_UUPS_OWNABLE_PROXY_TYPE_HASH;
        } else if (targetContractConfig.kind == ContractKindEnum.OZ_ACCESS_CONTROL_UUPS) {
            contractKindHash = OZ_UUPS_ACCESS_CONTROL_PROXY_TYPE_HASH;
        } else if (targetContractConfig.kind == ContractKindEnum.EXTERNAL_DEFAULT) {
            contractKindHash = EXTERNAL_DEFAULT_PROXY_TYPE_HASH;
        } else if (targetContractConfig.kind == ContractKindEnum.NO_PROXY) {
            revert("Cannot export a proxy for a contract that does not use a proxy.");
        } else {
            revert("Unknown contract kind.");
        }

        manager.exportProxy(payable(targetContractConfig.addr), contractKindHash, _newOwner);
    }

    // TODO: Test once we are officially supporting upgradable contracts
    function importProxy(string memory _configPath, address _proxy, string memory _rpcUrl) internal {
        ensureChugSplashInitialized(_rpcUrl);
        (MinimalConfig memory minimalConfig, ) = ffiGetMinimalConfig(_configPath);

        ChugSplashRegistry registry = getChugSplashRegistry();
        ChugSplashManager manager = ChugSplashManager(
            registry.projects(minimalConfig.organizationID)
        );

        require(address(manager) != address(0), "ChugSplash: No project found for organization ID");

        // check bytecode compatible with either UUPS or Transparent
        require(ffiCheckProxyBytecodeCompatible(_proxy.code), "ChugSplash does not support your proxy type. Currently ChugSplash only supports UUPS and Transparent proxies that implement EIP-1967 which yours does not appear to do. If you believe this is a mistake, please reach out to the developers or open an issue on GitHub.");

        // check if we can fetch the owner address from the expected slot
        // and that the caller is in fact the owner
        address ownerAddress = getEIP1967ProxyAdminAddress(_proxy);
        emit log_address(ownerAddress);

        address deployer = utils.msgSender();
        require(ownerAddress == deployer, "ChugSplash: You are not the owner of this proxy.");

        // transfer ownership of the proxy
        Proxy proxy = Proxy(payable(_proxy));
        proxy.changeAdmin(address(manager));
    }

    // TODO: Test once we are officially supporting upgradable contracts
    // We may need to do something more complex here to handle ensuring the proxy is fully
    // compatible with the users selected type.
    function ffiCheckProxyBytecodeCompatible(bytes memory bytecode) private returns (bool) {
        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = mainFfiScriptPath;
        cmds[3] = "checkProxyBytecodeCompatible";
        cmds[4] = vm.toString(bytecode);

        bytes memory result = vm.ffi(cmds);
        return keccak256(result) == keccak256("true");
    }

    function propose(
        string memory _configPath,
        string memory _rpcUrl
    ) internal {
        ensureChugSplashInitialized(_rpcUrl);
        string[] memory cmds = new string[](8);
        cmds[0] = "npx";
        // We use ts-node here to support TypeScript ChugSplash config files.
        cmds[1] = "ts-node";
        // Using SWC speeds up the process of transpiling TypeScript into JavaScript
        cmds[2] = "--swc";
        cmds[3] = mainFfiScriptPath;
        cmds[4] = "propose";
        cmds[5] = _configPath;
        cmds[6] = _rpcUrl;
        cmds[7] = vm.envString("PRIVATE_KEY");

        bytes memory result = vm.ffi(cmds);

        // The success boolean is the last 32 bytes of the result.
        bytes memory successBytes = utils.slice(result, result.length - 32, result.length);
        (bool success) = abi.decode(successBytes, (bool));

        bytes memory data = utils.slice(result, 0, result.length - 32);

        if (success) {
            (string memory projectName, string memory warnings) = abi.decode(
                data,
                (string, string)
            );

            if (bytes(warnings).length > 0) {
                emit log(StdStyle.yellow(warnings));
            }

            if (!silent) {
                emit log(StdStyle.green(string.concat("Successfully proposed ", projectName, ".")));
            }
        } else {
            (string memory errors, string memory warnings) = abi.decode(
                data,
                (string, string)
            );
            if (bytes(warnings).length > 0) {
                emit log(StdStyle.yellow(warnings));
            }
            revert(errors);
        }
    }

    // This is the entry point for the ChugSplash deploy command.
    function deploy(string memory _configPath, string memory _rpcUrl) internal {
        OptionalAddress memory newOwner;
        newOwner.exists = false;
        deploy(_configPath, _rpcUrl, newOwner);
    }

    function deploy(string memory _configPath, string memory _rpcUrl, OptionalAddress memory _newOwner) private {
        ensureChugSplashInitialized(_rpcUrl);
        (MinimalConfig memory minimalConfig, string memory userConfigStr) = ffiGetMinimalConfig(_configPath);

        ChugSplashRegistry registry = getChugSplashRegistry();
        ChugSplashManager manager = getChugSplashManager(
            registry,
            minimalConfig.organizationID
        );

        ConfigCache memory configCache = getConfigCache(minimalConfig, registry, manager, _rpcUrl);

        // Unlike the TypeScript version, we don't get the CanonicalConfig since Solidity doesn't
        // support complex types like the 'variables' field.
        (string memory configUri,DeployContractCost[] memory deployContractCosts, ChugSplashBundles memory bundles) = ffiGetBundleInfo(configCache, userConfigStr);

        address deployer = utils.msgSender();
        finalizeRegistration(
            registry,
            manager,
            minimalConfig.organizationID,
            deployer,
            false
        );

        address realManagerAddress = registry.projects(minimalConfig.organizationID);
        require(realManagerAddress == address(manager), "Computed manager address is different from expected address");

        if (bundles.actionBundle.actions.length == 0 && bundles.targetBundle.targets.length == 0) {
            emit log("Nothing to execute in this deployment. Exiting early.");
            return;
        }

        bytes32 deploymentId = getDeploymentId(bundles, configUri);
        DeploymentState memory deploymentState = manager.deployments(deploymentId);

        if (deploymentState.status == DeploymentStatus.CANCELLED) {
            revert(
                string.concat(
                    minimalConfig.projectName,
                    " was previously cancelled on ",
                    configCache.networkName
                )
            );
        }

        if (deploymentState.status == DeploymentStatus.EMPTY) {
            if (!manager.isProposer(deployer)) {
                revert(
                    string.concat(
                        "ChugSplash: caller is not a proposer. Caller's address: ",
                        vm.toString(deployer)
                    )
                );
            }

            (uint256 numNonProxyContracts, ) = getNumActions(bundles.actionBundle.actions);
            manager.propose{gas: 1000000}(
                bundles.actionBundle.root,
                bundles.targetBundle.root,
                bundles.actionBundle.actions.length,
                bundles.targetBundle.targets.length,
                numNonProxyContracts,
                configUri,
                false
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
            bool success = executeDeployment(manager, bundles, configCache.blockGasLimit, deployContractCosts);

            if (!success) {
                revert(
                    string.concat(
                        "ChugSplash: failed to execute ",
                        minimalConfig.projectName,
                        "likely because one of the user's constructors reverted during the deployment."
                    )
                );
            }
        }

        if (_newOwner.exists) {
            transferProjectOwnership(manager, _newOwner.value);
        }

        updateDeploymentMapping(_configPath, minimalConfig.contracts);

        if (!silent) {
            emit log("Success!");
            for (uint i = 0; i < minimalConfig.contracts.length; i++) {
                MinimalContractConfig memory contractConfig = minimalConfig.contracts[i];
                emit log(string.concat(contractConfig.referenceName, ': ', vm.toString(contractConfig.addr)));
            }
        }
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

            Version memory managerVersion = getCurrentChugSplashManagerVersion();
            _registry.finalizeRegistration{gas: 1000000}(
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
            }
        }
    }

    function isProjectClaimed(
        ChugSplashRegistry _registry,
        address _manager
    ) private view returns (bool) {
        return _registry.managerProxies(_manager);
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
        _manager.approve{gas: 1000000}(_deploymentId);
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
        MinimalConfig memory _minimalConfig,
        ChugSplashRegistry _registry,
        ChugSplashManager _manager,
        string memory _rpcUrl
    ) private returns (ConfigCache memory) {
        MinimalContractConfig[] memory contractConfigs = _minimalConfig
            .contracts;

        bool localNetwork = isLocalNetwork(_rpcUrl);
        string memory networkName = getChainAlias(_rpcUrl);

        ContractConfigCache[] memory contractConfigCache = new ContractConfigCache[](
            contractConfigs.length
        );
        for (uint256 i = 0; i < contractConfigCache.length; i++) {
            MinimalContractConfig memory contractConfig = contractConfigs[
                i
            ];

            bool isTargetDeployed = contractConfig.addr.code.length > 0;

            OptionalString memory previousConfigUri = isTargetDeployed &&
                contractConfig.kind != ContractKindEnum.NO_PROXY
                ?
                    getPreviousConfigUri(
                        _registry,
                        contractConfig.addr,
                        localNetwork,
                        _rpcUrl
                    )
                : OptionalString({ exists: false, value: "" });

            OptionalBytes32 memory deployedCreationCodeWithArgsHash = isTargetDeployed ?
            getDeployedCreationCodeWithArgsHash(_manager, contractConfig.referenceName, contractConfig.addr)
             : OptionalBytes32({ exists: false, value: "" });

            // At this point in the TypeScript version of this function, we attempt to deploy all of
            // the non-proxy contracts. We skip this step here because it's unnecessary in this
            // context. Forge does local simulation before broadcasting any transactions, so if a
            // constructor reverts, it'll be caught before anything happens on the live network.
            DeploymentRevert memory deploymentRevert = DeploymentRevert({
                deploymentReverted: false,
                revertString: OptionalString({exists: false, value: ""})
            });

            ImportCache memory importCache;
            if (isTargetDeployed) {
                // In the TypeScript version, we check if the ChugSplashManager has permission to
                // upgrade UUPS proxies via staticcall. We skip it here because staticcall always
                // fails in Solidity when called on a state-changing function (which 'upgradeTo'
                // is). We also can't attempt an external call because it could be broadcasted.
                // So, we skip this step here, which is fine because Forge automatically does local
                // simulation before broadcasting any transactions. If the ChugSplashManager doesn't
                // have permission to call 'upgradeTo', an error will be thrown when simulating the
                // execution logic, which will happen before any transactions are broadcasted.

                if (contractConfig.kind == ContractKindEnum.EXTERNAL_DEFAULT || contractConfig.kind == ContractKindEnum.INTERNAL_DEFAULT || contractConfig.kind == ContractKindEnum.OZ_TRANSPARENT) {
                    // Check that the ChugSplashManager is the owner of the Transparent proxy.
                    address currProxyAdmin = getEIP1967ProxyAdminAddress(
                        contractConfig.addr
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
        bool _localNetwork,
        string memory _rpcUrl
    ) private returns (OptionalString memory) {
        if (!_localNetwork) {
            // We rely on FFI for non-Anvil networks because the previous config URI
            // could correspond to a deployment that happened before this script was
            // called.
            return ffiGetPreviousConfigUri(_proxyAddress, _rpcUrl);
        } else {
            // We can't rely on FFI for the in-process Anvil node because there is no accessible
            // provider to use in TypeScript. So, we use the logs collected in this contract to get
            // the previous config URI.
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

            // The ChugSplashManager's address is stored as a topic in the ProxyUpgraded event.
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

    function updateDeploymentMapping(string memory _configPath, MinimalContractConfig[] memory _contractConfigs) private {
        for (uint i = 0; i < _contractConfigs.length; i++) {
            MinimalContractConfig memory contractConfig = _contractConfigs[i];
            deployed[_configPath][contractConfig.referenceName][contractConfig.userSaltHash] = contractConfig.addr;
        }
    }

    /**
     * @notice This function retrieves the most recent event emitted by the given emitter that
     *         matches the topics. It relies on the logs collected in this contract via
     *         `vm.getRecordedLogs`. It can only be used on Anvil networks. It operates in the same
     *         manner as Ethers.js' `queryFilter` function, except it retrieves only the most recent
     *         event that matches the topics instead of a list of all the events that match.
     *
     * @param _emitter The address of the contract that emitted the event.
     * @param _topic1  The first topic of the event. This is the event selector unless the event is
     *                 anonymous.
     * @param _topic2  The second topic of the event. If omitted, it won't be used to filter the
     *                 events.
     * @param _topic3  The third topic of the event. If omitted, it won't be used to filter the
     *                 events.
     * @param _topic4  The fourth topic of the event. If omitted, it won't be used to filter the
     *                 events.
     */
    function getLatestEvent(
        address _emitter,
        bytes32 _topic1,
        OptionalBytes32 memory _topic2,
        OptionalBytes32 memory _topic3,
        OptionalBytes32 memory _topic4
    ) private view returns (OptionalLog memory) {
        // We iterate over the events in descending order because the most recent event is at the
        // end of the array.
        for (uint256 i = executionLogs.length - 1; i >= 0; i--) {
            Vm.Log memory log = executionLogs[i];
            uint256 numTopics = log.topics.length;
            if (
                log.emitter == _emitter &&
                (numTopics > 0 && _topic1 == log.topics[0]) &&
                (!_topic2.exists || (numTopics > 1 && _topic2.value == log.topics[1])) &&
                (!_topic3.exists || (numTopics > 2 && _topic3.value == log.topics[2])) &&
                (!_topic4.exists || (numTopics > 3 && _topic4.value == log.topics[3]))
            ) {
                return OptionalLog({ exists: true, value: log });
            }
        }
        // Return an empty log if no event was found.
        Vm.Log memory emptyLog;
        return OptionalLog({ exists: false, value: emptyLog });
    }

    function getCurrentChugSplashManagerVersion() private pure returns (Version memory) {
        return Version({ major: major, minor: minor, patch: patch });
    }

    // This function also returns the user config string as a performance optimization. Reading
    // TypeScript user configs with ts-node is slow, so we read it once here and pass it in
    // to future FFI call(s).
    function ffiGetMinimalConfig(
        string memory _configPath
    ) private returns (MinimalConfig memory, string memory) {
        string memory ffiScriptPath = string.concat(rootFfiPath, "get-minimal-config.js");

        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        // We use ts-node here to support TypeScript ChugSplash config files.
        cmds[1] = "ts-node";
         // Using SWC speeds up the process of transpiling TypeScript into JavaScript
        cmds[2] = "--swc";
        cmds[3] = ffiScriptPath;
        cmds[4] = _configPath;

        bytes memory result = vm.ffi(cmds);
        (MinimalConfig memory minimalConfig, string memory userConfigStr) = abi.decode(
            result,
            (MinimalConfig, string)
        );
        return (minimalConfig, userConfigStr);
    }

    /**
     * @notice Retrieves the bundle info via FFI. This function uses `abi.decode` to retrieve any
       errors or warnings that occurred during parsing. We do this instead of letting FFI throw an
       error message because this makes parsing errors much easier to read. This also allows us to
       display parsing warnings, which can't be written to stdout because stdout must be exclusively
       for the bundle info. We also can't write the warnings to stderr because a non-empty stderr
       causes an error to be thrown by Forge.
     */
    function ffiGetBundleInfo(ConfigCache memory _configCache, string memory _userConfigStr)
        private
        returns (string memory, DeployContractCost[] memory, ChugSplashBundles memory)
    {
        string[] memory cmds = new string[](5);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = string.concat(rootFfiPath, "get-bundle-info.js");
        cmds[3] = vm.toString(abi.encode(_configCache));
        cmds[4] = _userConfigStr;

        bytes memory result = vm.ffi(cmds);

        // The success boolean is the last 32 bytes of the result.
        bytes memory successBytes = utils.slice(result, result.length - 32, result.length);
        (bool success) = abi.decode(successBytes, (bool));

        bytes memory data = utils.slice(result, 0, result.length - 32);

        if (success) {
            // Next, we decode the result into the bundle info, which consists of the
            // ChugSplashBundles, the config URI, the cost of deploying each contract, and any
            // warnings that occurred when parsing the config. We can't decode all of this in a
            // single `abi.decode` call because this fails with a "Stack too deep" error. This is
            // because the ChugSplashBundles struct is too large for Solidity to decode all at once.
            // So, we decode the ChugSplashActionBundle and ChugSplashTargetBundle separately. This
            // requires that we know where to split the raw bytes before decoding anything. To solve
            // this, we use two `splitIdx` variables. The first marks the point where the action
            // bundle ends and the target bundle begins. The second marks the point where the target
            // bundle ends and the rest of the bundle info (config URI, warnings, etc) begins.
            (uint256 splitIdx1, uint256 splitIdx2) = abi.decode(utils.slice(data, data.length - 64, data.length), (uint256, uint256));

            (ChugSplashActionBundle memory actionBundle) = abi.decode(utils.slice(data, 0, splitIdx1), (ChugSplashActionBundle));
            (ChugSplashTargetBundle memory targetBundle) = abi.decode(utils.slice(data, splitIdx1, splitIdx2), (ChugSplashTargetBundle));

            bytes memory remainingBundleInfo = utils.slice(data, splitIdx2, data.length);
            (string memory configUri, DeployContractCost[] memory deployContractCosts, string memory warnings) = abi.decode(
                remainingBundleInfo,
                (string, DeployContractCost[], string)
            );

            if (bytes(warnings).length > 0) {
                emit log(StdStyle.yellow(warnings));
            }
            return (configUri, deployContractCosts, ChugSplashBundles({ actionBundle: actionBundle, targetBundle: targetBundle }));
        } else {
            (string memory errors, string memory warnings) = abi.decode(
                data,
                (string, string)
            );
            if (bytes(warnings).length > 0) {
                emit log(StdStyle.yellow(warnings));
            }
            revert(errors);
        }
    }

    function ffiGetPreviousConfigUri(address _proxyAddress, string memory _rpcUrl) private returns (OptionalString memory) {
        string[] memory cmds = new string[](6);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = mainFfiScriptPath;
        cmds[3] = "getPreviousConfigUri";
        cmds[4] = _rpcUrl;
        cmds[5] = vm.toString(_proxyAddress);

        bytes memory result = vm.ffi(cmds);

        (bool exists, string memory configUri) = abi.decode(result, (bool, string));

        return OptionalString({ exists: exists, value: configUri });
    }

    function ffiDeployOnAnvil() private {
        string[] memory cmds = new string[](6);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = mainFfiScriptPath;
        cmds[3] = "deployOnAnvil";

        vm.ffi(cmds);
    }

    function generateArtifacts(
        string memory _configPath,
        string memory _rpcUrl
    ) internal {
        string memory networkName = getChainAlias(_rpcUrl);

        string[] memory cmds = new string[](10);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = mainFfiScriptPath;
        cmds[3] = "generateArtifacts";
        cmds[4] = _configPath;
        cmds[5] = networkName;
        cmds[6] = _rpcUrl;

        vm.ffi(cmds);

        emit log(string.concat("Wrote deployment artifacts to ./deployments/", networkName));
    }

    /**
     * @notice Returns true if the current network is either the in-process or standalone Anvil
     * node. Returns false if the current network is a forked or live network.
     */
    function isLocalNetwork(string memory _rpcUrl) private pure returns (bool) {
        strings.slice memory sliceUrl = _rpcUrl.toSlice();
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

    function ensureChugSplashInitialized(string memory _rpcUrl) internal {
        ChugSplashRegistry registry = getChugSplashRegistry();
        if (address(registry).code.length > 0) {
            return;
        } else if (isLocalNetwork(_rpcUrl)) {
            vm.etch(
                DETERMINISTIC_DEPLOYMENT_PROXY,
                hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
            );

            ChugSplashContractInfo[] memory contracts = getChugSplashContractInfo();
            for (uint i = 0; i < contracts.length; i++) {
                ChugSplashContractInfo memory ct = contracts[i];
                address addr = create2Deploy(ct.creationCode);
                require(addr == ct.expectedAddress, string.concat("address mismatch. expected address: ", vm.toString(ct.expectedAddress)));
            }

            // Impersonate system owner
            vm.startPrank(systemOwnerAddress);

            // Add initial manager version
            registry.addVersion(managerImplementationAddress);

            // Add transparent proxy type
            registry.addContractKind(
                keccak256("oz-transparent"),
                ozTransparentAdapterAddr
            );

            // Add uups ownable proxy type
            registry.addContractKind(
                keccak256("oz-ownable-uups"),
                ozUUPSOwnableAdapterAddr
            );

            // Add uups access control proxy type
            registry.addContractKind(
                keccak256("oz-access-control-uups"),
                ozUUPSAccessControlAdapterAddr
            );

            // Add default proxy type
            registry.addContractKind(bytes32(0), defaultAdapterAddr);

            vm.stopPrank();
        } else {
            // We're on a forked or live network that doesn't have ChugSplash deployed, which
            // means we don't support ChugSplash on this network yet.
            revert(
                "ChugSplash is not available on this network. If you are working on a local network, please report this error to the developers. If you are working on a live network, then it may not be officially supported yet. Feel free to drop a messaging in the Discord and we'll see what we can do!"
            );
        }
    }

    function getAddress(
        string memory _configPath,
        string memory _referenceName
    ) internal view returns (address) {
        return getAddress(_configPath, _referenceName, bytes32(0));
    }

    function getAddress(
        string memory _configPath,
        string memory _referenceName,
        bytes32 userSaltHash
    ) internal view returns (address) {
        address addr = deployed[_configPath][_referenceName][userSaltHash];

        require(addr.code.length > 0, string.concat(
            "Could not find contract: ",
            _referenceName,
            " in ", _configPath, ". ",
            "Did you misspell the contract's reference name or forget to deploy the config?"
        ));

        return addr;
    }

    function getChugSplashRegistry() internal pure returns (ChugSplashRegistry) {
        return ChugSplashRegistry(registryAddress);
    }

    function getChugSplashManager(
        ChugSplashRegistry _registry,
        bytes32 _organizationID
    ) private pure returns (ChugSplashManager) {
        address managerAddress = Create2.computeAddress(
            _organizationID,
            managerProxyInitCodeHash,
            address(_registry)
        );
        return ChugSplashManager(payable(managerAddress));
    }

    function inefficientSlice(BundledChugSplashAction[] memory selected, uint start, uint end) private pure returns (BundledChugSplashAction[] memory sliced) {
        sliced = new BundledChugSplashAction[](end - start);
        for (uint i = start; i < end; i++) {
            sliced[i - start] = selected[i];
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
        DeployContractCost[] memory deployContractCosts
    ) private pure returns (bool) {
        uint256 estGasUsed = 0;

        for (uint i = 0; i < selected.length; i++) {
            BundledChugSplashAction memory action = selected[i];

            ChugSplashActionType actionType = action.action.actionType;
            string memory referenceName = action.action.referenceName;
            if (actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
                uint256 deployContractCost = findCost(referenceName, deployContractCosts);

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

    function findCost(string memory referenceName, DeployContractCost[] memory deployContractCosts) private pure returns (uint256) {
        for (uint i = 0; i < deployContractCosts.length; i++) {
            DeployContractCost memory deployContractCost = deployContractCosts[i];
            if (equals(deployContractCost.referenceName, referenceName)) {
                return deployContractCost.cost;
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
        uint maxGasLimit,
        DeployContractCost[] memory deployContractCosts
    ) private pure returns (uint) {
        // Optimization, try to execute the entire batch at once before doing a binary search
        if (executable(actions, maxGasLimit, deployContractCosts)) {
            return actions.length;
        }

        // If the full batch isn't executavle, then do a binary search to find the largest executable batch size
        uint min = 0;
        uint max = actions.length;
        while (min < max) {
            uint mid = Math.ceilDiv((min + max), 2);
            BundledChugSplashAction[] memory left = inefficientSlice(actions, 0, mid);
            if (executable(left, maxGasLimit, deployContractCosts)) {
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
        uint maxGasLimit,
        DeployContractCost[] memory deployContractCosts
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
            uint batchSize = findMaxBatchSize(inefficientSlice(filteredActions, executed, filteredActions.length), maxGasLimit, deployContractCosts);
            BundledChugSplashAction[] memory batch = inefficientSlice(filteredActions, executed, executed + batchSize);
            (RawChugSplashAction[] memory rawActions, uint256[] memory _actionIndexes, bytes32[][] memory _proofs) = disassembleActions(batch);
            uint bufferedGasLimit = ((maxGasLimit) * 120) / 100;
            manager.executeActions{gas: bufferedGasLimit}(rawActions, _actionIndexes, _proofs);

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
        uint256 blockGasLimit,
        DeployContractCost[] memory deployContractCosts
    ) private returns (bool) {
        vm.recordLogs();

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
        DeploymentStatus status = executeBatchActions(deployContractActions, manager, blockGasLimit / 2, deployContractCosts);
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
        manager.initiateUpgrade{gas: 1000000}(targets, proofs);

        // Execute all the set storage actions
        executeBatchActions(setStorageActions, manager, blockGasLimit / 2, deployContractCosts);

        // Complete the upgrade
        manager.finalizeUpgrade{gas: 1000000}(targets, proofs);

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

    function getChainAlias(string memory _rpcUrl) private view returns (string memory) {
        Vm.Rpc[] memory urls = vm.rpcUrlStructs();
        for (uint i = 0; i < urls.length; i++) {
            Vm.Rpc memory rpc = urls[i];
            if (equals(rpc.url, _rpcUrl)) {
                return rpc.key;
            }
        }
        revert(string.concat("Could not find the chain alias for the RPC url: ", _rpcUrl, ". Did you forget to define it in your foundry.toml?"));
    }

    function create2Deploy(bytes memory _creationCode) private returns (address) {
        address addr = Create2.computeAddress(
            bytes32(0),
            keccak256(_creationCode),
            DETERMINISTIC_DEPLOYMENT_PROXY
        );

        if (addr.code.length == 0) {
            bytes memory code = bytes.concat(bytes32(0), _creationCode);
            (bool success, ) = DETERMINISTIC_DEPLOYMENT_PROXY.call(code);
            require(success, string.concat("failed to deploy contract. expected address: ", vm.toString(addr)));
        }

        return addr;
    }
}
