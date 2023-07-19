// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import {
    SphinxActionBundle,
    SphinxTargetBundle
} from "@sphinx/contracts/contracts/SphinxDataTypes.sol";

struct Configs {
    MinimalConfig minimalConfig;
    string userConfigStr;
}

struct BundleInfo {
    string configUri;
    DeployContractCost[] deployContractCosts;
    SphinxActionBundle actionBundle;
    SphinxTargetBundle targetBundle;
}

struct MinimalConfig {
    address deployer;
    address owner;
    string projectName;
    MinimalContractConfig[] contracts;
}

struct DeployContractCost {
    string referenceName;
    uint256 cost;
}

struct MinimalContractConfig {
    string referenceName;
    address addr;
    ContractKindEnum kind;
    bytes32 userSaltHash;
}

struct ConfigCache {
    bool isRegistered;
    uint256 blockGasLimit;
    bool localNetwork;
    string networkName;
    ContractConfigCache[] contractConfigCache;
}

struct ContractConfigCache {
    string existingProjectName;
    string referenceName;
    bool isTargetDeployed;
    DeploymentRevert deploymentRevert;
    ImportCache importCache;
    OptionalBytes32 deployedCreationCodeWithArgsHash;
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
