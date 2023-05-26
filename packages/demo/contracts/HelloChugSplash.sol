// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract HelloChugSplash {
    uint8 public number;
    bool public stored;
    address public otherStorage;
    string public storageName;

    struct Hi {
        uint hi;
    }

    struct ChugSplashBundles {
        ChugSplashActionBundle actionBundle;
        ChugSplashTargetBundle targetBundle;
    }

    struct ChugSplashActionBundle {
        bytes32 root;
        BundledChugSplashAction[] actions;
    }

    struct ChugSplashTargetBundle {
        bytes32 root;
        BundledChugSplashTarget[] targets;
    }

    struct BundledChugSplashAction {
        RawChugSplashAction action;
        ActionProof proof;
    }

    struct BundledChugSplashTarget {
        ChugSplashTarget target;
        bytes32[] siblings;
    }

    struct ActionProof {
        uint256 actionIndex;
        bytes32[] siblings;
    }
    /**
     * @notice Struct representing a ChugSplash action.
     *
     * @custom:field actionType The type of action.
     * @custom:field data The ABI-encoded data associated with the action.
     * @custom:field addr The address of the contract to which the action applies.
     * @custom:field contractKindHash The hash of the contract kind associated with this contract.
     * @custom:field referenceName The reference name associated with the contract.
     */
    struct RawChugSplashAction {
        ChugSplashActionType actionType;
        bytes data;
        address payable addr;
        bytes32 contractKindHash;
        string referenceName;
    }

    /**
     * @notice Struct representing a target.
     *
     * @custom:field projectName The name of the project associated with the target.
     * @custom:field referenceName The reference name associated with the target.
     * @custom:field addr The address of the proxy associated with this target.
     * @custom:field implementation The address that will be the proxy's implementation at the end of
     the deployment.
    * @custom:field contractKindHash The hash of the contract kind associated with this contract.
    */
    struct ChugSplashTarget {
        string projectName;
        string referenceName;
        address payable addr;
        address implementation;
        bytes32 contractKindHash;
    }

    /**
     * @notice Enum representing possible action types.
     *
     * @custom:value SET_STORAGE Set a storage slot value in a proxy contract.
     * @custom:value DEPLOY_CONTRACT Deploy a contract.
     */
    enum ChugSplashActionType {
        SET_STORAGE,
        DEPLOY_CONTRACT
    }

    /**
     * @notice Enum representing the status of the deployment. These steps occur in sequential order,
     with the `CANCELLED` status being an exception.
    *
    * @custom:value EMPTY The deployment does not exist.
    * @custom:value PROPOSED The deployment has been proposed.
    * @custom:value APPROVED The deployment has been approved by the owner.
    * @custom:value PROXIES_INITIATED The proxies in the deployment have been initiated.
    * @custom:value COMPLETED The deployment has been completed.
    * @custom:value CANCELLED The deployment has been cancelled.
    * @custom:value FAILED The deployment has failed.
    */
    enum DeploymentStatus {
        EMPTY,
        PROPOSED,
        APPROVED,
        PROXIES_INITIATED,
        COMPLETED,
        CANCELLED,
        FAILED
    }

    struct CrossChainMessageInfo {
        address payable originEndpoint;
        uint32 destDomainID;
        uint256 relayerFee;
    }

    struct RegistrationInfo {
        Version version;
        address owner;
        bytes managerInitializerData;
    }

    struct Version {
    uint256 major;
    uint256 minor;
    uint256 patch;
}

    function slice(Hi[] calldata _ary, uint start, uint end) external pure returns (Hi[] memory) {
        return _ary[start:end];
    }
}
