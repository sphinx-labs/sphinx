// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { SphinxLeafType, SphinxLeaf, SphinxLeafWithProof } from "../core/SphinxDataTypes.sol";

struct HumanReadableAction {
    string reason;
    uint256 actionIndex;
}

struct SphinxMerkleTree {
    bytes32 root;
    SphinxLeafWithProof[] leavesWithProofs;
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
    Collect,
    LiveNetworkBroadcast,
    LocalNetworkBroadcast,
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
 * @custom:field newConfig The SphinxConfig that the user has defined in their script.
 * @custom:field isLiveNetwork Whether or not the deployment is occurring on a live network (e.g.
 *               Ethereum) as opposed to a local node (e.g. an Anvil or Hardhat node).
 * @custom:field initialState The values of several state variables before the deployment occurs.
 */
struct DeploymentInfo {
    address safeAddress;
    address moduleAddress;
    address executorAddress;
    uint256 nonce;
    uint256 chainId;
    bytes   safeInitData;
    uint256 safeInitSaltNonce;
    bool requireSuccess;
    SphinxConfig newConfig;
    bool isLiveNetwork;
    InitialChainState initialState;
    Label[] labels;
    bool arbitraryChain;
}

/**
 * @notice Contains the values of a few state variables which are retrieved on-chain *before* the
 *         deployment occurs. These determine various aspects of the deployment.
 *
 * @custom:field isSafeDeployed True if the user's Safe has been deployed. If false, we'll
 *               need to deploy the Safe before the deployment occurs.
 * @custom:field isExecuting True if there's currently an active deployment in the user's
 *               SphinxManager. If so, we cancel the existing deployment, since an existing active
 *               deployment implies that an error occurred in one of the user's contracts during
 *               that deployment.
 */
struct InitialChainState {
    bool isSafeDeployed;
    bool isExecuting;
}

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
    Network[] mainnets;
    Network[] testnets;
}

struct Label {
    address addr;
    string fullyQualifiedName;
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

enum NetworkType {
    Mainnet,
    Testnet,
    Local
}

struct NetworkInfo {
    Network network;
    string name;
    uint256 chainId;
    NetworkType networkType;
}

struct ProposalOutput {
    address proposerAddress;
    bytes metaTxnSignature;
    SphinxMerkleTree bundle;
    bytes32 authRoot;
}

/**
 * @notice Provides an easy way to get complex data types off-chain (via the ABI) without
 *         needing to hard-code them.
 */
contract SphinxPluginTypes {
    function sphinxMerkleTreeType() external pure returns (SphinxMerkleTree memory bundleInfo) {}

    function humanReadableActionsType()
        external
        pure
        returns (HumanReadableAction[] memory humanReadableActions)
    {}

    function getDeploymentInfo() external view returns (DeploymentInfo memory deploymentInfo) {}

    function getDeploymentInfoArray()
        external
        view
        returns (DeploymentInfo[] memory deploymentInfoArray)
    {}

    function getSphinxConfig() external view returns (SphinxConfig memory sphinxConfig) {}

    function proposalOutput() external pure returns (ProposalOutput memory output) {}
}

struct Wallet {
    uint256 privateKey;
    address addr;
}

/**
 * @notice Version number as a struct.
 *
 * @custom:field major Major version number.
 * @custom:field minor Minor version number.
 * @custom:field patch Patch version number.
 */
struct Version {
    uint256 major;
    uint256 minor;
    uint256 patch;
}
