// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import {
    SphinxTarget,
    RawSphinxAction,
    SphinxActionType,
    Version
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

struct HumanReadableAction {
    string reason;
    uint actionIndex;
    SphinxActionType actionType;
}

struct Configs {
    FoundryConfig minimalConfig;
    string parsedConfigStr;
}

struct BundleInfo {
    string configUri;
    SphinxActionBundle actionBundle;
    SphinxTargetBundle targetBundle;
    HumanReadableAction[] humanReadableActions;
}

struct FoundryConfig {
    address manager;
    address owner;
    string projectName;
    FoundryContractConfig[] contracts;
    ParsedCallAction[] postDeploy;
}

struct FoundryContractConfig {
    string referenceName;
    address addr;
    ContractKindEnum kind;
    bytes32 userSaltHash;
}

struct ConfigCache {
    bool isManagerDeployed;
    bool isExecuting;
    Version managerVersion;
    uint256 blockGasLimit;
    uint256 chainId;
    ContractConfigCache[] contractConfigCache;
    CallNonces[] callNonces;
    address[] undeployedExternalContracts;
}

struct ContractConfigCache {
    string referenceName;
    bool isTargetDeployed;
    DeploymentRevert deploymentRevert;
    ImportCache importCache;
    OptionalString previousConfigUri;
}

struct CallNonces {
    bytes32 callHash;
    uint256 nonce;
}

struct DeploymentRevert {
    bool deploymentReverted;
    OptionalString revertString;
}

struct ParsedCallAction {
    address to;
    bytes data;
    uint256 nonce;
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

struct SphinxConfig {
    string projectName;
    address[] owners;
    address[] proposers;
    Network[] mainnets;
    Network[] testnets;
    uint256 threshold;
    Version managerVersion;
}

enum Network {
    ethereum,
    ethereum_goerli,
    optimism,
    optimism_goerli,
    arbitrum,
    arbitrum_goerli,
    polygon,
    polygon_mumbai,
    bsc,
    bsc_testnet,
    gnosis,
    gnosis_chiado,
    base,
    base_goerli,
    linea,
    linea_goerli,
    avalanche,
    avalanche_fuji,
    fantom,
    fantom_testnet,
    polygon_zkevm,
    polygon_zkevm_goerli,
    anvil
}

struct DeployOptions {
    bytes32 salt;
    string referenceName;
}

// TODO: are any of these fields unnecessary?
struct SphinxAction {
    string fullyQualifiedName;
    SphinxActionType actionType;
    bytes data;
}
