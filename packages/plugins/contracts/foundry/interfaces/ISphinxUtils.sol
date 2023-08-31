// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import { VmSafe } from "forge-std/Vm.sol";
import { ISphinxRegistry } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxRegistry.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import {
    Version
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import {
    SphinxActionBundle,
    BundledSphinxAction,
    RawSphinxAction,
    SphinxTargetBundle,
    ConfigCache,
    DeployContractCost,
    OptionalString,
    BundleInfo,
    FoundryConfig,
    OptionalBytes32
} from "../SphinxPluginTypes.sol";

interface ISphinxUtils {
    struct OptionalLog {
        VmSafe.Log value;
        bool exists;
    }

    /***************************** PURE FUNCTIONS ******************************/

    function bundledActions() external pure returns (BundledSphinxAction[] memory);
    function configCache() external pure returns (ConfigCache memory);
    function deployContractCosts() external pure returns (DeployContractCost[] memory);
    function disassembleActions(
        BundledSphinxAction[] memory actions
    ) external pure returns (RawSphinxAction[] memory, bytes32[][] memory);
    function equals(string memory _str1, string memory _str2) external pure returns (bool);
    function executable(
        BundledSphinxAction[] memory selected,
        uint256 maxGasLimit,
        DeployContractCost[] memory costs
    ) external pure returns (bool);
    function splitActions(
        BundledSphinxAction[] memory _actions
    ) external pure returns (BundledSphinxAction[] memory, BundledSphinxAction[] memory);
    function findMaxBatchSize(
        BundledSphinxAction[] memory actions,
        uint256 maxGasLimit,
        DeployContractCost[] memory costs
    ) external pure returns (uint256);
    function getSphinxRegistry() external pure returns (ISphinxRegistry);
    function getCurrentSphinxManagerVersion() external pure returns (Version memory);
    function getDeploymentId(
        SphinxActionBundle memory _actionBundle,
        SphinxTargetBundle memory _targetBundle,
        string memory _configUri
    ) external pure returns (bytes32);
    function getNumActions(
        BundledSphinxAction[] memory _actions
    ) external pure returns (uint256, uint256);
    function inefficientSlice(
        BundledSphinxAction[] memory selected,
        uint256 start,
        uint256 end
    ) external pure returns (BundledSphinxAction[] memory sliced);
    function minimalConfig() external pure returns (FoundryConfig memory);
    function removeExecutedActions(
        BundledSphinxAction[] memory _actions,
        uint256 _actionsExecuted
    ) external pure returns (BundledSphinxAction[] memory);
    function slice(
        bytes calldata _data,
        uint256 _start,
        uint256 _end
    ) external pure returns (bytes memory);
    function targetBundle() external pure returns (SphinxTargetBundle memory);
    function toBytes32(address _addr) external pure returns (bytes32);

    /***************************** VIEW FUNCTIONS ******************************/

    function msgSender() external view returns (address);
    function removeSelector(bytes memory _data) external view returns (bytes memory);
    function decodeBundleInfo(bytes memory _data) external view returns (BundleInfo memory);
    function getEIP1967ProxyAdminAddress(address _proxyAddress) external view returns (address);
    function getCodeSize(address _addr) external view returns (uint256);

    /***************************** STATE-CHANGING FUNCTIONS *****************************/

    function initialize(
        string memory _rpcUrl,
        bool _isRecurrentBroadcast,
        string memory _mainFfiScriptPath,
        address _systemOwner
    ) external;
    function getConfigCache(
        FoundryConfig memory _minimalConfig,
        ISphinxRegistry _registry,
        ISphinxManager _manager,
        string memory _rpcUrl,
        string memory _mainFfiScriptPath
    ) external returns (ConfigCache memory);
    function ffiGetEncodedBundleInfo(
        ConfigCache memory _configCache,
        string memory _parsedConfigStr,
        string memory _rootFfiPath,
        address _owner
    ) external returns (bytes memory);
}
