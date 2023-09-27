// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;
pragma experimental ABIEncoderV2;

import "forge-std/console.sol";

import { VmSafe, Vm } from "forge-std/Vm.sol";
import { console } from "forge-std/console.sol";

import { IAccessControl } from "@sphinx-labs/contracts/contracts/interfaces/IAccessControl.sol";
import { ISemver } from "@sphinx-labs/contracts/contracts/interfaces/ISemver.sol";
import { ISphinxRegistry } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxRegistry.sol";
import { ISphinxAuthLibrary } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import { ISphinxAuthFactory } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuthFactory.sol";
import { IOwnable } from "@sphinx-labs/contracts/contracts/interfaces/IOwnable.sol";
import {
    DeploymentState,
    Version,
    DeploymentStatus,
    RawSphinxAction,
    SphinxActionType,
    AuthState,
    AuthLeafType
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import {
    BundledSphinxAction,
    SphinxTarget,
    BundledSphinxTarget,
    SphinxActionBundle,
    SphinxTargetBundle,
    FoundryConfig,
    BundleInfo,
    FoundryContractConfig,
    OptionalAddress,
    HumanReadableAction,
    Network,
    SphinxAction,
    SphinxConfig,
    BundleInfo,
    PreviousInfo,
    ChainInfo,
    SphinxAuthBundle,
    BundledAuthLeaf,
    SphinxMode
} from "./SphinxPluginTypes.sol";
import { ISphinxUtils } from "./interfaces/ISphinxUtils.sol";
import { StdUtils } from "forge-std/StdUtils.sol";
import { SphinxContractInfo, SphinxConstants } from "./SphinxConstants.sol";

// TODO: we may want to document the fact that broadcasting on anvil doesn't work exactly
// broadcasting on live networks. in particular, on live networks, broadcasting only occurs
// if the user specifies --broadcast, --rpc-url, and vm.startBroadcast (i think). on anvil,
// it works if the user just does vm.startBroadcast without --broadcast. it also works on
// the first run if the user doesn't include --rpc-url too, but it fails on subsequent runs
// because the in-process state isn't updated with the deployment, whereas the node is.

abstract contract Sphinx is StdUtils, SphinxConstants {
    // TODO: open a ticket in foundry that the getMappingLength is broken

    // TODO(docs): above constructor: you shouldn't execute any state-changing transactions or deploy any contracts
    // inside this constructor b/c this will happen:
    // 1. do stuff in constructor
    // 2. user does `function run() { vm.createSelectFork(...); deploy(...); }`
    // 3. deploy(...) will fail b/c stuff in constructor wasn't executed in the new fork.
    // If you need to execute transactions/deploy contracts, do so in the sphinxDeploy modifier.

    // TODO: you should do this: "If we want, it'd be pretty easy to enforce that live network
    // deployments happen via npx sphinx deploy and not by running a forge script"

    // TODO: if you decide to use the fast deployment logic for anvil, you should probably
    // run the pre-diff simulation against the live network logic, since this'd help prevent
    // against bugs caused by different local and live logic.

    // TODO(docs): answer the question, " why does the SphinxAction have so many things encoded in
    // the data field instead of stored as their own fields?"
    SphinxAction[] private actions;

    // TODO: i think we need to remove the initial state at the same time that we do
    // removeAllActions.

    ChainInfo private chainInfo;

    SphinxConfig private sphinxConfig;
    bytes private authData;

    // TODO: is there anything we can remove from the SphinxAction struct?

    // TODO(md): forge-std needs to be 1.6.1

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    // TODO(docs): this is *not* deployed for the in-process deployment flow, which boosts
    // performance.
    ISphinxUtils internal sphinxUtils;

    SphinxMode public mode;

    string private rpcUrl;
    bool private isLiveNetwork_;

    // Get owner address
    uint private key = vm.envOr("SPHINX_INTERNAL__OWNER_PRIVATE_KEY", uint(0));
    address private systemOwnerAddress =
        key != 0 ? vm.rememberKey(key) : 0x226F14C3e19788934Ff37C653Cf5e24caD198341;

    string private rootPath =
        vm.envOr("DEV_FILE_PATH", string("./node_modules/@sphinx-labs/plugins/"));
    string private rootFfiPath = string(abi.encodePacked(rootPath, "dist/foundry/"));
    string internal mainFfiScriptPath = string(abi.encodePacked(rootFfiPath, "index.js"));

    ISphinxManager internal immutable manager;
    ISphinxAuthLibrary private immutable auth;
    PreviousInfo private prevInfo;

    // TODO: rm?
    // // TODO(docs): these values can be overridden by the user in their constructor.
    // // TODO(docs): these fields must be defined for every deployment.
    // string internal projectName;
	// address[] internal owners;
	// Version internal version;
    // // These fields must be defined if the user is using the DevOps platform.
    // string internal orgId;
	// address[] internal proposers;
	// Network[] internal mainnets;
	// Network[] internal testnets;
	// uint256 internal threshold;

    constructor(SphinxConfig memory _sphinxConfig) {
        sphinxConfig = _sphinxConfig;

        if (sphinxConfig.owners.length == 1 && sphinxConfig.proposers.length == 0) {
            sphinxConfig.proposers.push(sphinxConfig.owners[0]);
        }

        // Sort the owners in ascending order. This is required to calculate the address of the
        // SphinxAuth contract, which determines the CREATE3 addresses of the user's contracts.
        address[] memory sortedOwners = sortAddresses(sphinxConfig.owners);

        authData = abi.encode(sortedOwners, sphinxConfig.threshold);
        bytes32 authSalt = keccak256(abi.encode(authData, sphinxConfig.projectName));

        address authAddress = computeCreate2Address(
                authSalt,
                authProxyInitCodeHash,
                authFactoryAddress
            );
        auth = ISphinxAuthLibrary(authAddress);
        bytes32 sphinxManagerSalt = keccak256(abi.encode(authAddress, sphinxConfig.projectName, hex""));
        manager = ISphinxManager(computeCreate2Address(
                sphinxManagerSalt,
                managerProxyInitCodeHash,
                registryAddress
            ));
    }

    // TODO(refactor): can we make the sphinxutils contract a library so that we can remove these
    // delegatecalls? or perhaps we can just remove the delegatecalls and use the sphinxutils
    // contract directly. or, maybe the easiest solution is to just put the necessary functions
    // in the Sphinx.sol contract. we'd want to time it to be sure that it doesn't cause a noticeable regression.

    function initializeSphinx(string memory _rpcUrl) internal {
        (bool success, bytes memory retdata) = address(sphinxUtils).delegatecall(
            abi.encodeWithSelector(
                ISphinxUtils.initialize.selector,
                _rpcUrl,
                mainFfiScriptPath,
                systemOwnerAddress
            )
        );
        require(success, string(sphinxUtils.removeSelector(retdata)));
    }

    // TODO: when you do the next contract upgrade:
    // 1. add an equivalent of manager.isExecuting() and/or activeBundleId in the SphinxAuth
    //     contract, then remove the `fetchCanonicalConfig` logic. consider the case where there's
    //     more than one active auth bundle. i think you'll want a "numActiveAuthBundles" instead of
    //     a boolean for this reason. after you do this, you should add a check in the propose
    //     function in solidity.

    function preview(string memory _networkName, string memory _chainInfoPath) external {
        require(sphinxConfig.owners.length == 1, "Sphinx: There must be a single address in the 'owners' array.");
        address owner = sphinxConfig.owners[0];
        Network network = findNetworkInfoByName(_networkName).network;
        vm.startBroadcast(owner);
        deploy(network);
        vm.stopBroadcast();
        vm.writeFile(_chainInfoPath, vm.toString(abi.encode(chainInfo)));
    }

    function deploy(string memory _networkName) external {
        require(sphinxConfig.owners.length == 1, "Sphinx: There must be a single address in the 'owners' array.");
        address owner = sphinxConfig.owners[0];
        Network network = findNetworkInfoByName(_networkName).network;
        vm.startBroadcast(owner);
        deploy(network);
        vm.stopBroadcast();
    }

    function propose(bool _testnets, string memory _chainInfoPath) external {
        Network[] memory networks = _testnets ? sphinxConfig.testnets : sphinxConfig.mainnets;

        // TODO(docs): these checks are specific to proposals because these arrays aren't used in the
        // standard deploy task, which occurs on one network at a time.
        require(networks.length > 0, string(abi.encodePacked("Sphinx: There must be at least one network in your ", _testnets ? "'testnets'" : "'mainnets", " array.")));
        require(sphinxConfig.proposers.length > 0, "Sphinx: There must be at least one proposer in your 'proposers' array.");
        require(bytes(sphinxConfig.orgId).length > 0, "Sphinx: Your 'orgId' cannot be an empty string. Please retrieve it from Sphinx's UI.");
        uint256 proposerPrivateKey = vm.envOr("PROPOSER_PRIVATE_KEY", uint256(0));
        require(proposerPrivateKey != 0, "Sphinx: You must set the 'PROPOSER_PRIVATE_KEY' environment variable to propose a deployment.");
        address proposer = vm.addr(proposerPrivateKey);

        mode = SphinxMode.Proposal;

        ChainInfo[] memory chainInfoArray = new ChainInfo[](networks.length);
        for (uint256 i = 0; i < networks.length; i++) {
            Network network = networks[i];
            NetworkInfo memory networkInfo = getNetworkInfo(network);

            bool firstProposalOccurred = address(auth).code.length > 0 ? auth.firstProposalOccurred() : false;
            if (firstProposalOccurred) {
                require(auth.hasRole(keccak256("ProposerRole"), proposer), string(abi.encodePacked("Sphinx: The address ", vm.toString(proposer), " is not currently a proposer on ", networkInfo.name, ".")));
            } else {
                require(arrayContainsAddress(sphinxConfig.proposers, proposer), string(abi.encodePacked("Sphinx: The address corresponding to your 'PROPOSER_PRIVATE_KEY' env variable is not in\n your 'proposers' array. Please add it. Address: ", vm.toString(proposer))));
            }

            // TODO(docs): `vm.createSelectFork` sets the` `block.chainid` to the target chain (e.g.
            // 1 for ethereum mainnet).
            vm.createSelectFork(vm.rpcUrl(networkInfo.name));

            // TODO(docs): we enable broadcasting to simulate the live network deployment flow
            // within the `deploy` function. this doesn't actually broadcast the transactions onto
            // the live network unless the forge script is invoked with the `--broadcast` flag on
            // the CLI, which doesn't occur within Sphinx's proposal task.
            vm.startPrank(proposer); // TODO(docs): prank sets callerMode.msgSender to the proposer's address.
            deploy(network);
            vm.stopPrank();

            console.log('registry', registryAddress);
            vm.makePersistent(registryAddress);

            chainInfoArray[i] = chainInfo;
        }

        (bytes32 authRoot, BundleInfo[] memory bundleInfoArray) = getBundleInfo(chainInfoArray);

        for (uint256 i = 0; i < bundleInfoArray.length; i++) {
            BundleInfo memory bundleInfo = bundleInfoArray[i];
            NetworkInfo memory networkInfo = findNetworkInfoByName(bundleInfo.networkName);

            vm.createSelectFork(vm.rpcUrl(networkInfo.name));

            // TODO(docs): we enable broadcasting to simulate the live network deployment flow
            // within the `deploy` function. this doesn't actually broadcast the transactions onto
            // the live network unless the forge script is invoked with the `--broadcast` flag on
            // the CLI, which doesn't occur within Sphinx's proposal task.
            vm.startPrank(proposer); // TODO(docs): prank sets callerMode.msgSender to the proposer's address.
            deployOnNetwork(authRoot, bundleInfo, proposer);
            vm.stopPrank();
        }

        vm.writeFile(_chainInfoPath, vm.toString(abi.encode(chainInfoArray)));
    }

    // TODO: case: say a user wants to broadcast their deployment onto anvil, but there are
    // multiple owners. i don't think we currently support this.

    // TODO: if config.owners.length == 1 and proposers.length == 0, then make the owner a proposer.

    function getBundleInfo(
        ChainInfo[] memory _chainInfoArray
    ) private returns (bytes32, BundleInfo[] memory) {
        (bool success, bytes memory retdata) = address(sphinxUtils).delegatecall(
            abi.encodeWithSelector(
                ISphinxUtils.ffiGetEncodedBundleInfo.selector,
                _chainInfoArray,
                rootFfiPath
            )
        );
        require(success, string(sphinxUtils.removeSelector(retdata)));
        bytes memory encodedData = abi.decode(retdata, (bytes));
        return decodeBundleInfo(_chainInfoArray, encodedData);
    }

    // TODO(docs): can't decode all at once b/c of "stack too deep" error.
    function decodeBundleInfo(ChainInfo[] memory _chainInfoArray, bytes memory _encodedData) private pure returns (bytes32, BundleInfo[] memory) {
        string memory json = string(_encodedData);

        BundleInfo[] memory bundleInfoArray = new BundleInfo[](_chainInfoArray.length);
        for (uint256 i = 0; i < _chainInfoArray.length; i++) {
            ChainInfo memory chainInfo = _chainInfoArray[i];
            string memory networkName = findNetworkInfoByChainId(chainInfo.chainId).name;

            string memory rootJsonField = string(abi.encodePacked(".chains.", networkName, ".humanReadableActionsAbiEncoded"));
            string memory configUri = vm.parseJsonString(json, string(abi.encodePacked(".chains.", networkName, ".configUri")));
            HumanReadableAction[] memory humanReadableActions = abi.decode(
                vm.parseJsonBytes(json, string(abi.encodePacked(".chains.", networkName, ".humanReadableActionsAbiEncoded"))),
                (HumanReadableAction[])
            );
            bytes32 actionRoot = vm.parseJsonBytes32(json, string(abi.encodePacked(".chains.", networkName, ".actionBundle.root")));
            BundledSphinxAction[] memory bundledActions = abi.decode(
                vm.parseJsonBytes(json, string(abi.encodePacked(".chains.", networkName, ".actionBundle.actionsAbiEncoded"))),
                (BundledSphinxAction[])
            );
            SphinxTargetBundle memory targetBundle = abi.decode(
                vm.parseJsonBytes(json, string(abi.encodePacked(".chains.", networkName, ".targetBundleAbiEncoded"))),
                (SphinxTargetBundle)
            );
            BundledAuthLeaf[] memory authLeafs = abi.decode(
                vm.parseJsonBytes(json, string(abi.encodePacked(".chains.", networkName, ".authBundle.authLeafsAbiEncoded"))),
                (BundledAuthLeaf[])
            );

            bundleInfoArray[i] = BundleInfo({
                networkName: networkName,
                configUri: configUri,
                humanReadableActions: humanReadableActions,
                actionBundle: SphinxActionBundle({ root: actionRoot, actions: bundledActions }),
                targetBundle: targetBundle,
                authLeafs: authLeafs
            });
        }

        bytes32 authRoot = vm.parseJsonBytes32(json, ".authRoot");

        return (
            authRoot,
            bundleInfoArray);
    }

    function register(
        bytes memory _authData,
        string memory _projectName
    ) private {
        ISphinxAuthFactory authFactory = ISphinxAuthFactory(authFactoryAddress);
        bytes32 authSalt = keccak256(abi.encode(_authData, _projectName));
        bool isRegistered = address(authFactory.auths(authSalt)) != address(0);
        if (!isRegistered) {
            authFactory.deploy{ gas: 2000000 }(_authData, hex"", _projectName);
        }
    }

    function transferProjectOwnership(
        ISphinxManager _manager,
        address _newOwner,
        address _currOwner
    ) private {
        if (_newOwner != _currOwner) {
            if (_newOwner == address(0)) {
                IOwnable(address(_manager)).renounceOwnership();
            } else {
                IOwnable(address(_manager)).transferOwnership(_newOwner);
            }
        }
    }

    /**
     * Helper function for executing a list of actions in batches.
     */
    function executeBatchActions(
        BundledSphinxAction[] memory bundledActions,
        bool isSetStorageActionArray,
        uint bufferedGasLimit
    ) private returns (DeploymentStatus, uint) {
        // Pull the deployment state from the contract to make sure we're up to date
        bytes32 activeDeploymentId = manager.activeDeploymentId();
        DeploymentState memory state = manager.deployments(activeDeploymentId);

        BundledSphinxAction[] memory filteredActions = sphinxUtils.removeExecutedActions(
            bundledActions,
            state.actionsExecuted
        );

        // We can return early if there are no actions to execute.
        if (filteredActions.length == 0) {
            return (state.status, 0);
        }

        uint executed = 0;
        while (executed < filteredActions.length) {
            // Figure out the maximum number of actions that can be executed in a single batch
            uint batchSize = sphinxUtils.findMaxBatchSize(
                sphinxUtils.inefficientSlice(filteredActions, executed, filteredActions.length),
                bufferedGasLimit - ((bufferedGasLimit) * 20) / 100
            );
            BundledSphinxAction[] memory batch = sphinxUtils.inefficientSlice(
                filteredActions,
                executed,
                executed + batchSize
            );
            (RawSphinxAction[] memory rawActions, bytes32[][] memory _proofs) = sphinxUtils
                .disassembleActions(batch);

            // Execute the batch of actions.
            if (isSetStorageActionArray) {
                manager.setStorage{ gas: bufferedGasLimit }(rawActions, _proofs);
            } else {
                // manager.executeInitialActions{ gas: bufferedGasLimit }(rawActions, _proofs);
                // TODO(refactor): can we remove this low-level call in favor of the command above?
                // if not, we should document why.
                (bool success, bytes memory result) = address(manager).call{
                    gas: bufferedGasLimit
                }(
                    abi.encodeWithSignature(
                        "executeInitialActions((uint8,uint256,bytes)[],bytes32[][])",
                        rawActions,
                        _proofs
                    )
                );
                if (!success) {
                    uint256 failureIndex;
                    assembly {
                        failureIndex := mload(add(result, 0x24))
                    }

                    return (DeploymentStatus.FAILED, failureIndex);
                }
            }

            // Return early if the deployment failed.
            state = manager.deployments(activeDeploymentId);
            if (state.status == DeploymentStatus.FAILED) {
                return (state.status, 0);
            }

            // Move to next batch if necessary
            executed += batchSize;
        }

        // Return the final deployment status
        return (state.status, 0);
    }

    function executeDeployment(
        BundleInfo memory bundleInfo,
        uint256 blockGasLimit
    ) private returns (bool, HumanReadableAction memory) {
        // TODO(docs)
        HumanReadableAction memory emptyAction;

        (
            BundledSphinxAction[] memory initialActions,
            BundledSphinxAction[] memory setStorageActions
        ) = sphinxUtils.splitActions(bundleInfo.actionBundle.actions);


        uint bufferedGasLimit = ((blockGasLimit / 2) * 120) / 100;
        // Execute all the deploy contract actions and exit early if the deployment failed
        (DeploymentStatus status, uint failedActionIndex) = executeBatchActions(
            initialActions,
            false,
            bufferedGasLimit
        );
        if (status == DeploymentStatus.FAILED) {
            // Return with the relevant human readable action
            return (false, bundleInfo.humanReadableActions[failedActionIndex]);
        } else if (status == DeploymentStatus.COMPLETED) {
            return (true, emptyAction);
        }

        // Dissemble the set storage actions
        SphinxTarget[] memory targets = new SphinxTarget[](bundleInfo.targetBundle.targets.length);
        bytes32[][] memory proofs = new bytes32[][](bundleInfo.targetBundle.targets.length);
        for (uint i = 0; i < bundleInfo.targetBundle.targets.length; i++) {
            BundledSphinxTarget memory target = bundleInfo.targetBundle.targets[i];
            targets[i] = target.target;
            proofs[i] = target.siblings;
        }

        // Start the upgrade
        manager.initiateUpgrade{ gas: 1000000 }(targets, proofs);

        // Execute all the set storage actions
        executeBatchActions(setStorageActions, true, bufferedGasLimit);

        // Complete the upgrade
        manager.finalizeUpgrade{ gas: 1000000 }(targets, proofs);

        return (true, emptyAction);
    }

    // TODO(test): test the time difference between deploying hai on anvil using the fast approach
    // and the slow approach.

    // TODO: case: the user calls `deploy(Network)` twice in a single `run()` on the in-process anvil node. on the second deploy,
    // the "sphinxManager" should have updated values (e.g. callNonces mapping.

    /**
     * @notice Returns the number of times a call hash has been attempted in this deployment.
     */
    function getCallCountInDeployment(bytes32 _callHash) public view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < actions.length; i++) {
            SphinxAction memory action = actions[i];
            if (action.actionType == SphinxActionType.CALL) {
                (address to, bytes4 selector, bytes memory functionArgs, , ) = abi.decode(action.data, (address, bytes4, bytes, uint256, string));
                bytes memory encodedCall = abi.encodePacked(selector, functionArgs);
                bytes32 callHash = keccak256(abi.encode(to, encodedCall));
                if (callHash == _callHash) {
                    count += 1;
                }
            }
        }
        return count;
    }

    // TODO: the user needs to inherit this modifier.
    modifier sphinxDeploy(Network _network) {
        (VmSafe.CallerMode callerMode, address msgSender, ) = vm.readCallers();
        require(
            callerMode != VmSafe.CallerMode.Broadcast,
            "Cannot call Sphinx using vm.broadcast. Please use vm.startBroadcast instead."
        );
        require(
            callerMode != VmSafe.CallerMode.Prank,
            "Cannot call Sphinx using vm.prank. Please use vm.startPrank instead."
        );

        // TODO(docs): we allow startPrank so that users don't need to toggle it when calling
        // `deploy`. however, we turn it off at the beginning of this modifier because we
        // prank the SphinxManager, which deploys the contracts. we toggle it back on at the
        // end of this modifier.
        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.stopPrank();
        else if (callerMode == VmSafe.CallerMode.RecurrentBroadcast) {
            mode = SphinxMode.Broadcast;
            vm.stopBroadcast();
        }

        if (mode != SphinxMode.DeployLocal) {
            // Get the creation bytecode of the SphinxUtils contract. We only load this when the
            // user is broadcasting because it's not necessary for deployments on the in-process
            // node, which speeds up that deployment process. We load the creation code directly
            // from a JSON file instead of importing it into this contract because this speeds up
            // the compilation process of contracts that inherit from this contract.
            bytes memory utilsCreationCode = vm.getCode(
                string(abi.encodePacked(rootPath, "out/artifacts/SphinxUtils.sol/SphinxUtils.json"))
            );
            address utilsAddr;
            assembly {
                utilsAddr := create2(0, add(utilsCreationCode, 0x20), mload(utilsCreationCode), 0)
            }
            require(utilsAddr != address(0), "Sphinx: failed to deploy SphinxUtils contract");
            sphinxUtils = ISphinxUtils(utilsAddr);
            // TODO(docs): required in a multi-fork setup, i.e. proposals
            vm.makePersistent(utilsAddr);

            // TODO(refactor): maybe these should be in an "initial state" struct or something?
            // would probably be clearer. Also, this is only needed for the broadcast flow, but it's
            // defined globally, which isn't ideal. same with sphinxUtils, rpcUrl, isLiveNetwork_,
            // chainInfo (not actions), and probably other variables too.
            prevInfo = getPrevConfig();

            rpcUrl = vm.rpcUrl(getNetworkInfo(_network).name);
            isLiveNetwork_ = isLiveNetwork(rpcUrl);
        }

        validateTODO(_network);

        // TODO(docs): this is from the old plugin: Next, we deploy and initialize the Sphinx
        // contracts. If we're in a recurrent broadcast or prank, we temporarily stop it before we
        // initialize the contracts. We disable broadcasting because we can't call vm.etch from
        // within a broadcast. We disable pranking because we need to prank the owner of the Sphinx
        // contracts when initializing the Sphinx contracts.
        if (mode == SphinxMode.Broadcast) liveNetworkValidation(msgSender);

        if (mode == SphinxMode.Broadcast || mode == SphinxMode.Proposal) initializeSphinx(rpcUrl);

        // TODO(docs): if we call this when broadcasting, the `authFactory.register` call will throw
        // an error b/c the sphinxmanager already exists.
        if (mode == SphinxMode.DeployLocal) sphinxDeployManagerTo(address(manager));

        delete actions;

        // TODO: should you delete any of the other fields in ChainInfo?

        vm.startPrank(address(manager));
        _;
        vm.stopPrank();

        // TODO(refactor): i don't like that there's an isBroadcast variable but we don't use it in this modifier.
        // you set isBroadcast at the very beginning of the modifier and use it throughout.

        for (uint i = 0; i < actions.length; i++) {
            // TODO: do you need to do the DEPLOY_CONTRACT stuff for both deployment flows?
            SphinxAction memory action = actions[i];
            // Set the contract's final runtime bytecode to its actual bytecode instead of its
            // client's bytecode. This ensures that the user will be interacting with their exact
            // contract after the deployment completes.
            // TODO(docs): we do this even if the contract deployment was skipped because a client
            // is used regardless.
            if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                (, , bytes32 userSalt, string memory referenceName) = abi.decode(action.data, (bytes, bytes, bytes32, string));
                bytes32 sphinxCreate3Salt = keccak256(abi.encode(referenceName, userSalt));
                address create3Address = computeCreate3Address(address(manager), sphinxCreate3Salt);
                // The implementation's address is the CREATE3 address minus one.
                address impl = address(uint160(create3Address) - 1);
                vm.etch(create3Address, impl.code);
            } else if (action.actionType == SphinxActionType.DEFINE_CONTRACT) {
                (address to, ) = abi.decode(action.data, (address, string));
                // The implementation's address is the current address minus one.
                address impl = address(uint160(address(to)) - 1);
                vm.etch(address(to), impl.code);
            } else if (action.actionType == SphinxActionType.CALL && mode == SphinxMode.DeployLocal) {
                // TODO(docs): we update the sphinxManager at the end of the deployment because this
                // mimics what happens on a live network.
                (address to, bytes4 selector, bytes memory functionArgs, , ) = abi.decode(action.data, (address, bytes4, bytes, uint256, string));
                bytes memory encodedCall = abi.encodePacked(selector, functionArgs);
                bytes32 callHash = keccak256(abi.encode(to, encodedCall));
                bytes32 mappingValueSlotKey = getMappingValueSlotKey(callNoncesSlotKey, callHash);
                vm.store(address(manager), mappingValueSlotKey, bytes32(getCallCountInDeployment(callHash)));
            }
        }
        if (mode == SphinxMode.Proposal) {
            setChainInfo(
                isLiveNetwork_, prevInfo, sphinxConfig, mode
            );
        } else if (mode == SphinxMode.Broadcast) {
            setChainInfo(
                isLiveNetwork_, prevInfo, sphinxConfig, mode
            );

            ChainInfo[] memory chainInfoArray = new ChainInfo[](1);
            chainInfoArray[0] = chainInfo;
            (bytes32 authRoot, BundleInfo[] memory bundleInfoArray) = getBundleInfo(chainInfoArray);
            require(bundleInfoArray.length == 1, "Sphinx: TODO(docs). Should never happen.");
            BundleInfo memory bundleInfo = bundleInfoArray[0];

            deployOnNetwork(authRoot, bundleInfo, msgSender);
        }

        if (callerMode == VmSafe.CallerMode.RecurrentPrank) vm.startPrank(msgSender);
    }

    function deployOnNetwork(bytes32 _authRoot, BundleInfo memory _bundleInfo, address _msgSender) private {
        ISphinxRegistry registry = sphinxUtils.getSphinxRegistry();

        // TODO(refactor): all messages in this function should include the network name.

        if (_bundleInfo.authLeafs.length == 0) {
            console.log("Nothing to execute in this deployment. Exiting early.");
            return;
        }

        if (mode == SphinxMode.Broadcast) vm.startBroadcast(_msgSender);
        else if (mode == SphinxMode.Proposal) vm.startPrank(_msgSender);

        register(authData, sphinxConfig.projectName);

        bytes32 deploymentId = sphinxUtils.getDeploymentId(
            _bundleInfo.actionBundle,
            _bundleInfo.targetBundle,
            _bundleInfo.configUri
        );
        DeploymentState memory deploymentState = manager.deployments(deploymentId);

        // TODO(refactor): should we actually revert in these cases, since this may be part of a multi-chain deployment?
        require(deploymentState.status != DeploymentStatus.CANCELLED, "Deployment was previously cancelled. Exiting early.");
        require(deploymentState.status != DeploymentStatus.FAILED, "Deployment previously failed. Exiting early.");
        if (deploymentState.status == DeploymentStatus.COMPLETED) {
            console.log('Deployment was already completed. Exiting early.');
        }

        if (deploymentState.status == DeploymentStatus.EMPTY) {
            bytes memory authRootSignature = signMetaTxnForAuthRoot(vm.envUint("PRIVATE_KEY"), _authRoot);
            bytes[] memory signatureArray = new bytes[](1);
            signatureArray[0] = authRootSignature;

            if (mode == SphinxMode.Proposal) {
                vm.store(address(auth), ownerThresholdSlotKey, bytes32(0));
            }

            (, uint256 leafsExecuted, ) = auth.authStates(_authRoot);
            for (uint i = 0; i < _bundleInfo.authLeafs.length; i++) {
                BundledAuthLeaf memory leaf = _bundleInfo.authLeafs[i];

                // TODO: check that the auth leafs are sorted according to their 'index' field. this
                // logic will break otherwise.

                if (leafsExecuted > leaf.leaf.index) {
                    continue;
                }

                if (leaf.leafType == AuthLeafType.SETUP) {
                    auth.setup{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        signatureArray,
                        leaf.proof
                    );
                } else if (leaf.leafType == AuthLeafType.PROPOSE) {
                    // TODO: wrap this in: if (proposer isn't already a proposer).
                    if (mode == SphinxMode.Proposal) {
                        bytes32 proposerRoleSlotKey = getMappingValueSlotKey(authAccessControlRoleSlotKey, keccak256("ProposerRole"));
                        bytes32 proposerMemberSlotKey = getMappingValueSlotKey(proposerRoleSlotKey, bytes32(uint256(uint160(_msgSender))));
                        vm.store(address(auth), proposerMemberSlotKey, bytes32(uint256(1)));
                    }

                    auth.propose{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        signatureArray,
                        leaf.proof
                    );
                }  else if (leaf.leafType == AuthLeafType.UPGRADE_MANAGER_AND_AUTH_IMPL) {
                    auth.upgradeManagerAndAuthImpl{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        signatureArray,
                        leaf.proof
                    );
                }  else if (leaf.leafType == AuthLeafType.APPROVE_DEPLOYMENT) {
                    auth.approveDeployment{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        signatureArray,
                        leaf.proof
                    );
                } else if (leaf.leafType == AuthLeafType.CANCEL_ACTIVE_DEPLOYMENT) {
                    auth.cancelActiveDeployment{ gas: 1000000 }(
                        _authRoot,
                        leaf.leaf,
                        signatureArray,
                        leaf.proof
                    );
                } else {
                    revert('Unsupported auth leaf type. Should never happen.');
                }
            }
            deploymentState.status = DeploymentStatus.APPROVED;
        }

        // TODO(docs)
        if (mode == SphinxMode.Proposal) {
            vm.stopPrank();
            addRemoteExecutor(_msgSender);
            vm.startPrank(_msgSender);
            manager.claimDeployment();
        }

        if (
            deploymentState.status == DeploymentStatus.APPROVED ||
            deploymentState.status == DeploymentStatus.INITIAL_ACTIONS_EXECUTED ||
            deploymentState.status == DeploymentStatus.PROXIES_INITIATED ||
            deploymentState.status == DeploymentStatus.SET_STORAGE_ACTIONS_EXECUTED
        ) {
            (bool executionSuccess, HumanReadableAction memory readableAction) = executeDeployment(
                _bundleInfo,
                block.gaslimit
            );

            if (!executionSuccess) {
                bytes memory revertMessage = abi.encodePacked(
                        "Sphinx: failed to execute deployment because the following action reverted: ",
                        readableAction.reason);

                revert(string(revertMessage));
            }
        }
    }

    // TODO: is it weird that the user defines a deploy(network) function, but never a
    // deploy(network, rpcUrl) function, then they are asked to call a function they
    // haven't defined when broadcasting? consider rethinking the UX.

    function deploy(Network _network) public virtual;

    // TODO: use-cases:
    // - in-process anvil node
    // - forked node:
    //   * via --rpc-url
    //   * via vm.createSelectFork
    // - broadcasting onto anvil node
    // - broadcasting onto live network

    // TODO: you should turn optimizer off in foundry.toml to ensure you don't get "stack too deep" error

    // TODO(refactor): prefix all error messages with "Sphinx", since errors in foundry
    // look like this:
    // Error:
    // SphinxClient: CREATE3 salt already used in this deployment. Please use a different 'salt' or 'referenceName'.

    // TODO: you should loosen the version of this file in case the user is using 0.7.x

    // TODO(notes):
    // - I think we should prepend "sphinx" to the variable names in all of the clients to avoid
    //   collisions with user-defined variables. E.g. if a user has a function param called "salt"
    //   and the logic in the corresponding client contract has a variable named "salt", then this
    //   could result in unexpected behavior. I started to do this in these contracts but I don't
    //   think it's exhaustive.

    // TODO: you should check that the functions in Sphinx.sol don't conflict with functions
    // that the user defines in their config.

    // TODO: move this to SphinxUtils, or at least Sphinx.sol
    function sortAddresses(address[] memory _unsorted) internal pure returns (address[] memory) {
        address[] memory sorted = _unsorted;
        for (uint i = 0; i < sorted.length; i++) {
            for (uint j = i + 1; j < sorted.length; j++) {
                if (sorted[i] > sorted[j]) {
                    address temp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = temp;
                }
            }
        }
        return sorted;
    }

    // TODO: benchmark performance between the live deployment flow and the `cast` flow when
    // broadcasting on anvil. after, discuss with ryan how we want to implement broadcasting
    // on anvil.

    // TODO: see if it'd be easy to estimate the gasused by each deployment and function call.
    // if so, you can remove the heuristics off-chain, and getEstDeploy...

    // TODO: the build info uses the real FQN, so i think you'll need to use them within the
    // contract too. make sure that FQNs work instead of the truncated FQNs in the solidity code,
    // then tell ryan.

    // TODO: mv
    function computeCreate3Address(
        address _deployer,
        bytes32 _salt
    ) internal pure returns (address) {
        // Hard-coded bytecode of the proxy used by Create3 to deploy the contract. See the `CREATE3.sol`
        // library for details.
        bytes memory proxyBytecode = hex"67_36_3d_3d_37_36_3d_34_f0_3d_52_60_08_60_18_f3";

        address proxy = computeCreate2Address(_salt, keccak256(proxyBytecode), _deployer);
        return computeCreateAddress(proxy, 1);
    }

    // Deploys specifically the sphinx manager contract to a target address.
    // We use a dedicated function for this b/c we need to do it using the raw bytes imported
    // from SphinxConstants.sol to avoid importing the manager itself and its entire dependency tree
    function sphinxDeployManagerTo(address where) internal {
        SphinxContractInfo[] memory contracts = getSphinxContractInfo();
        bytes memory managerCreationCodeWithArgs = contracts[1].creationCode;
        vm.etch(where, managerCreationCodeWithArgs);
        (bool success, bytes memory runtimeBytecode) = where.call("");
        require(
            success,
            "Sphinx: Failed to create runtime bytecode."
        );
        vm.etch(where, runtimeBytecode);
    }

    // TODO(docs): copied from stdcheats; faster than loading in that entire contract.
    function sphinxDeployCodeTo(string memory what, bytes memory args, address where) internal {
        bytes memory creationCode = vm.getCode(what);
        vm.etch(where, abi.encodePacked(creationCode, args));
        (bool success, bytes memory runtimeBytecode) = where.call("");
        require(
            success,
            "Sphinx: Failed to create runtime bytecode."
        );
        vm.etch(where, runtimeBytecode);
    }

    // TODO: the user currently inherits a bunch of functions/variables that shouldn't be exposed to
    // them. consider putting making the sphinx library contract a private var in the sphinx client,
    // just call into it. you should first check that this wouldn't mess up the fact that we need
    // to prank/use the sphinx manager for deployments and function calls.

    // TODO(test): define a constructor and function with the maximum number of allowed variables,
    // turn the optimizer off, and see if you get a stack too deep error.

    // TODO(docs): we can't use the FQN for `vm.getCode` because...

    // TODO(mv): pasted from SphinxAuth contract
    bytes32 private constant DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name)");
    bytes32 private constant DOMAIN_NAME_HASH = keccak256(bytes("Sphinx"));
    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(abi.encode(DOMAIN_TYPE_HASH, DOMAIN_NAME_HASH));
    bytes32 private constant TYPE_HASH = keccak256("AuthRoot(bytes32 root)");

    function signMetaTxnForAuthRoot(uint256 _privateKey, bytes32 _authRoot) private pure returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(TYPE_HASH, _authRoot));
        bytes32 typedDataHash = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, typedDataHash);
        return abi.encodePacked(r, s, v);
    }

// TODO(refactor): check that all error messages are prefixed with "Sphinx: "
    function validateTODO(Network _network) private view {
        // TODO(docs): these should be validated whether the deployment is occurring locally, broadcasting on live network, etc.
        require(bytes(sphinxConfig.projectName).length > 0, "Sphinx: Your 'projectName' field cannot be empty.");
        require(sphinxConfig.owners.length > 0, "Sphinx: Your 'owners' array cannot be empty.");
        require(sphinxConfig.version.major == major && sphinxConfig.version.minor == minor &&
            sphinxConfig.version.patch == patch, string(abi.encodePacked(
            "Sphinx: Your 'version' field must be ",
            vm.toString(major),
            ".",
            vm.toString(minor),
            ".",
            vm.toString(patch),
            "."
        )));
        require(sphinxConfig.threshold > 0, "Sphinx: Your 'threshold' field must be greater than 0.");
        require(sphinxConfig.owners.length >= sphinxConfig.threshold, "Sphinx: Your 'threshold' field must be less than or equal to the number of owners in your 'owners' array.");

        address[] memory duplicateOwners = getDuplicateElements(sphinxConfig.owners);
        address[] memory duplicateProposers = getDuplicateElements(sphinxConfig.proposers);
        Network[] memory duplicateMainnets = getDuplicateElements(sphinxConfig.mainnets);
        Network[] memory duplicateTestnets = getDuplicateElements(sphinxConfig.testnets);
        require(duplicateOwners.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'owners' array contains duplicate addresses: ",
            toString(duplicateOwners)
        )));
        require(duplicateProposers.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'proposers' array contains duplicate addresses: ",
            toString(duplicateProposers)
        )));
        require(duplicateMainnets.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'mainnets' array contains duplicate networks: ",
            toString(duplicateMainnets)
        )));
        require(duplicateTestnets.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'testnets' array contains duplicate networks: ",
            toString(duplicateTestnets)
        )));

        Network[] memory invalidMainnets = removeNetworkType(sphinxConfig.mainnets, NetworkType.Mainnet);
        require(invalidMainnets.length == 0, string(abi.encodePacked(
            "Sphinx: Your 'mainnets' array contains non-production networks: ",
            toString(invalidMainnets)
        )));
        Network[] memory invalidTestnets = removeNetworkType(sphinxConfig.testnets, NetworkType.Testnet);
        // TODO: uncomment. i temporarily disabled when debugging.
        // require(invalidTestnets.length == 0, string(abi.encodePacked(
        //     "Sphinx: Your 'testnets' array contains invalid test networks: ",
        //     toString(invalidTestnets)
        // )));

        require(block.chainid == getNetworkInfo(_network).chainId, string(abi.encodePacked("Sphinx: The 'block.chainid' does not match the chain ID of the network: ", getNetworkInfo(_network).name, "\nCurrent chain ID: ", vm.toString(block.chainid), "\nExpected chain ID: ", vm.toString(getNetworkInfo(_network).chainId))));
    }

    // TODO(docs): this is *only* for broadcasting deployments (not proposals). this can't be used
    // for proposals because the proposer isn't an owner of the SphinxAuth contract, which means
    // these checks would always fail for proposals.
    function liveNetworkValidation(address _msgSender) private view {
            require(sphinxConfig.owners.length == 1, "Sphinx: You can only deploy on a live network if there is only one owner in your 'owners' array.");
            // TODO(parse): you should check that the key corresponding to PRIVATE_KEY matches
            // CallerMode.msgSender. i don't think we currently do this.

            // TODO(parse): case: the user is trying to deploy locally but has a proposer that's
            // different from the signer. we may add the other account as a proposer in the auth
            // contract, which may prevent the signer from deploying again without using the DevOps
            // platform.

            address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
            require(_msgSender == deployer, string(abi.encodePacked("Sphinx: You must call 'vm.startBroadcast' with the address corresponding to the 'PRIVATE_KEY' in your '.env' file.\n",
                "Broadcast address: ",
                vm.toString(_msgSender),
                "\n",
                "Address corresponding to private key: ",
                vm.toString(deployer)
            )));
            require(
                deployer == sphinxConfig.owners[0],
                string(
                    abi.encodePacked(
                        "The deployer must match the owner in the 'owners' array.\n",
                        "Deployer: ",
                        vm.toString(deployer),
                        "\n",
                        "Owner: ",
                        vm.toString(sphinxConfig.owners[0])
                    )
                )
            );

            if (address(auth).code.length > 0) {
                // Check that the deployer is an owner. 0x00 is the `DEFAULT_ADMIN_ROLE` used
                // by OpenZeppelin's AccessControl contract.
                require(auth.hasRole(0x00, deployer), "Sphinx: The deployer must be an owner of the SphinxAuth contract.");
                require(auth.getRoleMemberCount(0x00) == 1, "Sphinx: The deployer must be the only owner of the SphinxAuth contract.");
                require(!prevInfo.firstProposalOccurred || auth.hasRole(keccak256("ProposerRole"), deployer), "Sphinx: The deployer must be a proposer in the SphinxAuth contract.");
            }
    }

    // TODO(refactor): i think you can enforce that the user is using the sphinxDeploy modifier by
    // having a private variable in Sphinx.sol that's only set to true inside the modifier. then,
    // you'd just have an assertion at the beginning of the deploy functoin that checks that the
    // variable is true. if you do this, you should set it to false at the end of the modifier.

    function toString(Network[] memory _network) private pure returns (string memory) {
        string memory result = "\n";
        for (uint i = 0; i < _network.length; i++) {
            result = string.concat(result, getNetworkInfo(_network[i]).name);
            if (i != _network.length - 1) {
                result = string.concat(result, "\n");
            }
        }
        result = string.concat(result);
        return result;
    }

    enum NetworkType {
        Mainnet,
        Testnet,
        Local
    }

    struct NetworkInfo {
        Network network;
        string name;
        uint chainId;
        NetworkType networkType;
    }

    function getNetworkInfoArray() private pure returns (NetworkInfo[] memory) {
        NetworkInfo[] memory all = new NetworkInfo[](uint8(type(Network).max) + 1);
        all[0] =
NetworkInfo({
            network: Network.anvil,
            name: "anvil",
            chainId: 31337,
            networkType: NetworkType.Local
        });
        all[1] =
NetworkInfo({
            network: Network.ethereum,
            name: "ethereum",
            chainId: 1,
            networkType: NetworkType.Mainnet
        });
        all[2] =
NetworkInfo({
            network: Network.optimism,
            name: "optimism",
            chainId: 10,
            networkType: NetworkType.Mainnet
        });
        all[3] =
NetworkInfo({
            network: Network.arbitrum,
            name: "arbitrum",
            chainId: 42161,
            networkType: NetworkType.Mainnet
        });
        all[4] =
NetworkInfo({
            network: Network.polygon,
            name: "polygon",
            chainId: 137,
            networkType: NetworkType.Mainnet
        });
        all[5] =
NetworkInfo({
            network: Network.bnb,
            name: "bnb",
            chainId: 56,
            networkType: NetworkType.Mainnet
        });
        all[6] =
NetworkInfo({
            network: Network.gnosis,
            name: "gnosis",
            chainId: 100,
            networkType: NetworkType.Mainnet
        });
        all[7] =
NetworkInfo({
            network: Network.linea,
            name: "linea",
            chainId: 59144,
            networkType: NetworkType.Mainnet
        });
        all[8] =
NetworkInfo({
            network: Network.polygon_zkevm,
            name: "polygon_zkevm",
            chainId: 1101,
            networkType: NetworkType.Mainnet
        });
        all[9] =
NetworkInfo({
            network: Network.avalanche,
            name: "avalanche",
            chainId: 43114,
            networkType: NetworkType.Mainnet
        });
        all[10] =
NetworkInfo({
            network: Network.fantom,
            name: "fantom",
            chainId: 250,
            networkType: NetworkType.Mainnet
        });
        all[11] =
NetworkInfo({
            network: Network.base,
            name: "base",
            chainId: 8453,
            networkType: NetworkType.Mainnet
        });
        all[12] =
NetworkInfo({
            network: Network.goerli,
            name: "goerli",
            chainId: 5,
            networkType: NetworkType.Testnet
        });
        all[13] =
NetworkInfo({
            network: Network.optimism_goerli,
            name: "optimism_goerli",
            chainId: 420,
            networkType: NetworkType.Testnet
        });
        all[14] =
NetworkInfo({
            network: Network.arbitrum_goerli,
            name: "arbitrum_goerli",
            chainId: 421613,
            networkType: NetworkType.Testnet
        });
        all[15] =
NetworkInfo({
            network: Network.polygon_mumbai,
            name: "polygon_mumbai",
            chainId: 80001,
            networkType: NetworkType.Testnet
        });
        all[16] =
NetworkInfo({
            network: Network.bnb_testnet,
            name: "bnb_testnet",
            chainId: 97,
            networkType: NetworkType.Testnet
        });
        all[17] =
NetworkInfo({
            network: Network.gnosis_chiado,
            name: "gnosis_chiado",
            chainId: 10200,
            networkType: NetworkType.Testnet
        });
        all[18] =
NetworkInfo({
            network: Network.linea_goerli,
            name: "linea_goerli",
            chainId: 59140,
            networkType: NetworkType.Testnet
        });
        all[19] =
NetworkInfo({
            network: Network.polygon_zkevm_goerli,
            name: "polygon_zkevm_goerli",
            chainId: 1442,
            networkType: NetworkType.Testnet
        });
        all[20] =
NetworkInfo({
            network: Network.avalanche_fuji,
            name: "avalanche_fuji",
            chainId: 43113,
            networkType: NetworkType.Testnet
        });
        all[21] =
NetworkInfo({
            network: Network.fantom_testnet,
            name: "fantom_testnet",
            chainId: 4002,
            networkType: NetworkType.Testnet
        });
        all[22] =
NetworkInfo({
            network: Network.base_goerli,
            name: "base_goerli",
            chainId: 84531,
            networkType: NetworkType.Testnet
        });
        return all;
    }

    function getNetworkInfo(Network _network) private pure returns (NetworkInfo memory) {
        NetworkInfo[] memory all = getNetworkInfoArray();
        for (uint i = 0; i < all.length; i++) {
            if (all[i].network == _network) {
                return all[i];
            }
        }
        // TODO(docs)
        revert("Sphinx: Could not find network. Should never happen.");
    }

    function removeNetworkType(Network[] memory _networks, NetworkType _networkType) private pure returns (Network[] memory) {
        Network[] memory notNetworkType = new Network[](_networks.length);
        uint numNotNetworkType = 0;
        for (uint i = 0; i < _networks.length; i++) {
            if (getNetworkInfo(_networks[i]).networkType != _networkType) {
                notNetworkType[numNotNetworkType] = _networks[i];
                numNotNetworkType++;
            }
        }
        Network[] memory trimmed = new Network[](numNotNetworkType);
        for (uint i = 0; i < numNotNetworkType; i++) {
            trimmed[i] = notNetworkType[i];
        }
        return trimmed;
    }

    function toString(address[] memory _ary) private pure returns (string memory) {
        string memory result = "\n";
        for (uint i = 0; i < _ary.length; i++) {
            result = string.concat(result, vm.toString(_ary[i]));
            if (i != _ary.length - 1) {
                result = string.concat(result, "\n");
            }
        }
        result = string.concat(result);
        return result;
    }

    // TODO: make sure this is called before the deployment occurs.
    function getPrevConfig() private view returns (PreviousInfo memory) {
        if (address(auth).code.length == 0) {
            return PreviousInfo({
                // We set these to default values.
                owners: new address[](0),
                proposers: new address[](0),
                threshold: 0,
                version: Version({major: major, minor: minor, patch: patch}),
                isManagerDeployed: false,
                firstProposalOccurred: false,
                isExecuting: false
            });
        } else {
            uint256 numOwners = auth.getRoleMemberCount(0x00);
            address[] memory owners = new address[](numOwners);
            for (uint i = 0; i < numOwners; i++) {
                owners[i] = auth.getRoleMember(0x00, i);
            }

            // Do the same for proposers.
            uint256 numProposers = auth.getRoleMemberCount(keccak256("ProposerRole"));
            address[] memory proposers = new address[](numProposers);
            for (uint i = 0; i < numProposers; i++) {
                proposers[i] = auth.getRoleMember(keccak256("ProposerRole"), i);
            }

            return PreviousInfo({
                owners: owners, // TODO: rm, unnecessary
                proposers: proposers,
                threshold: auth.threshold(), // TODO: rm, unnecessary
                version: ISemver(address(manager)).version(),
                isManagerDeployed: true,
                firstProposalOccurred: auth.firstProposalOccurred(),
                isExecuting: manager.isExecuting()
            });
        }
    }

    // TODO(refactor): i'm not crazy about using cast b/c it's not a dependency of our package, and
    // i'm not sure how foundry handles major versions, so the user may have a new version that isn't compatible with this logic. we may not even need
    // this function at all.
    function isLiveNetwork(string memory _rpcUrl) private returns (bool) {
        // TODO(docs): `exit_code` will be 1 if the network is a live network (i.e. not an Anvil or Hardhat node).
        string[] memory inputs = new string[](5);
        inputs[0] = "cast";
        inputs[1] = "rpc";
        inputs[2] = "hardhat_getAutomine";
        inputs[3] = "--rpc-url";
        inputs[4] = _rpcUrl;
        Vm.FfiResult memory result = vm.tryFfi(inputs);
        return result.exit_code == 1;
    }

    function getDuplicateElements(Network[] memory _network) private pure returns (Network[] memory) {
        // TODO(docs): we return early here because the for-loop will throw an underflow error
        // if the array is empty.
        if (_network.length == 0) return new Network[](0);

        Network[] memory sorted = sortNetworks(_network);
        Network[] memory duplicates = new Network[](_network.length);
        uint numDuplicates = 0;
        for (uint i = 0; i < sorted.length - 1; i++) {
            if (sorted[i] == sorted[i + 1]) {
                duplicates[numDuplicates] = sorted[i];
                numDuplicates++;
            }
        }
        Network[] memory trimmed = new Network[](numDuplicates);
        for (uint i = 0; i < numDuplicates; i++) {
            trimmed[i] = duplicates[i];
        }
        return trimmed;
    }

    // TODO(docs): sorts the networks in ascending order according to the Network enum's value.
    function sortNetworks(Network[] memory _unsorted) private pure returns (Network[] memory) {
        Network[] memory sorted = _unsorted;
        for (uint i = 0; i < sorted.length; i++) {
            for (uint j = i + 1; j < sorted.length; j++) {
                if (sorted[i] > sorted[j]) {
                    Network temp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = temp;
                }
            }
        }
        return sorted;
    }

    function getDuplicateElements(address[] memory _ary) private pure returns (address[] memory) {
        // TODO(docs): we return early here because the for-loop will throw an underflow error
        // if the array is empty.
        if (_ary.length == 0) return new address[](0);

        address[] memory sorted = sortAddresses(_ary);
        address[] memory duplicates = new address[](_ary.length);
        uint numDuplicates = 0;
        for (uint i = 0; i < sorted.length - 1; i++) {
            if (sorted[i] == sorted[i + 1]) {
                duplicates[numDuplicates] = sorted[i];
                numDuplicates++;
            }
        }
        address[] memory trimmed = new address[](numDuplicates);
        for (uint i = 0; i < numDuplicates; i++) {
            trimmed[i] = duplicates[i];
        }
        return trimmed;
    }

    // function makeSphinxConfig() private {
    //     sphinxConfig.projectName = projectName;
    //     sphinxConfig.orgId = orgId;
    //     sphinxConfig.owners = owners;
    //     sphinxConfig.proposers = proposers;
    //     sphinxConfig.mainnets = mainnets;
    //     sphinxConfig.testnets = testnets;
    //     sphinxConfig.threshold = threshold;
    //     sphinxConfig.version = version;
    // }

    function getMappingValueSlotKey(bytes32 _mappingSlotKey, bytes32 _key) private pure returns (bytes32) {
        bytes memory encodedMappingKey = abi.encode(_key);
        return keccak256(abi.encodePacked(encodedMappingKey, _mappingSlotKey));
    }

    // TODO: Docs
    // Defines that a contract is deployed already at a particular address. Sets the code
    // at the address to the contracts client code, and moves the current code to the implementation
    // address used by the client.
    function _defineContract(
        string memory _referenceName,
        address _contractAddress,
        string memory _fullyQualifiedName,
        string memory _clientPath
    ) internal returns (address) {
        require(
            !isReferenceNameUsed(_referenceName),
            string(
                abi.encodePacked("Sphinx: The reference name ",
                _referenceName,
                " was used more than once in this deployment. Reference names must be unique.")
            )
        );
        require(_contractAddress.code.length > 0, string(abi.encodePacked("Sphinx: The contract ", _referenceName, " at ", vm.toString(_contractAddress), " is not deployed on this network. Please make sure that the address and network are correct.")));

        bytes memory actionData = abi.encode(_contractAddress, _referenceName);
        actions.push(SphinxAction({
            fullyQualifiedName: _fullyQualifiedName,
            actionType: SphinxActionType.DEFINE_CONTRACT,
            data: actionData,
            // TODO(docs): we always skip b/c it's already deployed.
            skip: true
        }));

        // The implementation's address is the current address minus one.
        address impl = address(uint160(address(_contractAddress)) - 1);

        // TODO(docs): Set the user's contract's code to the implementation address.
        vm.etch(impl, _contractAddress.code);

        // TODO(docs): Deploy the client to the CREATE3 address.
        sphinxDeployCodeTo(
            _clientPath,
            abi.encode(manager, address(this), impl),
            _contractAddress
        );
        return _contractAddress;
    }

    // TODO: Docs
    // Deploys a contract at the expected sphinx address. Used by the Sphinx client to deploy
    // contracts during the simulation phase.
    function _deployContract(
        string memory _referenceName,
        bytes32 _userSalt,
        bytes memory _constructorArgs,
        string memory fullyQualifiedName,
        string memory clientArtifactPath,
        string memory artifactPath
    ) internal returns (address) {
        require(
            !isReferenceNameUsed(_referenceName),
            string(
                abi.encodePacked("Sphinx: The reference name ",
                _referenceName,
                " was used more than once in this deployment. Reference names must be unique.")
            )
        );

        bytes32 create3Salt = keccak256(abi.encode(_referenceName, _userSalt));
        address create3Address = computeCreate3Address(address(manager), create3Salt);

        bool skipDeployment = create3Address.code.length > 0;

        bytes memory actionData = abi.encode(vm.getCode(artifactPath), _constructorArgs, _userSalt, _referenceName);
        actions.push(SphinxAction({
            fullyQualifiedName: fullyQualifiedName,
            actionType: SphinxActionType.DEPLOY_CONTRACT,
            data: actionData,
            skip: skipDeployment
        }));

        // TODO(docs): The implementation's address is the CREATE3 address minus one.
        address impl = address(uint160(address(create3Address)) - 1);

        if (!skipDeployment && mode == SphinxMode.DeployLocal) {
            // TODO(docs): Deploy the user's contract to the CREATE3 address. this must be called by the
            // SphinxManager to ensure that the `msg.sender` in the body of the user's constructor is
            // the SphinxManager. This mirrors what happens on a live network.
            sphinxDeployCodeTo(artifactPath, _constructorArgs, create3Address);
        }

        // TODO(docs): Set the user's contract's code to the implementation address.
        vm.etch(impl, create3Address.code);

        // TODO(docs): Deploy the client to the CREATE3 address.
        sphinxDeployCodeTo(clientArtifactPath, abi.encode(manager, address(this), impl), create3Address);

        return create3Address;
    }

    function addSphinxAction(SphinxAction memory _action) external {
        actions.push(_action);
    }

    function setChainInfo(
        bool _isLiveNetwork,
        PreviousInfo memory _prevConfig,
        SphinxConfig memory _newConfig,
        SphinxMode _mode
    ) private {
        SphinxAction[] memory trimmed = removeActionType(actions, SphinxActionType.DEFINE_CONTRACT);

        for (uint i = 0; i < trimmed.length; i++) {
            chainInfo.actionsTODO.push(trimmed[i]);
        }

        chainInfo.authAddress = address(auth);
        chainInfo.managerAddress = address(manager);
        chainInfo.chainId = block.chainid;
        chainInfo.newConfig = _newConfig;
        chainInfo.isLiveNetwork = _isLiveNetwork;
        chainInfo.prevConfig = _prevConfig;
        chainInfo.remoteExecution = _mode == SphinxMode.Proposal;
    }

    // TODO(refactor): it appears this isn't used anymore.
    // TODO(docs): we need to define this explicitly for the same reason we need to define
    // SphinxManager.deployments(...) explicitly.
    function getChainInfo() external view returns (ChainInfo memory) {
        return chainInfo;
    }

    // TODO(docs): just for ABI generation.
    function getChainInfoArray() external view returns (ChainInfo[] memory) {}

    function getReferenceNameForAddress(address _create3Address) external view returns (string memory) {
        for (uint256 i = 0; i < actions.length; i++) {
            SphinxAction memory action = actions[i];
            if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                (, , bytes32 userSalt, string memory referenceName) = abi.decode(action.data, (bytes, bytes, bytes32, string));
                bytes32 sphinxCreate3Salt = keccak256(abi.encode(referenceName, userSalt));
                address create3Address = computeCreate3Address(address(manager), sphinxCreate3Salt);
                if (create3Address == _create3Address) {
                    return referenceName;
                }
            } else if (action.actionType == SphinxActionType.DEFINE_CONTRACT) {
                (address addr, string memory referenceName) = abi.decode(action.data, (address, string));
                if (addr == _create3Address) {
                    return referenceName;
                }
            }
        }
        revert("Sphinx: No reference name found for the given address. Should never happen.");
    }

    function removeActionType(SphinxAction[] memory _actions, SphinxActionType _actionType) private pure returns (SphinxAction[] memory) {
        SphinxAction[] memory filtered = new SphinxAction[](_actions.length);
        uint numFiltered = 0;
        for (uint i = 0; i < _actions.length; i++) {
            if (_actions[i].actionType != _actionType) {
                filtered[numFiltered] = _actions[i];
                numFiltered++;
            }
        }
        SphinxAction[] memory trimmed = new SphinxAction[](numFiltered);
        for (uint i = 0; i < numFiltered; i++) {
            trimmed[i] = filtered[i];
        }
        return trimmed;
    }

    function isReferenceNameUsed(string memory _referenceName) private view returns (bool) {
        for (uint256 i = 0; i < actions.length; i++) {
            SphinxAction memory action = actions[i];
            if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                (, , , string memory referenceName) = abi.decode(action.data, (bytes, bytes, bytes32, string));
                if (keccak256(abi.encode(referenceName)) == keccak256(abi.encode(_referenceName))) {
                    return true;
                }
            } else if (action.actionType == SphinxActionType.DEFINE_CONTRACT) {
                (, string memory referenceName) = abi.decode(action.data, (address, string));
                if (keccak256(abi.encode(referenceName)) == keccak256(abi.encode(_referenceName))) {
                    return true;
                }
            }
        }
        return false;
    }

    function arrayContainsAddress(address[] memory _ary, address _addr) private pure returns (bool) {
        for (uint i = 0; i < _ary.length; i++) {
            if (_ary[i] == _addr) {
                return true;
            }
        }
        return false;
    }

    function addRemoteExecutor(address _executor) private {
        IAccessControl managedService = IAccessControl(manager.managedService());
        if (!managedService.hasRole(keccak256("REMOTE_EXECUTOR_ROLE"), _executor)) {
            // TODO: you'll need to temporarily halt any existing pranks, then restart them.

            vm.startPrank(systemOwnerAddress);
            managedService.grantRole(keccak256("REMOTE_EXECUTOR_ROLE"), _executor);
            vm.stopPrank();
        }
    }

    function findNetworkInfoByName(string memory _networkName) private returns (NetworkInfo memory) {
        NetworkInfo[] memory all = getNetworkInfoArray();
        for (uint256 i = 0; i < all.length; i++) {
            if (keccak256(abi.encode(all[i].name)) == keccak256(abi.encode(_networkName))) {
                return all[i];
            }
        }
        revert(string(abi.encodePacked("Sphinx: No network found with the given name: ", _networkName)));
    }

    function findNetworkInfoByChainId(uint256 _chainId) private pure returns (NetworkInfo memory) {
        NetworkInfo[] memory all = getNetworkInfoArray();
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].chainId == _chainId) {
                return all[i];
            }
        }
        revert(string(abi.encodePacked("Sphinx: No network found with the chain ID: ", vm.toString(_chainId))));

    }
}
