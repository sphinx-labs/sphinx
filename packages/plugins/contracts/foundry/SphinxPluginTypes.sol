// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import {
    SphinxTarget,
    RawSphinxAction,
    SphinxActionType,
    Version,
    AuthLeaf,
    AuthLeafType
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";

struct SphinxBundles {
    SphinxAuthBundle authBundle;
    SphinxActionBundle actionBundle;
    SphinxTargetBundle targetBundle;
}

struct SphinxAuthBundle {
    bytes32 root;
    BundledAuthLeaf[] leafs;
}

struct BundledAuthLeaf {
  AuthLeaf leaf;
  AuthLeafType leafType;
  bytes32[] proof;
}

// TODO(docs)
struct AuthLeafWithoutData {
    uint256 chainId;
    uint256 index;
    address to;
}
// TODO(refactor): the data structure outputted by `get-bundle-info` is pretty messy.
struct BundledAuthLeafJson {
  AuthLeafWithoutData leaf;
  uint256 leafType;
  bytes32[] proof;
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
    uint256 gas;
    bytes32[] siblings;
}

struct BundledSphinxActionJson {
    RawSphinxActionJson action;
    uint256 gas;
    bytes32[] siblings;
}
struct RawSphinxActionJson {
    uint256 actionType;
    bytes data;
    uint256 index;
}

struct BundledSphinxTarget {
    SphinxTarget target;
    bytes32[] siblings;
}

// TODO(docs): this struct must conform to the rules here: https://book.getfoundry.sh/cheatcodes/parse-json
// This is why the actionType is a uint.
struct HumanReadableAction {
    uint actionIndex;
    uint actionType;
    string reason;
}

struct BundleInfo {
    string configUri;
    SphinxBundles bundles;
    HumanReadableAction[] humanReadableActions;
}

// TODO: need:
// DIFF:
// - configcache: chainId, isManagerDeployed, networkName (can be calculated from the chainid), networkType
// - for each contract to skip and deploy: referenceName, actionType | deploy_contract actions: constructor args, salt | call_actions: function args, function selector
// - also need: abi (to decode constructor+function args as well as functoin selector for diff)
// - skipped deploy_contract and call actions
// DEPLOYMENT ARTIFACTS:
// - managerAddress
// BUNDLING:
// - config artifacts (buildinfo for all; abi just for upgradeable contracts)
// - CompilerConfig['inputs'] (for config uri)
// - humanReadableActions (can be created from inputs above)
// - bundles (can be created from inputs above)

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

/**
 * @custom:field currentversion The current version of the SphinxManager.
 *               If the SphinxManager has not been deployed, then this defaults to
 *               the latest SphinxManager version.
 */
struct ConfigCache {
    address manager;
    bool isManagerDeployed;
    bool isExecuting;
    Version currentversion;
    uint256 chainId;
    bool isLiveNetwork;
}

struct ParsedCallAction {
    address to;
    bytes data;
    uint256 nonce;
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

// TODO(refactor): the name should probably reflect the fact that this is for deployments,
// not proposals, b/c of PreviousInfo. the other fields are the same as proposals.
struct ChainInfo {
    address authAddress;
    address managerAddress;
    uint256 chainId;
    SphinxAction[] actionsTODO; // TODO(docs): these actions are collected during the deployment.
    SphinxConfig newConfig;
    bool isLiveNetwork;
    PreviousInfo prevConfig;
}

// TODO(docs): this fields are all retrieved on-chain *before* a deployment/simulation occurs.
struct PreviousInfo {
    address[] owners;
    address[] proposers;
    uint256 threshold;
    Version version;
    bool isManagerDeployed;
    bool firstProposalOccurred;
    bool isExecuting;
}

struct SphinxConfig {
    string projectName;
    string orgId;
	address[] owners;
	address[] proposers;
	Network[] mainnets;
	Network[] testnets;
	uint256 threshold;
	Version version;
}

enum Network {
    anvil,
    // production networks (i.e. mainnets)
    ethereum,
    optimism,
    arbitrum,
    polygon,
    bnb,
    gnosis,
    linea,
    polygon_zkevm,
    avalanche,
    fantom,
    base,
    // testnets
    goerli,
    optimism_goerli,
    arbitrum_goerli,
    polygon_mumbai,
    bnb_testnet,
    gnosis_chiado,
    linea_goerli,
    polygon_zkevm_goerli,
    avalanche_fuji,
    fantom_testnet,
    base_goerli
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
    bool skip;
}
