// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import {
    SphinxTarget,
    RawSphinxAction
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";

struct SphinxBundles {
    SphinxActionBundle actionBundle;
    SphinxTargetBundle targetBundle;
}

struct SphinxActionBundle {
    bytes32 root;
    BundledSphinxAction[] actions;
}

struct SphinxTargetBundle {
    bytes32 root;
    BundledSphinxTarget[] targets;
}

struct BundledSphinxAction {
    RawSphinxAction action;
    bytes32[] siblings;
    uint256 gas;
}

struct BundledSphinxTarget {
    SphinxTarget target;
    bytes32[] siblings;
}

struct Configs {
    FoundryConfig minimalConfig;
    string userConfigStr;
}

struct BundleInfo {
    string configUri;
    DeployContractCost[] deployContractCosts;
    SphinxActionBundle actionBundle;
    SphinxTargetBundle targetBundle;
}

struct FoundryConfig {
    address manager;
    address owner;
    string projectName;
    FoundryContractConfig[] contracts;
}

struct DeployContractCost {
    string referenceName;
    uint256 cost;
}

struct FoundryContractConfig {
    string referenceName;
    address addr;
    ContractKindEnum kind;
    bytes32 userSaltHash;
}

struct ConfigCache {
    bool isManagerDeployed;
    uint256 blockGasLimit;
    uint256 chainId;
    ContractConfigCache[] contractConfigCache;
}

struct ContractConfigCache {
    string referenceName;
    bool isTargetDeployed;
    DeploymentRevert deploymentRevert;
    ImportCache importCache;
    OptionalString previousConfigUri;
}

struct DeploymentRevert {
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
    IMMUTABLE
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
