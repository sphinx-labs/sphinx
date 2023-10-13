// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import { console } from "forge-std/console.sol"; // TODO: rm

import { Vm } from "forge-std/Vm.sol";
import { StdUtils } from "forge-std/StdUtils.sol";

import { ISphinxAccessControl } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAccessControl.sol";
import {
    ISphinxAccessControlEnumerable
} from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAccessControlEnumerable.sol";
import { ISphinxAuth } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuth.sol";
import { ISphinxSemver } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxSemver.sol";
import { ISphinxRegistry } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxRegistry.sol";
import { ISphinxManager } from "@sphinx-labs/contracts/contracts/interfaces/ISphinxManager.sol";
import {
    RawSphinxAction,
    SphinxActionType,
    SphinxTarget,
    Version,
    AuthLeaf
} from "@sphinx-labs/contracts/contracts/SphinxDataTypes.sol";
import {
    ISphinxAuthFactory
} from "@sphinx-labs/contracts/contracts/interfaces/ISphinxAuthFactory.sol";
import {
    BundledSphinxAction,
    SphinxActionBundle,
    BundledSphinxAction,
    SphinxTargetBundle,
    BundleInfo,
    DeploymentInfo,
    HumanReadableAction,
    SphinxActionInput,
    BundledAuthLeaf,
    NetworkInfo,
    NetworkType,
    Network,
    SphinxConfig,
    InitialChainState,
    OptionalAddress,
    SphinxMode,
    Wallet
} from "./SphinxPluginTypes.sol";
import { SphinxContractInfo, SphinxConstants } from "./SphinxConstants.sol";

/**
 * @notice We should always prefix the name of contracts that need to be imported into this file with
 *         `Sphinx`. See Sphinx.sol for more details.
 */
contract SphinxUtils is SphinxConstants, StdUtils {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    // These are constants thare are used when signing an EIP-712 meta transaction. They're copied
    // from the `SphinxAuth` contract.
    bytes32 private constant DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name)");
    bytes32 private constant DOMAIN_NAME_HASH = keccak256(bytes("Sphinx"));
    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(abi.encode(DOMAIN_TYPE_HASH, DOMAIN_NAME_HASH));
    bytes32 private constant TYPE_HASH = keccak256("AuthRoot(bytes32 root)");

    bool private SPHINX_INTERNAL__TEST_VERSION_UPGRADE = vm.envOr("SPHINX_INTERNAL__TEST_VERSION_UPGRADE", false);
    string private rootPluginPath =
        vm.envOr("DEV_FILE_PATH", string("./node_modules/@sphinx-labs/plugins/"));
    string private rootFfiPath = string(abi.encodePacked(rootPluginPath, "dist/foundry/"));
    string private mainFfiScriptPath = string(abi.encodePacked(rootFfiPath, "index.js"));

    uint private systemOwnerPrivateKey = vm.envOr("SPHINX_INTERNAL__OWNER_PRIVATE_KEY", uint(0));

    address public systemOwner =
        systemOwnerPrivateKey != 0
            ? vm.rememberKey(systemOwnerPrivateKey)
            : 0x226F14C3e19788934Ff37C653Cf5e24caD198341;

    // Source: https://github.com/Arachnid/deterministic-deployment-proxy
    address public constant DETERMINISTIC_DEPLOYMENT_PROXY =
        0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // TODO(docs)
    uint8 internal constant numSupportedNetworks = 23;

    function initializeFFI(string memory _rpcUrl, OptionalAddress memory _executor) external {
        ffiDeployOnAnvil(_rpcUrl, _executor);
        initializeSphinxContracts(_executor);
    }

    /**
     * @notice Returns the SphinxManager implementation address for the current network.
     *         This is required because the implementation address is different on OP mainnet and OP Goerli.
     */
    function selectManagerImplAddressForNetwork() internal view returns (address) {
        if (block.chainid == 10) {
            return managerImplementationAddressOptimism;
        } else if (block.chainid == 420) {
            return managerImplementationAddressOptimismGoerli;
        } else {
            return managerImplementationAddressStandard;
        }
    }

    function initializeSphinxContracts(OptionalAddress memory _executor) public {
        ISphinxRegistry registry = ISphinxRegistry(registryAddress);
        ISphinxAuthFactory factory = ISphinxAuthFactory(authFactoryAddress);
        vm.etch(
            DETERMINISTIC_DEPLOYMENT_PROXY,
            hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
        );

        SphinxContractInfo[] memory contracts = getSphinxContractInfo();
        for (uint i = 0; i < contracts.length; i++) {
            SphinxContractInfo memory ct = contracts[i];
            address addr = create2Deploy(ct.creationCode);
            require(
                addr == ct.expectedAddress,
                string(abi.encodePacked(
                    "address mismatch. expected address: ",
                    vm.toString(ct.expectedAddress)
                ))
            );
        }

        // Impersonate system owner
        vm.startPrank(systemOwner);

        address managerImplAddress = selectManagerImplAddressForNetwork();

        if (_executor.exists) {
            address managedServiceAddr = ISphinxManager(managerImplAddress).managedService();
            ISphinxAccessControl managedService = ISphinxAccessControl(managedServiceAddr);
            if (!managedService.hasRole(keccak256("REMOTE_EXECUTOR_ROLE"), _executor.value)) {
                managedService.grantRole(keccak256("REMOTE_EXECUTOR_ROLE"), _executor.value);
            }
        }

        // Add initial manager version
        if (!registry.managerImplementations(managerImplAddress)) {
            registry.addVersion(managerImplAddress);
        }

        // Set the default manager version if not already set
        if (registry.currentManagerImplementation() == address(0)) {
            registry.setCurrentManagerImplementation(managerImplAddress);
        }

        // Add the current auth version if not already added
        if (!factory.authImplementations(authImplAddress)) {
            factory.addVersion(authImplAddress);
        }

        // Set the default auth version if not already set
        if (factory.currentAuthImplementation() == address(0)) {
            factory.setCurrentAuthImplementation(authImplAddress);
        }

        // Add transparent proxy type
        if (registry.adapters(keccak256("oz-transparent")) == address(0)) {
            registry.addContractKind(keccak256("oz-transparent"), ozTransparentAdapterAddr);
        }

        // Add uups ownable proxy type
        if (registry.adapters(keccak256("oz-ownable-uups")) == address(0)) {
            registry.addContractKind(keccak256("oz-ownable-uups"), ozUUPSOwnableAdapterAddr);
        }

        // Add uups access control proxy type
        if (registry.adapters(keccak256("oz-access-control-uups")) == address(0)) {
            registry.addContractKind(
                keccak256("oz-access-control-uups"),
                ozUUPSAccessControlAdapterAddr
            );
        }

        // Add default proxy type
        if (registry.adapters(bytes32(0)) == address(0)) {
            registry.addContractKind(bytes32(0), defaultAdapterAddr);
        }

        vm.stopPrank();
    }

    function slice(
        bytes calldata _data,
        uint256 _start,
        uint256 _end
    ) external pure returns (bytes memory) {
        return _data[_start:_end];
    }

    function getBundleInfoFFI(
        DeploymentInfo[] memory _deploymentInfoArray
    ) external returns (bytes32, BundleInfo[] memory) {
        string[] memory cmds = new string[](4);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = string(abi.encodePacked(rootFfiPath, "get-bundle-info.js"));
        cmds[3] = vm.toString(abi.encode(_deploymentInfoArray));

        Vm.FfiResult memory result = vm.tryFfi(cmds);
        if (result.exit_code == 1) {
            bytes memory revertMessage = abi.encodePacked("Sphinx: ", result.stderr);
            revert(string(revertMessage));
        }
        return decodeBundleInfo(_deploymentInfoArray, result.stdout);
    }

    function ffiDeployOnAnvil(string memory _rpcUrl, OptionalAddress memory _address) public {
        string[] memory cmds = new string[](6);
        cmds[0] = "npx";
        cmds[1] = "node";
        cmds[2] = mainFfiScriptPath;
        cmds[3] = "deployOnAnvil";
        cmds[4] = _rpcUrl;
        cmds[5] = vm.toString(_address.value);

        Vm.FfiResult memory result = vm.tryFfi(cmds);
        if (result.exit_code == 1) {
            revert(string(result.stderr));
        }
        vm.sleep(5000);
    }

    function getEIP1967ProxyAdminAddress(address _proxyAddress) public view returns (address) {
        // The EIP-1967 storage slot that holds the address of the owner.
        // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
        bytes32 ownerKey = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

        bytes32 ownerBytes32 = vm.load(_proxyAddress, ownerKey);

        // Convert the bytes32 value to an address.
        return address(uint160(uint256(ownerBytes32)));
    }

    function getDeploymentId(
        SphinxActionBundle memory _actionBundle,
        SphinxTargetBundle memory _targetBundle,
        string memory _configUri
    ) external pure returns (bytes32) {
        (uint256 numInitialActions, uint256 numSetStorageActions) = getNumActions(
            _actionBundle.actions
        );

        return
            keccak256(
                abi.encode(
                    _actionBundle.root,
                    _targetBundle.root,
                    numInitialActions,
                    numSetStorageActions,
                    _targetBundle.targets.length,
                    _configUri
                )
            );
    }

    function getCurrentSphinxManagerVersion() public pure returns (Version memory) {
        return Version({ major: major, minor: minor, patch: patch });
    }

    function getAddress(
        SphinxConfig memory _config,
        string memory _referenceName
    ) public pure returns (address) {
        return getAddress(_config, _referenceName, bytes32(0));
    }

    function getAddress(SphinxConfig memory _config, string memory _referenceName, bytes32 _salt) public pure returns (address) {
        address manager = getSphinxManagerAddress(_config);
        bytes32 create3Salt = keccak256(abi.encode(_referenceName, _salt));
        return computeCreate3Address(manager, create3Salt);
    }

    function create2Deploy(bytes memory _creationCode) public returns (address) {
        address addr = computeCreate2Address(
            bytes32(0),
            keccak256(_creationCode),
            DETERMINISTIC_DEPLOYMENT_PROXY
        );

        if (addr.code.length == 0) {
            bytes memory code = abi.encodePacked(bytes32(0), _creationCode);
            (bool success, ) = DETERMINISTIC_DEPLOYMENT_PROXY.call(code);
            require(
                success,
                string(abi.encodePacked("failed to deploy contract. expected address: ", vm.toString(addr)))
            );
        }

        return addr;
    }

    function inefficientSlice(
        BundledSphinxAction[] memory selected,
        uint start,
        uint end
    ) public pure returns (BundledSphinxAction[] memory sliced) {
        sliced = new BundledSphinxAction[](end - start);
        for (uint i = start; i < end; i++) {
            sliced[i - start] = selected[i];
        }
    }

    /**
     * @notice Deploys the SphinxManager contract to the target address by retrieving its bytecode
     *         from SphinxConstants.sol. By doing this, we avoid importing the SphinxManager into
     *         this contract, which could cause issues because its bytecode may be altered due to
     *         the user's optimizer settings. For example, this could cause the `CREATE2` address
     *         of the SphinxManager to be different locally than it is on-chain, which would result
     *         in all of the user's contracts having different addresses too.
     */
    function deploySphinxManagerTo(address _where) external {
        vm.etch(_where, getSphinxManagerImplInitCode());
        (bool success, bytes memory runtimeBytecode) = _where.call("");
        require(success, "Sphinx: Failed to deploy SphinxManager. Should never happen.");
        vm.etch(_where, runtimeBytecode);
    }

    function getSphinxManagerImplInitCode() private view returns (bytes memory) {
        SphinxContractInfo[] memory contracts = getSphinxContractInfo();
        for (uint i = 0; i < contracts.length; i++) {
            if (contracts[i].expectedAddress == selectManagerImplAddressForNetwork()) {
                return contracts[i].creationCode;
            }
        }
        revert("Sphinx: Unable to find SphinxManager initcode. Should never happen.");
    }

    function getSphinxAuthAddress(
        address[] memory _owners,
        uint256 _ownerThreshold,
        string memory _projectName
    ) public pure returns (address) {
        require(
            bytes(_projectName).length > 0,
            "SphinxUtils: You must assign a value to 'sphinxConfig.projectName' in your constructor."
        );
        require(
            _owners.length > 0,
            "SphinxUtils: You must have at least one owner in your 'sphinxConfig.owners' array."
        );
        require(
            _ownerThreshold > 0,
            "SphinxUtils: Your 'sphinxConfig.threshold' must be greater than 0."
        );

        // Sort the owners in ascending order. This is required to calculate the address of the
        // SphinxAuth contract, which determines the CREATE3 addresses of the user's contracts.
        address[] memory sortedOwners = sortAddresses(_owners);

        bytes memory authData = abi.encode(sortedOwners, _ownerThreshold);
        bytes32 authSalt = keccak256(abi.encode(authData, _projectName));

        return computeCreate2Address(authSalt, authProxyInitCodeHash, authFactoryAddress);
    }

    function getSphinxManagerAddress(
        SphinxConfig memory _config
    ) public pure returns (address) {
        address authAddress = getSphinxAuthAddress(_config.owners, _config.threshold, _config.projectName);
        bytes32 sphinxManagerSalt = keccak256(abi.encode(authAddress, _config.projectName, hex""));
        return computeCreate2Address(sphinxManagerSalt, managerProxyInitCodeHash, registryAddress);
    }

    function sortAddresses(address[] memory _unsorted) public pure returns (address[] memory) {
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

    function getSphinxDeployerPrivateKey(uint256 _num) public pure returns (uint256) {
        return uint256(keccak256(abi.encode('sphinx.deployer', _num)));
    }

    // TODO(docs): we don't use vm.createWallet because this function must be view/pure. explain why
    function getSphinxWalletsSortedByAddress(uint256 _numWallets) external pure returns (Wallet[] memory) {
        Wallet[] memory wallets = new Wallet[](_numWallets);
        for (uint256 i = 0; i < _numWallets; i++) {
            uint256 privateKey = getSphinxDeployerPrivateKey(i);
            wallets[i] = Wallet({
                addr: vm.addr(privateKey),
                privateKey: privateKey
            });
        }

        // Sort the wallets by address
        for (uint256 i = 0; i < wallets.length; i++) {
            for (uint256 j = i + 1; j < wallets.length; j++) {
                if (wallets[i].addr > wallets[j].addr) {
                    Wallet memory temp = wallets[i];
                    wallets[i] = wallets[j];
                    wallets[j] = temp;
                }
            }
        }

        return wallets;
    }

    /**
     * @notice Splits up a bundled action into its components
     */
    function disassembleActions(
        BundledSphinxAction[] memory actions
    ) public pure returns (RawSphinxAction[] memory, bytes32[][] memory) {
        RawSphinxAction[] memory rawActions = new RawSphinxAction[](actions.length);
        bytes32[][] memory _proofs = new bytes32[][](actions.length);
        for (uint i = 0; i < actions.length; i++) {
            BundledSphinxAction memory action = actions[i];
            rawActions[i] = action.action;
            _proofs[i] = action.siblings;
        }

        return (rawActions, _proofs);
    }

    /**
     * Helper function that determines if a given batch is executable within the specified gas
       limit.
     */
    function executable(
        BundledSphinxAction[] memory selected,
        uint maxGasLimit
    ) public pure returns (bool) {
        uint256 estGasUsed = 0;

        for (uint i = 0; i < selected.length; i++) {
            estGasUsed += selected[i].gas;
        }
        return maxGasLimit > estGasUsed;
    }

    /**
     * Helper function for finding the maximum number of batch elements that can be executed from a
     * given input list of actions. This is done by performing a binary search over the possible
     * batch sizes and finding the largest batch size that does not exceed the maximum gas limit.
     */
    function findMaxBatchSize(
        BundledSphinxAction[] memory actions,
        uint maxGasLimit
    ) public pure returns (uint) {
        // Optimization, try to execute the entire batch at once before doing a binary search
        if (executable(actions, maxGasLimit)) {
            return actions.length;
        }

        // If the full batch isn't executavle, then do a binary search to find the largest
        // executable batch size
        uint min = 0;
        uint max = actions.length;
        while (min < max) {
            uint mid = ceilDiv((min + max), 2);
            BundledSphinxAction[] memory left = inefficientSlice(actions, 0, mid);
            if (executable(left, maxGasLimit)) {
                min = mid;
            } else {
                max = mid - 1;
            }
        }

        // No possible size works, this is a problem and should never happen
        if (min == 0) {
            revert("Sphinx: Unable to find a batch size that does not exceed the block gas limit");
        }

        return min;
    }

    function equals(string memory _str1, string memory _str2) public pure returns (bool) {
        return keccak256(abi.encodePacked(_str1)) == keccak256(abi.encodePacked(_str2));
    }

    function toBytes32(address _addr) public pure returns (bytes32) {
        return bytes32(uint256(uint160(_addr)));
    }

    function getNumActions(
        BundledSphinxAction[] memory _actions
    ) public pure returns (uint256, uint256) {
        uint256 numInitialActions = 0;
        uint256 numSetStorageActions = 0;
        for (uint256 i = 0; i < _actions.length; i++) {
            SphinxActionType actionType = _actions[i].action.actionType;
            if (
                actionType == SphinxActionType.DEPLOY_CONTRACT ||
                actionType == SphinxActionType.CALL
            ) {
                numInitialActions += 1;
            } else if (actionType == SphinxActionType.SET_STORAGE) {
                numSetStorageActions += 1;
            }
        }
        return (numInitialActions, numSetStorageActions);
    }

    function removeExecutedActions(
        BundledSphinxAction[] memory _actions,
        uint256 _actionsExecuted
    ) external pure returns (BundledSphinxAction[] memory) {
        uint numActionsToExecute = 0;
        for (uint i = 0; i < _actions.length; i++) {
            BundledSphinxAction memory action = _actions[i];
            if (action.action.index >= _actionsExecuted) {
                numActionsToExecute += 1;
            }
        }

        BundledSphinxAction[] memory filteredActions = new BundledSphinxAction[](
            numActionsToExecute
        );
        uint filteredArrayIndex = 0;
        for (uint i = 0; i < _actions.length; i++) {
            BundledSphinxAction memory action = _actions[i];
            if (action.action.index >= _actionsExecuted) {
                filteredActions[filteredArrayIndex] = action;
                filteredArrayIndex += 1;
            }
        }
        return filteredActions;
    }

    function splitActions(
        BundledSphinxAction[] memory _actions
    ) external pure returns (BundledSphinxAction[] memory, BundledSphinxAction[] memory) {
        (uint256 numInitialActions, uint256 numSetStorageActions) = getNumActions(_actions);

        BundledSphinxAction[] memory initialActions = new BundledSphinxAction[](numInitialActions);
        BundledSphinxAction[] memory setStorageActions = new BundledSphinxAction[](
            numSetStorageActions
        );
        uint initialActionArrayIndex = 0;
        uint setStorageArrayIndex = 0;
        for (uint i = 0; i < _actions.length; i++) {
            BundledSphinxAction memory action = _actions[i];
            if (
                action.action.actionType == SphinxActionType.DEPLOY_CONTRACT ||
                action.action.actionType == SphinxActionType.CALL
            ) {
                initialActions[initialActionArrayIndex] = action;
                initialActionArrayIndex += 1;
            } else if (action.action.actionType == SphinxActionType.SET_STORAGE) {
                setStorageActions[setStorageArrayIndex] = action;
                setStorageArrayIndex += 1;
            }
        }
        return (initialActions, setStorageActions);
    }

    function getCodeSize(address _addr) external view returns (uint256) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size;
    }

    function getCallHash(address _to, bytes memory _data) private pure returns (bytes32) {
        return keccak256(abi.encode(_to, _data));
    }

    /**
     * @notice Returns an array of unique addresses from a given array of addresses, which may
     *         contain duplicates.
     *
     * @param _addresses An array of addresses that may contain duplicates.
     */
    function getUniqueAddresses(
        address[] memory _addresses
    ) internal pure returns (address[] memory) {
        // First, we get an array of unique addresses. We do this by iterating over the input array
        // and adding each address to a new array if it hasn't been added already.
        address[] memory uniqueAddresses = new address[](_addresses.length);
        uint256 uniqueAddressCount = 0;
        for (uint256 i = 0; i < _addresses.length; i++) {
            bool isUnique = true;
            // Check if the address has already been added to the uniqueAddresses array.
            for (uint256 j = 0; j < uniqueAddressCount; j++) {
                if (_addresses[i] == uniqueAddresses[j]) {
                    isUnique = false;
                    break;
                }
            }
            // If the address hasn't been added yet, add it to the uniqueAddresses array.
            if (isUnique) {
                uniqueAddresses[uniqueAddressCount] = _addresses[i];
                uniqueAddressCount += 1;
            }
        }

        // Next, we create a new array with the correct length and copy the unique addresses into
        // it. This is necessary because the uniqueAddresses array may contain empty addresses at
        // the end.
        address[] memory trimmedUniqueAddresses = new address[](uniqueAddressCount);
        for (uint256 i = 0; i < uniqueAddressCount; i++) {
            trimmedUniqueAddresses[i] = uniqueAddresses[i];
        }

        return trimmedUniqueAddresses;
    }

    /**
     * @notice Decodes the bundle info data which is returned from the `get-bundle-info.ts` script that we call via FFI.
     *         The BundleInfo[] data structure is too large to decode all at once and causes a "stack too deep" error. So
     *         we have to loop through the deploymentInfo array and decode each bundle info struct individually. We also must
     *         decode each field of the bundle info struct individually.
     */
    function decodeBundleInfo(
        DeploymentInfo[] memory _deploymentInfoArray,
        bytes memory _encodedData
    ) private pure returns (bytes32, BundleInfo[] memory) {
        string memory json = string(_encodedData);

        BundleInfo[] memory bundleInfoArray = new BundleInfo[](_deploymentInfoArray.length);
        for (uint256 i = 0; i < _deploymentInfoArray.length; i++) {
            string memory networkName = findNetworkInfoByChainId(_deploymentInfoArray[i].chainId)
                .name;

            string memory configUri = vm.parseJsonString(
                json,
                string(abi.encodePacked(".chains.", networkName, ".configUri"))
            );
            // TODO(docs)
            bytes memory compilerConfigBytes = vm.parseJsonBytes(
                json,
                string(abi.encodePacked(".chains.", networkName, ".compilerConfigStr"))
            );
            string memory compilerConfigStr = abi.decode(compilerConfigBytes, (string));
            HumanReadableAction[] memory humanReadableActions = abi.decode(
                vm.parseJsonBytes(
                    json,
                    string(
                        abi.encodePacked(".chains.", networkName, ".humanReadableActionsAbiEncoded")
                    )
                ),
                (HumanReadableAction[])
            );
            bytes32 actionRoot = vm.parseJsonBytes32(
                json,
                string(abi.encodePacked(".chains.", networkName, ".actionBundle.root"))
            );
            BundledSphinxAction[] memory bundledActions = abi.decode(
                vm.parseJsonBytes(
                    json,
                    string(
                        abi.encodePacked(".chains.", networkName, ".actionBundle.actionsAbiEncoded")
                    )
                ),
                (BundledSphinxAction[])
            );
            SphinxTargetBundle memory targetBundle = abi.decode(
                vm.parseJsonBytes(
                    json,
                    string(abi.encodePacked(".chains.", networkName, ".targetBundleAbiEncoded"))
                ),
                (SphinxTargetBundle)
            );
            BundledAuthLeaf[] memory authLeafs = abi.decode(
                vm.parseJsonBytes(
                    json,
                    string(
                        abi.encodePacked(".chains.", networkName, ".authBundle.authLeafsAbiEncoded")
                    )
                ),
                (BundledAuthLeaf[])
            );

            bundleInfoArray[i] = BundleInfo({
                networkName: networkName,
                configUri: configUri,
                humanReadableActions: humanReadableActions,
                actionBundle: SphinxActionBundle({ root: actionRoot, actions: bundledActions }),
                targetBundle: targetBundle,
                authLeafs: authLeafs,
                compilerConfigStr: compilerConfigStr
            });
        }

        bytes32 authRoot = vm.parseJsonBytes32(json, ".authRoot");

        return (authRoot, bundleInfoArray);
    }

    function findNetworkInfoByName(
        string memory _networkName
    ) public pure returns (NetworkInfo memory) {
        NetworkInfo[] memory all = getNetworkInfoArray();
        for (uint256 i = 0; i < all.length; i++) {
            if (keccak256(abi.encode(all[i].name)) == keccak256(abi.encode(_networkName))) {
                return all[i];
            }
        }
        revert(
            string(abi.encodePacked("Sphinx: No network found with the given name: ", _networkName))
        );
    }

    function findNetworkInfoByChainId(uint256 _chainId) public pure returns (NetworkInfo memory) {
        NetworkInfo[] memory all = getNetworkInfoArray();
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].chainId == _chainId) {
                return all[i];
            }
        }
        revert(
            string(
                abi.encodePacked(
                    "Sphinx: No network found with the chain ID: ",
                    vm.toString(_chainId)
                )
            )
        );
    }

    function getNetworkInfoArray() private pure returns (NetworkInfo[] memory) {
        NetworkInfo[] memory all = new NetworkInfo[](numSupportedNetworks);
        all[0] = NetworkInfo({
            network: Network.anvil,
            name: "anvil",
            chainId: 31337,
            networkType: NetworkType.Local
        });
        all[1] = NetworkInfo({
            network: Network.ethereum,
            name: "ethereum",
            chainId: 1,
            networkType: NetworkType.Mainnet
        });
        all[2] = NetworkInfo({
            network: Network.optimism,
            name: "optimism",
            chainId: 10,
            networkType: NetworkType.Mainnet
        });
        all[3] = NetworkInfo({
            network: Network.arbitrum,
            name: "arbitrum",
            chainId: 42161,
            networkType: NetworkType.Mainnet
        });
        all[4] = NetworkInfo({
            network: Network.polygon,
            name: "polygon",
            chainId: 137,
            networkType: NetworkType.Mainnet
        });
        all[5] = NetworkInfo({
            network: Network.bnb,
            name: "bnb",
            chainId: 56,
            networkType: NetworkType.Mainnet
        });
        all[6] = NetworkInfo({
            network: Network.gnosis,
            name: "gnosis",
            chainId: 100,
            networkType: NetworkType.Mainnet
        });
        all[7] = NetworkInfo({
            network: Network.linea,
            name: "linea",
            chainId: 59144,
            networkType: NetworkType.Mainnet
        });
        all[8] = NetworkInfo({
            network: Network.polygon_zkevm,
            name: "polygon_zkevm",
            chainId: 1101,
            networkType: NetworkType.Mainnet
        });
        all[9] = NetworkInfo({
            network: Network.avalanche,
            name: "avalanche",
            chainId: 43114,
            networkType: NetworkType.Mainnet
        });
        all[10] = NetworkInfo({
            network: Network.fantom,
            name: "fantom",
            chainId: 250,
            networkType: NetworkType.Mainnet
        });
        all[11] = NetworkInfo({
            network: Network.base,
            name: "base",
            chainId: 8453,
            networkType: NetworkType.Mainnet
        });
        all[12] = NetworkInfo({
            network: Network.goerli,
            name: "goerli",
            chainId: 5,
            networkType: NetworkType.Testnet
        });
        all[13] = NetworkInfo({
            network: Network.optimism_goerli,
            name: "optimism_goerli",
            chainId: 420,
            networkType: NetworkType.Testnet
        });
        all[14] = NetworkInfo({
            network: Network.arbitrum_goerli,
            name: "arbitrum_goerli",
            chainId: 421613,
            networkType: NetworkType.Testnet
        });
        all[15] = NetworkInfo({
            network: Network.polygon_mumbai,
            name: "polygon_mumbai",
            chainId: 80001,
            networkType: NetworkType.Testnet
        });
        all[16] = NetworkInfo({
            network: Network.bnb_testnet,
            name: "bnb_testnet",
            chainId: 97,
            networkType: NetworkType.Testnet
        });
        all[17] = NetworkInfo({
            network: Network.gnosis_chiado,
            name: "gnosis_chiado",
            chainId: 10200,
            networkType: NetworkType.Testnet
        });
        all[18] = NetworkInfo({
            network: Network.linea_goerli,
            name: "linea_goerli",
            chainId: 59140,
            networkType: NetworkType.Testnet
        });
        all[19] = NetworkInfo({
            network: Network.polygon_zkevm_goerli,
            name: "polygon_zkevm_goerli",
            chainId: 1442,
            networkType: NetworkType.Testnet
        });
        all[20] = NetworkInfo({
            network: Network.avalanche_fuji,
            name: "avalanche_fuji",
            chainId: 43113,
            networkType: NetworkType.Testnet
        });
        all[21] = NetworkInfo({
            network: Network.fantom_testnet,
            name: "fantom_testnet",
            chainId: 4002,
            networkType: NetworkType.Testnet
        });
        all[22] = NetworkInfo({
            network: Network.base_goerli,
            name: "base_goerli",
            chainId: 84531,
            networkType: NetworkType.Testnet
        });
        return all;
    }

    function getNetworkInfo(Network _network) public pure returns (NetworkInfo memory) {
        NetworkInfo[] memory all = getNetworkInfoArray();
        for (uint i = 0; i < all.length; i++) {
            if (all[i].network == _network) {
                return all[i];
            }
        }
        revert("Sphinx: Could not find network. Should never happen.");
    }

    function toString(Network[] memory _network) public pure returns (string memory) {
        string memory result = "\n";
        for (uint i = 0; i < _network.length; i++) {
            result = string(abi.encodePacked(result, getNetworkInfo(_network[i]).name));
            if (i != _network.length - 1) {
                result = string(abi.encodePacked(result, "\n"));
            }
        }
        result = string(abi.encodePacked(result));
        return result;
    }

    function removeNetworkType(
        Network[] memory _networks,
        NetworkType _networkType
    ) public pure returns (Network[] memory) {
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

    function toString(address[] memory _ary) public pure returns (string memory) {
        string memory result = "\n";
        for (uint i = 0; i < _ary.length; i++) {
            result = string(abi.encodePacked(result, vm.toString(_ary[i])));
            if (i != _ary.length - 1) {
                result = string(abi.encodePacked(result, "\n"));
            }
        }
        result = string(abi.encodePacked(result));
        return result;
    }

    /**
     * @notice Checks if the rpcUrl is a live network (e.g. Ethereum) or a local network (e.g. an
     *         Anvil or Hardhat node). It does this by attempting to call an RPC method that only
     *         exists on an Anvil or Hardhat node.
     */
    function isLiveNetworkFFI(string memory _rpcUrl) external returns (bool) {
        string[] memory inputs = new string[](5);
        inputs[0] = "npx";
        inputs[1] = "node";
        inputs[2] = mainFfiScriptPath;
        inputs[3] = "isLiveNetwork";
        inputs[4] = _rpcUrl;

        Vm.FfiResult memory result = vm.tryFfi(inputs);
        if (result.exit_code == 1) {
            revert(string(result.stderr));
        }
        return abi.decode(result.stdout, (bool));
    }

    function arrayContainsAddress(
        address[] memory _ary,
        address _addr
    ) private pure returns (bool) {
        for (uint i = 0; i < _ary.length; i++) {
            if (_ary[i] == _addr) {
                return true;
            }
        }
        return false;
    }

    function computeCreate3Address(address _deployer, bytes32 _salt) public pure returns (address) {
        // Hard-coded bytecode of the proxy used by Create3 to deploy the contract. See the `CREATE3.sol`
        // library for details.
        bytes memory proxyBytecode = hex"67_36_3d_3d_37_36_3d_34_f0_3d_52_60_08_60_18_f3";

        address proxy = computeCreate2Address(_salt, keccak256(proxyBytecode), _deployer);
        return computeCreateAddress(proxy, 1);
    }

    /**
     * @notice Filters out the duplicate networks and returns an array of unique networks.
     * @param _networks The networks to filter.
     * @return trimmed The unique networks.
     */
    function deduplicateElements(
        Network[] memory _networks
    ) public pure returns (Network[] memory) {
        // We return early here because the for-loop below will throw an underflow error if the array is empty.
        if (_networks.length == 0) return new Network[](0);

        Network[] memory sorted = sortNetworks(_networks);
        Network[] memory duplicates = new Network[](_networks.length);
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

    /**
     * @notice Filters out the duplicate addresses and returns an array of unique addresses.
     * @param _ary The addresses to filter.
     * @return trimmed The unique addresses.
     */
    function deduplicateElements(address[] memory _ary) public pure returns (address[] memory) {
        // We return early here because the for-loop below will throw an underflow error if the array is empty.
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

    /**
     * @notice Sorts the networks in ascending order according to the Network enum's value.
     * @param _unsorted The networks to sort.
     * @return sorted The sorted networks.
     */
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

    function getMappingValueSlotKey(
        bytes32 _mappingSlotKey,
        bytes32 _key
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_key, _mappingSlotKey));
    }

    function signMetaTxnForAuthRoot(
        uint256 _privateKey,
        bytes32 _authRoot
    ) external pure returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(TYPE_HASH, _authRoot));
        bytes32 typedDataHash = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, typedDataHash);
        return abi.encodePacked(r, s, v);
    }

    /**
     * @notice Performs validation on the user's deployment. This mainly checks that the user's
     *         configuration is valid. This validation occurs regardless of the `SphinxMode` (e.g.
     *         proposals, broadcasting, etc).
     */
    function validate(SphinxConfig memory _config, Network _network) external view {
        require(
            bytes(_config.projectName).length > 0,
            "Sphinx: You must assign a value to 'sphinxConfig.projectName' in your constructor."
        );
        require(
            _config.owners.length > 0,
            "Sphinx: You must have at least one owner in your 'sphinxConfig.owners' array."
        );
        require(
            _config.threshold > 0,
            "Sphinx: Your 'sphinxConfig.threshold' must be greater than 0."
        );
        if (!SPHINX_INTERNAL__TEST_VERSION_UPGRADE) {
            require(
                _config.version.major == major &&
                    _config.version.minor == minor &&
                    _config.version.patch == patch,
                string(
                    abi.encodePacked(
                        "Sphinx: Your 'sphinxConfig.version' field must be ",
                        vm.toString(major),
                        ".",
                        vm.toString(minor),
                        ".",
                        vm.toString(patch),
                        "."
                    )
                )
            );
        }
        require(
            _config.owners.length >= _config.threshold,
            "Sphinx: Your 'sphinxConfig.threshold' field must be less than or equal to the number of owners in your 'owners' array."
        );

        address[] memory duplicateOwners = deduplicateElements(_config.owners);
        address[] memory duplicateProposers = deduplicateElements(_config.proposers);
        Network[] memory duplicateMainnets = deduplicateElements(_config.mainnets);
        Network[] memory duplicateTestnets = deduplicateElements(_config.testnets);
        require(
            duplicateOwners.length == 0,
            string(
                abi.encodePacked(
                    "Sphinx: Your 'sphinxConfig.owners' array contains duplicate addresses: ",
                    toString(duplicateOwners)
                )
            )
        );
        require(
            duplicateProposers.length == 0,
            string(
                abi.encodePacked(
                    "Sphinx: Your 'sphinxConfig.proposers' array contains duplicate addresses: ",
                    toString(duplicateProposers)
                )
            )
        );
        require(
            duplicateMainnets.length == 0,
            string(
                abi.encodePacked(
                    "Sphinx: Your 'sphinxConfig.mainnets' array contains duplicate networks: ",
                    toString(duplicateMainnets)
                )
            )
        );
        require(
            duplicateTestnets.length == 0,
            string(
                abi.encodePacked(
                    "Sphinx: Your 'sphinxConfig.testnets' array contains duplicate networks: ",
                    toString(duplicateTestnets)
                )
            )
        );

        Network[] memory invalidMainnets = removeNetworkType(_config.mainnets, NetworkType.Mainnet);
        require(
            invalidMainnets.length == 0,
            string(
                abi.encodePacked(
                    "Sphinx: Your 'sphinxConfig.mainnets' array contains non-production networks: ",
                    toString(invalidMainnets)
                )
            )
        );
        Network[] memory invalidTestnets = removeNetworkType(_config.testnets, NetworkType.Testnet);
        require(
            invalidTestnets.length == 0,
            string(
                abi.encodePacked(
                    "Sphinx: Your 'testnets' array contains invalid test networks: ",
                    toString(invalidTestnets)
                )
            )
        );

        require(
            block.chainid == getNetworkInfo(_network).chainId,
            string(
                abi.encodePacked(
                    "Sphinx: The 'block.chainid' does not match the chain ID of the network: ",
                    getNetworkInfo(_network).name,
                    "\nCurrent chain ID: ",
                    vm.toString(block.chainid),
                    "\nExpected chain ID: ",
                    vm.toString(getNetworkInfo(_network).chainId)
                )
            )
        );
    }

    /**
     * @notice Performs validation on the user's deployment. This is only run if a broadcast is
     *         being performed on a live network (i.e. not an Anvil or Hardhat node). It's worth
     *         mentioning that this can't be used for proposals because the proposer isn't an owner
     *         of the SphinxAuth contract, which means these checks would always fail for proposals.
     */
    function validateLiveNetworkBroadcast(
        SphinxConfig memory _config,
        ISphinxAuth _auth,
        address _msgSender
    ) external view {
        require(
            _config.owners.length == 1,
            "Sphinx: You can only deploy on a live network if there is only one owner in your 'owners' array."
        );

        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        require(
            deployer == _config.owners[0],
            string(
                abi.encodePacked(
                    "Sphinx: The address corresponding to your 'PRIVATE_KEY' environment variable must match the address in the 'owners' array.\n",
                    "Address of your env variable: ",
                    vm.toString(deployer),
                    "\n",
                    "Address in the 'owners' array: ",
                    vm.toString(_config.owners[0])
                )
            )
        );
        require(
            _msgSender == deployer,
            string(
                abi.encodePacked(
                    "Sphinx: You must call 'vm.startBroadcast' with the address corresponding to the 'PRIVATE_KEY' in your '.env' file.\n",
                    "Broadcast address: ",
                    vm.toString(_msgSender),
                    "\n",
                    "Address corresponding to private key: ",
                    vm.toString(deployer)
                )
            )
        );
        // If we don't check this, then an arbitrary proposer could be set on the
        // live network, which would prevent the owner from making any more deployments unless
        // they adopt the DevOps platform.
        require(
            _config.proposers.length == 0,
            "Sphinx: There must not be any addresses in your 'sphinxConfig.proposers' array when broadcasting on a network."
        );

        if (address(_auth).code.length > 0) {
            ISphinxAccessControlEnumerable auth = ISphinxAccessControlEnumerable(address(_auth));
            // Check that the deployer is an owner. 0x00 is the `DEFAULT_ADMIN_ROLE` used
            // by OpenZeppelin's AccessControl contract.
            require(
                auth.hasRole(0x00, deployer),
                "Sphinx: The deployer must be an owner of the SphinxAuth contract."
            );
            require(
                auth.getRoleMemberCount(0x00) == 1,
                "Sphinx: The deployer must be the only owner of the SphinxAuth contract."
            );
            require(
                !_auth.firstProposalOccurred() ||
                    auth.hasRole(keccak256("ProposerRole"), deployer),
                "Sphinx: The deployer must be a proposer in the SphinxAuth contract."
            );
        }
    }

    function getInitialChainState(
        ISphinxAuth _auth,
        ISphinxManager _manager
    ) external view returns (InitialChainState memory) {
        if (address(_auth).code.length == 0) {
            ISphinxRegistry registry = ISphinxRegistry(registryAddress);

            ISphinxSemver currentManager = ISphinxSemver(registry.currentManagerImplementation());

            return
                InitialChainState({
                    // We set these to default values.
                    proposers: new address[](0),
                    // Use the current default manager version (which may be different from the latest manager version)
                    version: currentManager.version(),
                    isManagerDeployed: false,
                    firstProposalOccurred: false,
                    isExecuting: false
                });
        } else {
            ISphinxAccessControlEnumerable auth = ISphinxAccessControlEnumerable(address(_auth));
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

            return
                InitialChainState({
                    proposers: proposers,
                    version: ISphinxSemver(address(_manager)).version(),
                    isManagerDeployed: true,
                    firstProposalOccurred: _auth.firstProposalOccurred(),
                    isExecuting: _manager.isExecuting()
                });
        }
    }

    function isReferenceNameUsed(
        string memory _referenceName,
        SphinxActionInput[] memory _inputs
    ) external pure returns (bool) {
        for (uint256 i = 0; i < _inputs.length; i++) {
            SphinxActionInput memory action = _inputs[i];
            if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                (, , , string memory referenceName) = abi.decode(
                    action.data,
                    (bytes, bytes, bytes32, string)
                );
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

    // TODO: c/f `Broadcast` and update stuff like docs since we now have two types of Broadcasts.

    /**
     * @notice Removes the clients after a user's `deploy` function has been run. This function
     *         has slightly different behavior depending on the `SphinxMode` in which it's called.
     *
     *         If the mode is `Default`, then each client is replaced by the user's contract that
     *         it represents. This allows the user to interact with the *exact* version of their
     *         contract in Foundry tests, instead of a proxied version of their contract. From
     *         the user's perspective, the only benefit this provides is that calling
     *         `address(contract).code` or `address(contract).codehash` will return their contract's
     *         bytecode or bytecode hash instead of the client's.
     *
     *         If the mode is `Broadcast` or `Proposal`, then the client is simply removed so that
     *         no code exists at the `CREATE3` address. This allows us to call `sphinxDeployCodeTo`
     *         after this function, which deploys the user's contracts using the full deployment
     *         flow instead of the fast "default" flow.
     */
    function tearDownClients(
        SphinxActionInput[] memory _actions,
        ISphinxManager _manager
    ) external {
        for (uint i = 0; i < _actions.length; i++) {
            SphinxActionInput memory action = _actions[i];
            // If the mode is `Broadcast` or `Proposal`, then the implementation won't contain any
            // code. This is because we just collect the action inputs in these modes during the
            // user's `deploy` function. We do it this way because the `sphinxDeployCodeTo` call,
            // which occurs after this function, would fail if code already exists at the `CREATE3`
            // address.
            if (action.actionType == SphinxActionType.DEPLOY_CONTRACT) {
                (, , bytes32 userSalt, string memory referenceName) = abi.decode(
                    action.data,
                    (bytes, bytes, bytes32, string)
                );
                bytes32 sphinxCreate3Salt = keccak256(abi.encode(referenceName, userSalt));
                address create3Address = computeCreate3Address(
                    address(_manager),
                    sphinxCreate3Salt
                );
                // The implementation's address is the CREATE3 address minus one.
                address impl = address(uint160(create3Address) - 1);
                vm.etch(create3Address, impl.code);
            } else if (action.actionType == SphinxActionType.DEFINE_CONTRACT) {
                // Replace the client's bytecode with the actual contract at its proper address.
                (address to, ) = abi.decode(action.data, (address, string));
                // The contract's bytecode is stored at its proper address minus one.
                address impl = address(uint160(address(to)) - 1);
                vm.etch(address(to), impl.code);
            }
        }
    }

    /**
     * @notice Copied from OpenZeppelin's Math.sol (v4.9.0). We copy this instead of importing
     *         Math.sol in order to support a wider range of Solidity versions. Math.sol only
     *         allows versions >= 0.8.0.
     * @dev Returns the ceiling of the division of two numbers.
     *
     * This differs from standard division with `/` in that it rounds up instead
     * of rounding down.
     */
    function ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        // (a + b - 1) / b can overflow on addition, so we distribute.
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    function validateProposal(ISphinxAuth _auth, address _msgSender, Network _network, SphinxConfig memory _config) external view {
            bool firstProposalOccurred = address(_auth).code.length > 0
                ? _auth.firstProposalOccurred()
                : false;

            if (firstProposalOccurred) {
                require(
                    ISphinxAccessControl(address(_auth)).hasRole(keccak256("ProposerRole"), _msgSender),
                    string(
                        abi.encodePacked(
                            "Sphinx: The address ",
                            vm.toString(_msgSender),
                            " is not currently a proposer on ",
                            getNetworkInfo(_network).name,
                            "."
                        )
                    )
                );
            } else {
                require(
                    arrayContainsAddress(_config.proposers, _msgSender),
                    string(
                        abi.encodePacked(
                            "Sphinx: The address corresponding to your 'PROPOSER_PRIVATE_KEY' env variable is not in\n your 'proposers' array. Please add it or change your private key.\n Address: ",
                            vm.toString(_msgSender)
                        )
                    )
                );
            }
    }
}
