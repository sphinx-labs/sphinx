// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { VmSafe } from "forge-std/Vm.sol";
import {
    IChugSplashRegistry
} from "@chugsplash/contracts/contracts/interfaces/IChugSplashRegistry.sol";
import {
    IChugSplashManager
} from "@chugsplash/contracts/contracts/interfaces/IChugSplashManager.sol";
import {
    Version,
    ChugSplashActionBundle,
    BundledChugSplashAction,
    RawChugSplashAction,
    ChugSplashTargetBundle
} from "@chugsplash/contracts/contracts/ChugSplashDataTypes.sol";
import {
    ConfigCache,
    DeployContractCost,
    OptionalString,
    BundleInfo,
    MinimalConfig,
    OptionalBytes32
} from "../ChugSplashPluginTypes.sol";

interface IChugSplashUtils {
    struct OptionalLog {
        VmSafe.Log value;
        bool exists;
    }

    function actionBundle() external pure returns (ChugSplashActionBundle memory);

    function configCache() external pure returns (ConfigCache memory);

    function create2Deploy(bytes memory _creationCode) external returns (address);

    function deployContractCosts() external pure returns (DeployContractCost[] memory);

    function disassembleActions(
        BundledChugSplashAction[] memory actions
    ) external pure returns (RawChugSplashAction[] memory, uint256[] memory, bytes32[][] memory);

    function ensureChugSplashInitialized(string memory _rpcUrl, address _systemOwner) external;

    function equals(string memory _str1, string memory _str2) external pure returns (bool);

    function executable(
        BundledChugSplashAction[] memory selected,
        uint256 maxGasLimit,
        DeployContractCost[] memory costs
    ) external pure returns (bool);

    function ffiDeployOnAnvil(string memory _rpcUrl, string memory _mainFfiScriptPath) external;

    function ffiGetPreviousConfigUri(
        address _proxyAddress,
        string memory _rpcUrl,
        string memory _mainFfiScriptPath
    ) external returns (OptionalString memory);

    function ffiGetEncodedBundleInfo(
        ConfigCache memory _configCache,
        string memory _projectName,
        string memory _userConfigStr,
        string memory _rootFfiPath,
        address _owner
    ) external returns (bytes memory);

    function decodeBundleInfo(bytes memory _data) external view returns (BundleInfo memory);

    function getActionsByType(
        ChugSplashActionBundle memory _actionBundle
    ) external pure returns (BundledChugSplashAction[] memory, BundledChugSplashAction[] memory);

    function findCost(
        string memory referenceName,
        DeployContractCost[] memory costs
    ) external pure returns (uint256);

    function findMaxBatchSize(
        BundledChugSplashAction[] memory actions,
        uint256 maxGasLimit,
        DeployContractCost[] memory costs
    ) external pure returns (uint256);

    function getChainAlias(string memory _rpcUrl) external view returns (string memory);

    function getChugSplashRegistry() external pure returns (IChugSplashRegistry);

    function getConfigCache(
        MinimalConfig memory _minimalConfig,
        IChugSplashRegistry _registry,
        IChugSplashManager _manager,
        string memory _rpcUrl,
        string memory _mainFfiScriptPath,
        VmSafe.Log[] memory _executionLogs
    ) external returns (ConfigCache memory);

    function getCurrentChugSplashManagerVersion() external pure returns (Version memory);

    function getDeployedCreationCodeWithArgsHash(
        IChugSplashManager _manager,
        string memory _referenceName,
        address _contractAddress,
        VmSafe.Log[] memory _executionLogs
    ) external pure returns (OptionalBytes32 memory);

    function getDeploymentId(
        ChugSplashActionBundle memory _actionBundle,
        ChugSplashTargetBundle memory _targetBundle,
        string memory _configUri,
        string memory _projectName
    ) external pure returns (bytes32);

    function getEIP1967ProxyAdminAddress(address _proxyAddress) external view returns (address);

    function getLatestEvent(
        VmSafe.Log[] memory _executionLogs,
        address _emitter,
        bytes32 _topic1,
        OptionalBytes32 memory _topic2,
        OptionalBytes32 memory _topic3,
        OptionalBytes32 memory _topic4
    ) external pure returns (OptionalLog memory);

    function getNumActions(
        BundledChugSplashAction[] memory _actions
    ) external pure returns (uint256, uint256);

    function getPreviousConfigUri(
        IChugSplashRegistry _registry,
        address _proxyAddress,
        bool _localNetwork,
        string memory _rpcUrl,
        string memory _mainFfiScriptPath,
        VmSafe.Log[] memory _executionLogs
    ) external returns (OptionalString memory);

    function inefficientSlice(
        BundledChugSplashAction[] memory selected,
        uint256 start,
        uint256 end
    ) external pure returns (BundledChugSplashAction[] memory sliced);

    function initialize(
        string memory _rpcUrl,
        bool _isRecurrentBroadcast,
        string memory _mainFfiScriptPath,
        address _systemOwner
    ) external;

    function isLocalNetwork(string memory _rpcUrl) external pure returns (bool);

    function isProjectRegistered(
        IChugSplashRegistry _registry,
        address _manager
    ) external view returns (bool);

    function minimalConfig() external pure returns (MinimalConfig memory);

    function msgSender() external view returns (address);

    function removeSelector(bytes memory _data) external view returns (bytes memory);

    function slice(
        bytes memory _data,
        uint256 _start,
        uint256 _end
    ) external pure returns (bytes memory);

    function targetBundle() external pure returns (ChugSplashTargetBundle memory);

    function toBytes32(address _addr) external pure returns (bytes32);

    function getCodeSize(address _addr) external view returns (uint256);
}
