// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { SphinxAction, PreviousInfo, ChainInfo, SphinxConfig } from "./foundry/SphinxPluginTypes.sol";

// TODO(refactor): change name of this contract b/c it's not just for actions

struct InitialState {
    bool isManagerDeployed;
    bool firstProposalOccurred;
    bool isExecuting;
    bool isLiveNetwork;
    PreviousInfo prevConfig;
}

// TODO(docs): this is a standalone contract that's deployed at a consistent address,
// which makes it easy for off-chain tooling to retrieve the actions that were collected
// during a deployment.
contract SphinxActions {

    // TODO: i think we need to remove the initial state at the same time that we do
    // removeAllActions.

    ChainInfo private chainInfo;

    // TODO(docs): we only use this when doing the live network flow, not the in-process flow.
    InitialState public initialState;

    SphinxAction[] private actions;
    SphinxConfig private newConfig;

    address public immutable sphinx;
    address private immutable auth;
    address private immutable manager;
    constructor(address _auth, address _manager, SphinxConfig memory _newConfig) {
        sphinx = msg.sender;
        auth = _auth;
        manager = _manager;
        newConfig = _newConfig;
    }

    function addSphinxAction(SphinxAction memory _action) public {
        actions.push(_action);
    }

    function removeAllActions() external {
        delete actions;
    }

    function numActions() external view returns (uint256) {
        return actions.length;
    }

    // TODO(docs): we need to define these getters explicitly for the same reason
    // that we had to for the `SphinxManager.deployments` mapping.
    function getAction(uint256 _i) external view returns (SphinxAction memory) {
        return actions[_i];
    }
    function getChainInfo() external view returns (ChainInfo memory) {
        return chainInfo;
    }

    function getAllActions() external view returns (SphinxAction[] memory) {
        return actions;
    }

    function setChainInfo(
        bool _isLiveNetwork,
        PreviousInfo memory _prevConfig
    ) external {
        chainInfo.authAddress = auth;
        chainInfo.managerAddress = manager;
        chainInfo.chainId = block.chainid;
        chainInfo.actionsTODO = actions;
        chainInfo.newConfig = newConfig;
        chainInfo.isLiveNetwork = _isLiveNetwork;
        chainInfo.prevConfig = _prevConfig;
    }
}
