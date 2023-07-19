// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { VmSafe } from "forge-std/Vm.sol";
import { ISphinxRegistry } from "@sphinx/contracts/contracts/interfaces/ISphinxRegistry.sol";
import { ISphinxManager } from "@sphinx/contracts/contracts/interfaces/ISphinxManager.sol";
import {
    Version,
    SphinxActionBundle,
    BundledSphinxAction,
    RawSphinxAction,
    SphinxTargetBundle
} from "@sphinx/contracts/contracts/SphinxDataTypes.sol";
import {
    ConfigCache,
    DeployContractCost,
    OptionalString,
    BundleInfo,
    MinimalConfig,
    OptionalBytes32
} from "../SphinxPluginTypes.sol";

interface ISphinxUtils {
    struct OptionalLog {
        VmSafe.Log value;
        bool exists;
    }

    function actionBundle() external pure returns (SphinxActionBundle memory);

    function configCache() external pure returns (ConfigCache memory);

    function create2Deploy(bytes memory _creationCode) external returns (address);

    function deployContractCosts() external pure returns (DeployContractCost[] memory);

    function disassembleActions(
        BundledSphinxAction[] memory actions
    ) external pure returns (RawSphinxAction[] memory, uint256[] memory, bytes32[][] memory);

    function ensureSphinxInitialized(string memory _rpcUrl, address _systemOwner) external;

    function equals(string memory _str1, string memory _str2) external pure returns (bool);

    function executable(
        BundledSphinxAction[] memory selected,
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
        string memory _rpcUrl,
        ConfigCache memory _configCache,
        string memory _projectName,
        string memory _userConfigStr,
        string memory _rootFfiPath,
        address _owner
    ) external returns (bytes memory);

    function decodeBundleInfo(bytes memory _data) external view returns (BundleInfo memory);

    function getActionsByType(
        SphinxActionBundle memory _actionBundle
    ) external pure returns (BundledSphinxAction[] memory, BundledSphinxAction[] memory);

    function findCost(
        string memory referenceName,
        DeployContractCost[] memory costs
    ) external pure returns (uint256);

    function findMaxBatchSize(
        BundledSphinxAction[] memory actions,
        uint256 maxGasLimit,
        DeployContractCost[] memory costs
    ) external pure returns (uint256);

    function getChainAlias(string memory _rpcUrl) external view returns (string memory);

    function getSphinxRegistry() external pure returns (ISphinxRegistry);

    function getConfigCache(
        MinimalConfig memory _minimalConfig,
        ISphinxRegistry _registry,
        ISphinxManager _manager,
        string memory _rpcUrl,
        string memory _mainFfiScriptPath,
        VmSafe.Log[] memory _executionLogs
    ) external returns (ConfigCache memory);

    function getCurrentSphinxManagerVersion() external pure returns (Version memory);

    function getDeployedCreationCodeWithArgsHash(
        ISphinxManager _manager,
        string memory _referenceName,
        address _contractAddress,
        VmSafe.Log[] memory _executionLogs
    ) external pure returns (OptionalBytes32 memory);

    function getDeploymentId(
        SphinxActionBundle memory _actionBundle,
        SphinxTargetBundle memory _targetBundle,
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
        BundledSphinxAction[] memory _actions
    ) external pure returns (uint256, uint256);

    function getPreviousConfigUri(
        ISphinxRegistry _registry,
        address _proxyAddress,
        bool _localNetwork,
        string memory _rpcUrl,
        string memory _mainFfiScriptPath,
        VmSafe.Log[] memory _executionLogs
    ) external returns (OptionalString memory);

    function inefficientSlice(
        BundledSphinxAction[] memory selected,
        uint256 start,
        uint256 end
    ) external pure returns (BundledSphinxAction[] memory sliced);

    function initialize(
        string memory _rpcUrl,
        bool _isRecurrentBroadcast,
        string memory _mainFfiScriptPath,
        address _systemOwner
    ) external;

    function isLocalNetwork(string memory _rpcUrl) external pure returns (bool);

    function isProjectRegistered(
        ISphinxRegistry _registry,
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

    function targetBundle() external pure returns (SphinxTargetBundle memory);

    function toBytes32(address _addr) external pure returns (bytes32);

    function getCodeSize(address _addr) external view returns (uint256);
}
