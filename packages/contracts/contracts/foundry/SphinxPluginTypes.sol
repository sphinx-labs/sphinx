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
 */
struct DeploymentInfo {
    address safeAddress;
    address moduleAddress;
    address executorAddress;
    uint256 nonce;
    uint256 chainId;
    bytes safeInitData;
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
 * @custom:field isSafeDeployed   True if the user's Safe has been deployed. If false, we'll
 *                                need to deploy the Safe before the deployment occurs.
 * @custom:field isModuleDeployed True if the `SphinxModuleProxy` has been deployed.
 * @custom:field isExecuting      True if there's currently an active deployment in the user's
 *                                SphinxModuleProxy. If so, we cancel the existing deployment, since
 *                                an existing active deployment implies that an error occurred in
 *                                one of the user's contracts during that deployment.
 */
struct InitialChainState {
    bool isSafeDeployed;
    bool isModuleDeployed;
    bool isExecuting;
}

struct SphinxConfig {
    string projectName;
    address[] owners;
    uint256 threshold;
    string orgId;
    Network[] mainnets;
    Network[] testnets;
    uint256 saltNonce;
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
    sepolia,
    optimism_sepolia,
    arbitrum_sepolia,
    polygon_mumbai,
    bnb_testnet,
    gnosis_chiado,
    linea_goerli,
    polygon_zkevm_goerli,
    avalanche_fuji,
    fantom_testnet,
    base_sepolia
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

/**
 * @notice Provides an easy way to get complex data types off-chain (via the ABI) without
 *         needing to hard-code them.
 */
contract SphinxPluginTypes {
    function sphinxMerkleTreeType()
        external
        pure
        returns (SphinxMerkleTree memory merkleTreeType)
    {}

    function humanReadableActionsType()
        external
        pure
        returns (HumanReadableAction[] memory humanReadableActions)
    {}

    function humanReadableActionsNestedType()
        external
        pure
        returns (HumanReadableAction[][] memory humanReadableActions)
    {}

    function getDeploymentInfo() external view returns (DeploymentInfo memory deploymentInfo) {}

    function getDeploymentInfoArray()
        external
        view
        returns (DeploymentInfo[] memory deploymentInfoArray)
    {}

    function getSphinxConfig() external view returns (SphinxConfig memory sphinxConfig) {}
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
