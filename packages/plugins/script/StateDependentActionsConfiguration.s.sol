// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {
    SphinxConfig,
    Network,
    DeployOptions,
    DefineOptions,
    Version
} from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
import { SphinxClient } from "../client/SphinxClient.sol";
import { StateDependentActions, Box } from "../contracts/test/StateDependentActions.sol";
import {
    StateDependentActionsClient,
    BoxClient
} from "../client/StateDependentActions.c.sol";

/**
 * @title StateDependentActionsConfiguration
 * @dev Configuration script testing a more complex set of actions that depends on maintaining
 *      the correct state within the client contract both in the constructor and subsequent actions.
 *      See StateDependentActions.t.sol for corresponding tests.
 * Tests:
 *      - Deploying a contract within a constructor and modifying the state in that contract
 *      - Setting the address of a contract within a constructor and modifying the state in
 *        that contract from the same constructor
 *      - Modifying the state of a contract from a function called on the client contract
 */
contract StateDependentActionsConfiguration is SphinxClient {
    StateDependentActions stateDependentActions;

    constructor() {
        sphinxConfig.projectName = "StateDependent";
        sphinxConfig.owners = [0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266];
        sphinxConfig.mainnets = [Network.ethereum];
        sphinxConfig.testnets = [Network.goerli];
        sphinxConfig.threshold = 1;
    }

    function deploy(Network _network) public override sphinx(_network) {
        BoxClient boxClient = deployBox(2);
        boxClient.addValue(3);
        StateDependentActionsClient client = deployStateDependentActions(address(boxClient), 1);
        client.setMultiple(3);
        stateDependentActions = StateDependentActions(address(client));
    }
}
