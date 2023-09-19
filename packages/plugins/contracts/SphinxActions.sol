// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { SphinxAction } from "./foundry/SphinxPluginTypes.sol";

// TODO(refactor): change name of this contract b/c it's not just for actions

// TODO(docs): this is a standalone contract that's deployed at a consistent address,
// which makes it easy for off-chain tooling to retrieve the actions that were collected
// during a deployment.
contract SphinxActions {

    SphinxAction[] private actions;

    address public immutable sphinx;
    constructor() {
        sphinx = msg.sender;
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

    // TODO(docs): we need to define this getter explicitly for the same reason
    // that we had to for the `SphinxManager.deployments` mapping.
    function getAction(uint256 _i) external view returns (SphinxAction memory) {
        return actions[_i];
    }

    function getAllActions() external view returns (SphinxAction[] memory) {
        return actions;
    }
}
