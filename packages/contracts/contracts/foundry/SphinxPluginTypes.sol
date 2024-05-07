// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { SphinxLeafType, SphinxLeaf, SphinxLeafWithProof } from "../core/SphinxDataTypes.sol";
import { Network } from "./SphinxConstants.sol";
import { IEnum } from "./interfaces/IEnum.sol";
import { Vm, VmSafe } from "../../contracts/forge-std/src/Vm.sol";

struct HumanReadableAction {
    string reason;
    uint256 actionIndex;
}

struct SphinxMerkleTree {
    bytes32 root;
    SphinxLeafWithProof[] leavesWithProofs;
}

struct GnosisSafeTransaction {
    address to;
    uint256 value;
    bytes txData;
    IEnum.GnosisSafeOperation operation;
}

struct FoundryContractConfig {
    string referenceName;
    address addr;
    ContractKindEnum kind;
    bytes32 userSaltHash;
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

struct ParsedAccountAccess {
    Vm.AccountAccess root;
    Vm.AccountAccess[] nested;
}

/**
 * @notice Contains all of the information that's collected in a deployment on a single chain.
 *         The only difference between this struct and the TypeScript `DeploymentInfo` object is
 *         that the latter has an `accountAccesses` array of `ParsedAccountAccess` elements, whereas
 *         this struct has an `encodedAccountAccesses` bytes array of `ParsedAccountAccess`
 *         elements.
 *
 * @custom:field encodedAccountAccesses An array of ABI encoded `ParsedAccountAccess` structs. We
 *                                      ABI encode each `ParsedAccountAccess` struct individually so
 *                                      that we can decode them in TypeScript. Specifically, if we
 *                                      ABI encode the entire array of `ParsedAccountAccess`
 *                                      elements, the encoded bytes will be too large for EthersJS
 *                                      to ABI decode, which causes an error. This occurs for large
 *                                      deployments, i.e. greater than 50 contracts.
 */
struct FoundryDeploymentInfo {
    address safeAddress;
    address moduleAddress;
    address executorAddress;
    uint256 nonce;
    uint256 chainId;
    uint256 blockGasLimit;
    uint256 blockNumber;
    bytes safeInitData;
    bool requireSuccess;
    InternalSphinxConfig newConfig;
    ExecutionMode executionMode;
    InitialChainState initialState;
    bool arbitraryChain;
    string sphinxLibraryVersion;
    bytes[] encodedAccountAccesses;
    uint256[] gasEstimates;
    uint fundsRequestedForSafe;
    uint safeStartingBalance;
}

enum ExecutionMode {
    LocalNetworkCLI,
    LiveNetworkCLI,
    Platform
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

struct UserSphinxConfig {
    string projectName;
    string[] mainnets;
    string[] testnets;
}

struct InternalSphinxConfig {
    string projectName;
    address[] owners;
    uint256 threshold;
    string orgId;
    string[] mainnets;
    string[] testnets;
    uint256 saltNonce;
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
    uint256 dripSize;
    string dripSizeString;
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

/**
 * @notice Contract info for a contract that's required for Sphinx to work on a network. These are
 *         mostly Gnosis Safe contracts.
 */
struct SystemContractInfo {
    bytes initCodeWithArgs;
    address expectedAddress;
}

/**
 * @notice The DefaultSafe is the Gnosis Safe that is used by default when deploying with a project.
 * In the future, we will likely support having multiple Safes that can be shared between different
 * projects.
 *
 * Currently, we only support a 1-to-1 relationship between projects and Safes, so we only track the
 * default Safe for each project.
 */
struct DefaultSafe {
    address[] owners;
    string safeName;
    uint saltNonce;
    uint threshold;
}

struct SphinxLockProject {
    DefaultSafe defaultSafe;
    string projectName;
    string orgId;
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

    function deployTaskInputsType()
        external
        pure
        returns (
            SphinxMerkleTree memory merkleTree,
            HumanReadableAction[] memory humanReadableActions
        )
    {}

    function parsedAccountAccessType()
        external
        view
        returns (ParsedAccountAccess memory parsedAccountAccess)
    {}

    function getDeploymentInfo()
        external
        view
        returns (FoundryDeploymentInfo memory deploymentInfo)
    {}

    function getDeploymentInfoArray()
        external
        view
        returns (FoundryDeploymentInfo[] memory deploymentInfoArray)
    {}

    function userSphinxConfigType()
        external
        view
        returns (UserSphinxConfig memory userSphinxConfig)
    {}

    function systemContractInfoArrayType()
        external
        view
        returns (SystemContractInfo[] memory systemContracts)
    {}

    function sphinxLeafWithProofType()
        external
        view
        returns (SphinxLeafWithProof memory leafWithProof)
    {}

    function leafWithProofBatchesType()
        external
        view
        returns (SphinxLeafWithProof[][] memory batches)
    {}
}
