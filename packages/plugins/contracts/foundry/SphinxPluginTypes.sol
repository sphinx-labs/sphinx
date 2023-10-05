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

/**
 * @notice Contains all of the information that's collected in a deployment on a single chain.
 *
 * @custom:field authAddress The address of the user's SphinxAuth contract.
 * @custom:field managerAddress The address of the user's SphinxManager contract.
 * @custom:field chainId The chain ID where the deployment will occur.
 * @custom:field actionInputs The actions that the user has defined in their deployment. For
 *               example, contract deployments or function calls.
 * @custom:field newConfig The SphinxConfig that the user has defined in their script.
 * @custom:field isLiveNetwork Whether or not the deployment is occurring on a live network (e.g.
 *               Ethereum) as opposed to a local node (e.g. an Anvil or Hardhat node).
 * @custom:field initialState The values of several state variables before the deployment occurs.
 * @custom:field remoteExecution Whether or not the deployment will be executed remotely, which
 *               occurs if the user is using the DevOps platform.
 */
struct DeploymentInfo {
    address authAddress;
    address managerAddress;
    uint256 chainId;
    SphinxActionInput[] actionInputs;
    SphinxConfig newConfig;
    bool isLiveNetwork;
    InitialChainState initialState;
    bool remoteExecution;
}

/**
 * @notice Contains the values of a few state variables which are retrieved on-chain *before* the
 *         deployment occurs. These determine various aspects of the deployment.
 *
 * @custom:field proposers The existing list of proposers in the SphinxAuth contract. This is
 *               empty if the SphinxAuth contract does not exist yet. Determines which proposers
 *               must be added in this deployment.
 * @custom:field version The existing version of the user's SphinxManager and SphinxAuth contract.
 *               Determines whether we need to upgrae these contracts to the latest vesion during
 *               the deployment.
 * @custom:field isManagerDeployed True if the user's SphinxManager has been deployed. If false,
 *               we'll need to register this contract before the deployment occurs.
 * @custom:field firstProposalOccurred True if a proposal has previously been executed on the user's
 *               SphinxAuth contract. If false, then we won't call `SphinxAuth.setup` at the
 *               beginning of the deployment.
 * @custom:field isExecuting True if there's currently an active deployment in the user's
 *               SphinxManager. If so, we cancel the existing deployment, since an existing active
 *               deployment implies that an error occurred in one of the user's contracts during
 *               that deployment.
 */
struct InitialChainState {
    address[] proposers;
    Version version;
    bool isManagerDeployed;
    bool firstProposalOccurred;
    bool isExecuting;
}

// TODO(md): the 'mainnets' and 'testnets' arrays aren't used outside of the DevOps platform, since
// deployments on the CLI occur on one network at a time.

/**
 * @notice An object that contains all of the user's configuration settings for a deployment.
 *         The `projectName`, `owners`, and `threshold` determine the `CREATE3` address of
 *         the user's contracts. The other parameters are only used if the user's deploying
 *         with the DevOps platform.
 *
 * @custom:field projectName The name of the user's project.
 * @custom:field owners The list of owners of the user's contracts. There must only be
 *               one owner if the user is not deploying with the DevOps platform.
 * @custom:field threshold The number of owners that must approve the deployment. This
 *               must be less than or equal to the number of owners.
 * @custom:field orgId The ID of the user's organization on the DevOps platform. This can
 *               be retrieved from the Sphinx UI.
 * @custom:field proposers The list of addresses that are allowed to propose deployments,
 *               which will be approved by the owners in Sphinx's UI.
 * @custom:field mainnets The list of production networks that the user's contracts will
 *               be deployed on using the DevOps platform.
 * @custom:field testnets The list of test networks that the user's contracts will be
 *               deployed on using the DevOps platform.
 * @custom:field version The version of the SphinxManager and SphinxAuth contracts that
 *               deploy the user's contracts. Currently, this defaults to the latest
 *               version, so it doesn't need to be specified by the user.
 */
struct SphinxConfig {
    string projectName;
    address[] owners;
    uint256 threshold;
    string orgId;
    address[] proposers;
    Network[] mainnets;
    Network[] testnets;
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

/**
 * @notice Represents an action that the user has defined in their deployment. These
 *         actions are collected during the deployment process and then executed
 *         in the order they were defined.
 *
 * @custom:field fullyQualifiedName The fully qualified name of the contract on which
 *               the action will be executed. For example, `contracts/MyContract.sol:MyContract`.
 * @custom:field actionType The type of action to execute. For example, `DEPLOY_CONTRACT`.
 * @custom:field data The ABI-encoded data of the action. The fields of this data are
 *               dependent on the action. For example, if the action type is `DEPLOY_CONTRACT`,
 *               then the data will contain the constructor arguments of the contract, as well
 *               as its reference name, in addition to other fields. If the action type is `CALL`
 *               (i.e. a function call), then the data will contain the function selector, function
 *               arguments, etc.
 * @custom:field skip Whether or not to skip the action. An action will be skipped if it has
 *               already been executed on the current chain. This ensures that the deployment
 *               process is idempotent, which means that the same action will not be executed twice.
 */
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

/**
 * @notice Provides an easy way to get complex data types off-chain (via the ABI) without
 *         needing to hard-code them.
 */
contract SphinxPluginTypes {
    function bundledActionsType() external pure returns (BundledSphinxAction[] memory) {}

    function bundledAuthLeafsType() external pure returns (BundledAuthLeaf[] memory) {}

    function targetBundleType() external pure returns (SphinxTargetBundle memory) {}

    function humanReadableActionsType() external pure returns (HumanReadableAction[] memory) {}

    function getDeploymentInfo() external view returns (DeploymentInfo memory) {}

    function getDeploymentInfoArray() external view returns (DeploymentInfo[] memory) {}
}
