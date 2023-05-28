
// TODO: merge this contract with LocalExecutor?
abstract contract ChugSplashTasks {
    // - bundles, configUri (used only for logs)
    struct TODO {
        bytes32 organizationID;
        string memory projectName;
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

    // TODO(bundling): sort by ascending actionIndex, and remove the sort in `executeTask`

    // TODO(test): etherscan verification: https://book.getfoundry.sh/tutorials/solidity-scripting. i'd be
    //   surprised if this works since we deploy contracts in a non-standard way

    // TODO(test): you should throw a helpful error message in foundry/index.ts if reading from
    // state on the in-process node (e.g. in async user config).

    // TODO: spinner

    // TODO(inputs):
    // TODO(overload):
    // - newOwner? (not necessary for `finalizeRegistration`)
    // TODO(docs): this is the plugins deployTask and the deployAbstractTask
    // TODO: internal -> private? don't want users to accidentally overwrite these functions
    function deploy(string memory _configPath, OptionalAddress _newOwner) internal {
        MinimalParsedConfig memory minimalParsedConfig = ffiGetMinimalParsedConfig(_configPath);

        ConfigCache memory configCache = getConfigCache(minimalParsedConfig);

        ffiPostParsingValidation(configCache);

        bytes32 organizationID = minimalConfig.organizationID;
        string memory projectName = minimalConfig.projectName;
        string memory networkName = configCache.networkName;
        uint256 blockGasLimit = configCache.blockGasLimit,
        bool liveNetwork = configCache.liveNetwork;

        ChugSplashRegistry registry = getChugSplashRegistry();
        ChugSplashManager manager = getChugSplashManager(organizationID);

        // TODO: what happens to msg.sender when startBroadcast(addr) is used?
        finalizeRegistration(manager, organizationID, msg.sender, false, projectName);

        // TODO(docs): explain why this version doesn't have the canonicalconfig
        (string memory configUri, ChugSplashBundles memory bundles) = ffiGetCanonicalConfigData();

        if (
            bundles.actionBundle.actions.length == 0 &&
            bundles.targetBundle.targets.length == 0
        ) {
            // TODO(spinner): logger is probably justified here
            return;
        }

        bytes32 deploymentId = getDeploymentId(bundles, configUri);
        DeploymentState memory deploymentState = manager.deployments(deploymentId);
        DeploymentStatus currDeploymentStatus = deploymentState.status;

        if (currDeploymentStatus == DeploymentStatus.CANCELLED) {
            revert(string.concat(projectName, " was previously cancelled on ", networkName));
        }

        if (currDeploymentStatus == DeploymentStatus.EMPTY) {
            proposeChugSplashDeployment(manager, deploymentId, bundles, configUri, ProposalRoute.LOCAL_EXECUTION);
            currDeploymentStatus = DeploymentStatus.PROPOSED;
        }

        if (deploymentState.status == DeploymentStatus.PROPOSED) {
            approveDeployment(deploymentId, manager);
            currDeploymentStatus = DeploymentStatus.APPROVED;
        }

        if (currDeploymentStatus == DeploymentStatus.APPROVED || currDeploymentStatus == DeploymentStatus.PROXIES_INITIATED) {
            bool success = executeDeployment(manager, bundles. blockGasLimit);

            if (!success) {
                revert(string.concat("ChugSplash: failed to execute ", projectName, "likely because one of the user's constructors reverted during the deployment."));
            }
        }

        if (_newOwner.exists) {
            transferProjectOwnership(manager, _newOwner.value);
        }

        ffiPostDeploymentActions(manager, deploymentId, configUri, liveNetwork, networkName, etherscanApiKey);
    }

    function finalizeRegistration(ChugSplashRegistry _registry, ChugSplashManager _manager, bytes32 _organizationID, address _newOwner, bool _allowManagedProposals) internal {
        if (!isProjectClaimed(_registry, address(_manager))) {
            bytes memory initializerData = abi.encode(_manager, _organizationID, _allowManagedProposals);

            _registry.finalizeRegistration(_organizationID, _newOwner, getCurrentChugSplashManagerVersion(), initializerData);
        } else {
            address existingOwner = _manager.owner();
            if (existingOwner != _newOwner) {
                revert(string.concat("ChugSplash: project already owned by: ", toString(existingOwner)));
            } else {
                // TODO: spinner
            }
        }
    }

    function isProjectClaimed(ChugSplashRegistry _registry, address _manager) internal view returns (bool) {
        return _registry.managerProxies(_manager);
    }

    function proposeChugSplashDeployment(ChugSplashManager _manager, bytes32 _deploymentId, ChugSplashBundles memory _bundles, string memory _configUri, ProposalRoute _route) internal {
        if (!_manager.isProposer(msg.sender)) {
            revert(string.concat("ChugSplash: caller is not a proposer. Caller's address: ", toString(msg.sender)));
        }

        if (_route == ProposalRoute.RELAY || _route == ProposalRoute.REMOTE_EXECUTION) {
            ffiCommitToIPFS();
        }

        if (_route == ProposalRoute.RELAY) {
            ffiRelayProposal();
        } else {
            _manager.propose(
                bundles.actionBundle.root,
                bundles.targetBundle.root,
                bundles.actionBundle.actions.length,
                bundles.targetBundle.targets.length,
                getNumActions(bundles.actionBundle).numDeployContractActions,
                configUri,
                route == ProposalRoute.REMOTE_EXECUTION
            );
        }
    }

    function approveDeployment(bytes32 _deploymentId, ChugSplashManager _manager) internal {
        address projectOwner = _manager.owner();
        if (msg.sender != projectOwner) {
            revert(string.concat("ChugSplash: caller is not the project owner. Caller's address: ", toString(msg.sender). "Owner's address: ", toString(projectOwner)));
        }
        _manager.approve(_deploymentId);
    }

    function completeDeployment(ChugSplashManager _manager, OptionalAddress _newOwner) internal {
        if (_newOwner.exists) {
            transferProjectOwnership(_manager, _newOwner.value);
        }

        ffiCompleteDeployment();
    }

    function transferProjectOwnership(ChugSplashManager _manager, address _newOwner) internal {
        if (_newOwner != _manager.owner()) {
            if (_newOwner == address(0)) {
                _manager.renounceOwnership();
            } else {
                _manager.transferOwnership(_newOwner);
            }
        }
    }
}
