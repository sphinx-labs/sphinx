
library Deploy {
    // - bundles, configUri (used only for logs)
    struct TODO {
        bytes32 organizationID;
        string memory projectName;
    }


    // TODO: spinner
    // TODO(test):
    // - etherscan verification: https://book.getfoundry.sh/tutorials/solidity-scripting. i'd be
    //   surprised if this works since we deploy contracts in a non-standard way
    // TODO(inputs):
    // TODO(overload):
    // - newOwner (not necessary for `finalizeRegistration`)
    function deploy(TODO memory _structTODO) internal {
        (bytes32 organizationID, string memory projectName) = _structTODO;

        ChugSplashManager manager = getChugSplashManager(organizationID);

        // TODO: what happens to msg.sender when startBroadcast(addr) is used?
        finalizeRegistration(manager, organizationID, msg.sender, false, projectName);
    }

    function finalizeRegistration(ChugSplashManager _manager, bytes32 _organizationID, address _newOwner, bool _allowManagedProposals, string memory _projectName) internal {
        if (!isProjectClaimed(address(_manager))) {
            bytes memory initializerData = abi.encode(_manager, _organizationID, _allowManagedProposals);

            ChugSplashRegistry registry = getChugSplashRegistry();
            registry.finalizeRegistration(_organizationID, _newOwner, getCurrentChugSplashManagerVersion(), initializerData);
        } else {
            address existingOwnerAddress = getProjectOwnerAddress(address(_manager));
            if (existingOwnerAddress != _newOwner) {
                revert("ChugSplash: project already claimed by another address");
            } else {
                // TODO: spinner
            }
        }
    }
}
