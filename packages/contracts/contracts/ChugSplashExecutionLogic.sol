// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {
    ERC2771ContextUpgradeable
} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import {
    Lib_MerkleTree
} from "@eth-optimism/contracts/libraries/utils/Lib_MerkleTree.sol";
import { Proxy } from "@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol";
import { ChugSplashRegistry } from "./ChugSplashRegistry.sol";
import { IProxyAdapter } from "./interfaces/IProxyAdapter.sol";
import { ICreate3 } from "./interfaces/ICreate3.sol";
import {
    DeploymentState,
    RawChugSplashAction,
    ChugSplashTarget,
    ChugSplashActionType,
    DeploymentStatus
} from "./ChugSplashDataTypes.sol";
import {
    InitiatedUpgradeTooEarly,
    DeploymentIsNotApproved,
    IncorrectNumberOfTargets,
    OnlyProxiesAllowed,
    InvalidMerkleProof,
    ProxyDeploymentFailed,
    InvalidContractKind,
    FailedToInitiateUpgrade,
    NoActiveDeployment,
    FinalizedUpgradeTooEarly,
    InvalidContractKind,
    FailedToFinalizeUpgrade,
    InvalidActionType,
    ProxiesAreNotInitiated,
    SetStorageFailed,
    FailedToGetAddress,
    FailedToDeployContract
} from "./ChugSplashErrors.sol";
import {
    ChugSplashManagerEvents
} from "./ChugSplashManagerEvents.sol";

contract ChugSplashExecutionLogic is ChugSplashManagerEvents, ERC2771ContextUpgradeable {
    /**
     * @notice The contract kind hash for contracts that do not use a proxy (i.e. immutable
       contracts).
     */
    bytes32 internal constant NO_PROXY_CONTRACT_KIND_HASH = keccak256("no-proxy");

    /**
     * @notice Address of the ChugSplashRegistry.
     */
    ChugSplashRegistry public immutable registry;

    /**
     * @notice Address of the Create3 contract.
     */
    address public immutable create3;

    /**
     * @param _registry                  Address of the ChugSplashRegistry.
     * @param _create3                   Address of the Create3 contract.
     */
    constructor(ChugSplashRegistry _registry, address _create3, address _trustedForwarder) ERC2771ContextUpgradeable(_trustedForwarder) {
        registry = _registry;
        create3 = _create3;
    }

    /**
     * @notice Initiate the proxies in an upgrade. This must be called after the contracts are
       deployment is approved, and before the rest of the execution process occurs. In this
       function, all of the proxies in the deployment are disabled by setting their implementations
       to a contract that can only be called by the team's ChugSplashManagerProxy. This must occur
       in a single transaction to make the process atomic, which means the proxies are upgraded as a
       single unit.

     * @param _targets Array of ChugSplashTarget structs containing the targets for the _deployment.
     * @param _proofs Array of Merkle proofs for the targets.
     */
    function initiateUpgrade(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _proofs,
        DeploymentState memory _deployment,
        bytes32 _activeDeploymentId
    ) public {
        if (_deployment.actionsExecuted != _deployment.numNonProxyContracts) {
            revert InitiatedUpgradeTooEarly();
        }

        // Ensures that the deployment status isn't `FAILED`.
        if (_deployment.status != DeploymentStatus.APPROVED) {
            revert DeploymentIsNotApproved();
        }

        uint256 numTargets = _targets.length;
        if (numTargets != _deployment.targets) {
            revert IncorrectNumberOfTargets();
        }

        ChugSplashTarget memory target;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numTargets; i++) {
            target = _targets[i];
            proof = _proofs[i];

            if (target.contractKindHash == NO_PROXY_CONTRACT_KIND_HASH) {
                revert OnlyProxiesAllowed();
            }

            if (
                !Lib_MerkleTree.verify(
                    _deployment.targetRoot,
                    keccak256(
                        abi.encode(
                            target.projectName,
                            target.referenceName,
                            target.addr,
                            target.implementation,
                            target.contractKindHash
                        )
                    ),
                    i,
                    proof,
                    _deployment.targets
                )
            ) {
                revert InvalidMerkleProof();
            }

            if (target.contractKindHash == bytes32(0) && target.addr.code.length == 0) {
                bytes32 salt = keccak256(abi.encode(target.projectName, target.referenceName));
                Proxy created = new Proxy{ salt: salt }(address(this));

                // Could happen if insufficient gas is supplied to this transaction, should not
                // happen otherwise. If there's a situation in which this could happen other than a
                // standard OOG, then this would halt the entire execution process.
                if (address(created) != target.addr) {
                    revert ProxyDeploymentFailed();
                }

                emit DefaultProxyDeployed(
                    salt,
                    target.addr,
                    _activeDeploymentId,
                    target.projectName,
                    target.referenceName
                );
                registry.announceWithData("DefaultProxyDeployed", abi.encodePacked(target.addr));
            }

            address adapter = registry.adapters(target.contractKindHash);
            if (adapter == address(0)) {
                revert InvalidContractKind();
            }

            // Set the proxy's implementation to be a ProxyUpdater. Updaters ensure that only the
            // ChugSplashManager can interact with a proxy that is in the process of being updated.
            // Note that we use the Updater contract to provide a generic interface for updating a
            // variety of proxy types. Note no adapter is necessary for non-proxied contracts as
            // they are not upgradable and cannot have state.
            // slither-disable-next-line controlled-delegatecall
            (bool success, ) = adapter.delegatecall(
                abi.encodeCall(IProxyAdapter.initiateUpgrade, (target.addr))
            );
            if (!success) {
                revert FailedToInitiateUpgrade();
            }
        }

        emit ProxiesInitiated(_activeDeploymentId, _msgSender());
        registry.announce("ProxiesInitiated");
    }

    /**
     * @notice Finalizes the upgrade by setting all proxies to their new implementations. This
     *         occurs in a single transaction to ensure that the upgrade is atomic.
     *
     * @param _targets Array of ChugSplashTarget structs containing the targets for the _deployment.
     * @param _proofs Array of Merkle proofs for the targets.
     */
    function finalizeUpgrade(
        ChugSplashTarget[] memory _targets,
        bytes32[][] memory _proofs,
        DeploymentState memory _deployment,
        bytes32 _activeDeploymentId
    ) public {
        if (_activeDeploymentId == bytes32(0)) {
            revert NoActiveDeployment();
        }

        if (_deployment.actionsExecuted != _deployment.actions.length) {
            revert FinalizedUpgradeTooEarly();
        }

        uint256 numTargets = _targets.length;
        if (numTargets != _deployment.targets) {
            revert IncorrectNumberOfTargets();
        }

        ChugSplashTarget memory target;
        bytes32[] memory proof;
        for (uint256 i = 0; i < numTargets; i++) {
            target = _targets[i];
            proof = _proofs[i];

            if (target.contractKindHash == NO_PROXY_CONTRACT_KIND_HASH) {
                revert OnlyProxiesAllowed();
            }

            if (
                !Lib_MerkleTree.verify(
                    _deployment.targetRoot,
                    keccak256(
                        abi.encode(
                            target.projectName,
                            target.referenceName,
                            target.addr,
                            target.implementation,
                            target.contractKindHash
                        )
                    ),
                    i,
                    proof,
                    _deployment.targets
                )
            ) {
                revert InvalidMerkleProof();
            }

            // Get the proxy type and adapter for this reference name.
            address adapter = registry.adapters(target.contractKindHash);
            if (adapter == address(0)) {
                revert InvalidContractKind();
            }

            // Upgrade the proxy's implementation contract.
            (bool success, ) = adapter.delegatecall(
                abi.encodeCall(IProxyAdapter.finalizeUpgrade, (target.addr, target.implementation))
            );
            if (!success) {
                revert FailedToFinalizeUpgrade();
            }
            emit ProxyUpgraded(_activeDeploymentId, target.addr, target.projectName, target.referenceName);
            registry.announceWithData("ProxyUpgraded", abi.encodePacked(target.addr));
        }
    }

    /**
     * @notice Deploys non-proxy contracts and sets proxy state variables. If the deployment does
       not contain any proxies, it will be completed after all of the non-proxy contracts have been
       deployed in this function.
     */
    function executeActions(
        RawChugSplashAction memory _action,
        uint256 _actionIndex,
        bytes32[] memory _proof,
        DeploymentState memory _deployment,
        bytes32 _activeDeploymentId
    ) public {
        if (
            !Lib_MerkleTree.verify(
                _deployment.actionRoot,
                keccak256(
                    abi.encode(
                        _action.referenceName,
                        _action.addr,
                        _action.actionType,
                        _action.contractKindHash,
                        _action.data
                    )
                ),
                _actionIndex,
                _proof,
                _deployment.actions.length
            )
        ) {
            revert InvalidMerkleProof();
        }

        if (_action.actionType == ChugSplashActionType.DEPLOY_CONTRACT) {
            _attemptContractDeployment(_deployment, _action, _actionIndex, _activeDeploymentId);

            // TODO:
            // if (
            //     _deployment._actionsExecuted == _deployment._actions.length &&
            //     _deployment.targets == 0 &&
            //     _deployment.status != DeploymentStatus.FAILED
            // ) {
            //     _completeDeployment(_deployment);
            // }
        } else if (_action.actionType == ChugSplashActionType.SET_STORAGE) {
            _setProxyStorage(_deployment, _action, _actionIndex, _activeDeploymentId);
        } else {
            revert InvalidActionType();
        }
    }

    /**
     * @notice Modifies a storage slot value within a proxy contract.
     *
     * @param _deployment The current deployment state struct.
     * @param _action The `SET_STORAGE` action to execute.
     * @param _actionIndex The index of the action.
     */
    function _setProxyStorage(
        DeploymentState memory _deployment,
        RawChugSplashAction memory _action,
        uint256 _actionIndex,
        bytes32 _activeDeploymentId
    ) internal {
        if (_deployment.status != DeploymentStatus.PROXIES_INITIATED) {
            revert ProxiesAreNotInitiated();
        }

        // Get the adapter for this reference name.
        address adapter = registry.adapters(_action.contractKindHash);

        if (_action.contractKindHash == NO_PROXY_CONTRACT_KIND_HASH) {
            revert OnlyProxiesAllowed();
        }

        (bytes32 key, uint8 offset, bytes memory val) = abi.decode(
            _action.data,
            (bytes32, uint8, bytes)
        );
        // Delegatecall the adapter to call `setStorage` on the proxy.
        // slither-disable-next-line controlled-delegatecall
        (bool success, ) = adapter.delegatecall(
            abi.encodeCall(IProxyAdapter.setStorage, (_action.addr, key, offset, val))
        );
        if (!success) {
            revert SetStorageFailed();
        }

        emit SetProxyStorage(_activeDeploymentId, _action.addr, _msgSender(), _actionIndex);
        registry.announce("SetProxyStorage");
    }

    /**
     * @notice Attempts to deploy a non-proxy contract. The deployment will be skipped if a contract
     * already exists at the Create3 address. The entire deployment will be cancelled if the
       contract fails to be deployed, which should only occur if its constructor reverts.
     *
     * @param _deployment The current deployment state struct. The data location is "storage"
       because we
     * may modify one of the struct's fields.
     * @param _action The `DEPLOY_CONTRACT` action to execute.
     * @param _actionIndex The index of the action.
     */
    function _attemptContractDeployment(
        DeploymentState memory _deployment,
        RawChugSplashAction memory _action,
        uint256 _actionIndex,
        bytes32 _activeDeploymentId
    ) internal {
        if (_deployment.status != DeploymentStatus.APPROVED) {
            revert DeploymentIsNotApproved();
        }

        (bytes32 salt, bytes memory creationCodeWithConstructorArgs) = abi.decode(
            _action.data,
            (bytes32, bytes)
        );

        string memory referenceName = _action.referenceName;

        // Get the expected address of the contract. We delegatecall the Create3 contract because
        // the deployer of the contract is the ChugSplashManager.
        (bool success, bytes memory expectedAddressBytes) = create3.delegatecall(
            abi.encodeCall(ICreate3.getAddress, (salt))
        );

        if (!success) {
            revert FailedToGetAddress();
        }

        address expectedAddress = abi.decode(expectedAddressBytes, (address));

        // Check if the contract has already been deployed.
        if (expectedAddress.code.length > 0) {
            // Skip deploying the contract if it already exists. Execution would halt if we attempt
            // to deploy a contract that has already been deployed at the same address.
            emit ContractDeploymentSkipped(
                referenceName,
                expectedAddress,
                _activeDeploymentId,
                referenceName,
                _actionIndex
            );
            registry.announce("ContractDeploymentSkipped");
        } else {
            // We delegatecall the Create3 contract so that the ChugSplashManager address is used in
            // the address calculation of the deployed contract.
            (bool deploySuccess, bytes memory actualAddressBytes) = create3.delegatecall(
                abi.encodeCall(ICreate3.deploy, (salt, creationCodeWithConstructorArgs, 0))
            );

            if (!deploySuccess) {
                revert FailedToDeployContract();
            }

            address actualAddress = abi.decode(actualAddressBytes, (address));

            if (expectedAddress == actualAddress) {
                // Contract was deployed successfully.
                emit ContractDeployed(
                    referenceName,
                    actualAddress,
                    _activeDeploymentId,
                    referenceName,
                    _actionIndex,
                    keccak256(creationCodeWithConstructorArgs)
                );
                registry.announce("ContractDeployed");
            } else {
                revert IncorrectDeployedAddress();
                // TODO
                // // Contract deployment failed. Could happen if insufficient gas is supplied to this
                // // transaction or if the creation bytecode has logic that causes the call to fail
                // // (e.g. a constructor that reverts).

                // // Give the owner's bond to the executor.
                // executorDebt[_msgSender()] += ownerBondAmount;
                // totalExecutorDebt += ownerBondAmount;

                // emit DeploymentFailed(
                //     referenceName,
                //     expectedAddress,
                //     _activeDeploymentId,
                //     referenceName,
                //     _actionIndex
                // );
                // registry.announceWithData("DeploymentFailed", abi.encodePacked(_activeDeploymentId));

                // _activeDeploymentId = bytes32(0);
                // _deployment.status = DeploymentStatus.FAILED;
            }
        }
    }

    /**
     * @notice Use the ERC2771Recipient implementation to get the sender of the current call.
     */
    function _msgSender()
        internal
        view
        override
        returns (address sender)
    {
        sender = ERC2771ContextUpgradeable._msgSender();
    }

    /**
     * @notice Use the ERC2771Recipient implementation to get the data of the current call.
     */
    function _msgData()
        internal
        view
        override
        returns (bytes calldata)
    {
        return ERC2771ContextUpgradeable._msgData();
    }
}
