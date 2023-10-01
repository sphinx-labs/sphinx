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

struct SphinxAuthBundle {
    bytes32 root;
    BundledAuthLeaf[] leafs;
}

struct BundledAuthLeaf {
    AuthLeaf leaf;
    AuthLeafType leafType;
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

struct BundledSphinxTarget {
    SphinxTarget target;
    bytes32[] siblings;
}

struct HumanReadableAction {
    string reason;
    uint actionIndex;
    SphinxActionType actionType;
}

enum ownerSignatureArray {
    Default,
    Broadcast,
    Proposal
}

struct BundleInfo {
    string networkName;
    string configUri;
    BundledAuthLeaf[] authLeafs;
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

enum SphinxMode {
    Default,
    Broadcast,
    Proposal
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

struct DeploymentInfo {
    address authAddress;
    address managerAddress;
    uint256 chainId;
    SphinxActionInput[] actionInputs; // TODO(docs): these actions are collected during the deployment.
    SphinxConfig newConfig;
    bool isLiveNetwork;
    InitialChainState initialState;
    bool remoteExecution;
}

// TODO(docs): this fields are all retrieved on-chain *before* a deployment/simulation occurs.
struct InitialChainState {
    address[] proposers;
    Version version;
    bool isManagerDeployed;
    bool firstProposalOccurred;
    bool isExecuting;
}

// TODO(md): the 'mainnets' and 'testnets' arrays aren't used outside of the DevOps platform, since
// deployments on the CLI occur on one network at a time.
// TODO(md): the default value for 'threshold' is the number of addresses in the 'owners' array.

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

struct DefineOptions {
    string referenceName;
}

struct SphinxActionInput {
    string fullyQualifiedName;
    SphinxActionType actionType;
    bytes data;
    bool skip;
}

enum NetworkType {
    Mainnet,
    Testnet,
    Local
}

struct NetworkInfo {
    Network network;
    string name;
    uint chainId;
    NetworkType networkType;
}

// TODO(docs): This provides an easy way to get complex data types off-chain (via the ABI)
// without needing to hard-code them.
contract SphinxPluginTypes {
    function bundledActionsType() external pure returns (BundledSphinxAction[] memory) {}
    function bundledAuthLeafsType() external pure returns (BundledAuthLeaf[] memory) {}
    function targetBundleType() external pure returns (SphinxTargetBundle memory) {}
    function humanReadableActionsType() external pure returns (HumanReadableAction[] memory) {}
    // TODO(docs): we need to define this explicitly for the same reason we need to define
    // SphinxManager.deployments(...) explicitly.
    function getDeploymentInfo() external view returns (DeploymentInfo memory) {}
    function getDeploymentInfoArray() external view returns (DeploymentInfo[] memory) {}
}
