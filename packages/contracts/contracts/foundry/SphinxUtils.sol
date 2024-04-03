// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Vm, VmSafe } from "../../contracts/forge-std/src/Vm.sol";
import { StdUtils } from "../../contracts/forge-std/src/StdUtils.sol";

import { ISphinxModule } from "../core/interfaces/ISphinxModule.sol";
import { ISphinxModuleProxyFactory } from "../core/interfaces/ISphinxModuleProxyFactory.sol";
import {
    SphinxLeafWithProof,
    SphinxLeaf,
    SphinxLeafType,
    MerkleRootStatus
} from "../core/SphinxDataTypes.sol";
import {
    SphinxMerkleTree,
    FoundryDeploymentInfo,
    HumanReadableAction,
    NetworkInfo,
    NetworkType,
    Network,
    InternalSphinxConfig,
    InitialChainState,
    OptionalAddress,
    Wallet,
    ExecutionMode,
    SystemContractInfo,
    GnosisSafeTransaction,
    ParsedAccountAccess,
    SphinxLockProject,
    DefaultSafe,
    SphinxLockProject,
    UserSphinxConfig
} from "./SphinxPluginTypes.sol";
import { SphinxConstants } from "./SphinxConstants.sol";
import { ICreateCall } from "./interfaces/ICreateCall.sol";
import { IGnosisSafeProxyFactory } from "./interfaces/IGnosisSafeProxyFactory.sol";
import { IGnosisSafe } from "./interfaces/IGnosisSafe.sol";
import { IMultiSend } from "./interfaces/IMultiSend.sol";
import { IEnum } from "./interfaces/IEnum.sol";

interface ISphinxScript {
    function sphinxFetchConfig() external view returns (UserSphinxConfig memory);
    function configureSphinx() external;
}

contract SphinxUtils is SphinxConstants {
    // Ensures that this contract doesn't cause `forge build --sizes` to fail if this command is
    // executed by the user. For context, see: https://github.com/foundry-rs/foundry/issues/4615
    // Resolves:
    // https://linear.app/chugsplash/issue/CHU-891/prevent-the-users-forge-build-sizes-call-from-failing-due-to
    bool public IS_SCRIPT = true;

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    // Source: https://github.com/Arachnid/deterministic-deployment-proxy
    address public constant DETERMINISTIC_DEPLOYMENT_PROXY =
        0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // Object keys for the JSON serialization functions in this contract.
    string internal initialStateKey = "Sphinx_Internal__InitialChainState";
    string internal deploymentInfoKey = "Sphinx_Internal__FoundryDeploymentInfo";
    string internal sphinxConfigKey = "Sphinx_Internal__SphinxConfig";

    // Tracks if we've called the users `configureSphinx()` function yet
    bool internal calledConfigureSphinx = false;

    function checkValidSafeFundingRequest(uint _value, uint _chainId) public pure {
        NetworkInfo memory info = findNetworkInfoByChainId(_chainId);
        if (info.dripSize < _value) {
            revert(
                string(
                    abi.encodePacked(
                        "Sphinx: Gnosis Safe funding request exceeds the maximum value allowed on ",
                        info.name,
                        ". Please update your script to request less than or equal to the maximum value of ",
                        info.dripSizeString
                    )
                )
            );
        }
    }

    function checkAccesses(
        Vm.AccountAccess[] memory accountAccesses,
        bytes32 creationCodeHash,
        bytes32 runtimeCodeHash
    ) public view returns (bool) {
        // If there aren't two calls, (one to the deployment proxy, and another to deploy the contract)
        // then return false.
        if (accountAccesses.length < 2) {
            return false;
        }

        // If the first access does not record calling deterministic deployment proxy, then return false.
        if (accountAccesses[0].account != DETERMINISTIC_DEPLOYMENT_PROXY) {
            return false;
        }

        address expectedAddress = vm.computeCreate2Address(
            0,
            creationCodeHash,
            DETERMINISTIC_DEPLOYMENT_PROXY
        );
        if (accountAccesses[1].account != expectedAddress) {
            return false;
        }

        // If the second access did not come from the deterministic deployment proxy, then return false
        if (accountAccesses[1].accessor != DETERMINISTIC_DEPLOYMENT_PROXY) {
            return false;
        }

        // If the deployed code at the calculated address is incorrect, then return false.
        // This confirms the deterministic deployment proxy is in fact being used for the
        // internal simulation.
        if (keccak256(address(expectedAddress).code) != runtimeCodeHash) {
            return false;
        }

        return true;
    }

    function sortAddresses(address[] memory _unsorted) private pure returns (address[] memory) {
        address[] memory sorted = _unsorted;
        for (uint256 i = 0; i < sorted.length; i++) {
            for (uint256 j = i + 1; j < sorted.length; j++) {
                if (sorted[i] > sorted[j]) {
                    address temp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = temp;
                }
            }
        }
        return sorted;
    }

    function getSphinxWalletPrivateKey(uint256 _num) private pure returns (uint256) {
        return uint256(keccak256(abi.encode("sphinx.wallet", _num)));
    }

    function getSphinxLibraryVersion() public pure returns (string memory) {
        return sphinxLibraryVersion;
    }

    /**
     * @notice Get auto-generated wallets sorted in ascending order according to their addresses.
     *         We don't use `vm.createWallet` because this function must be view/pure, since it may
     *         be called during a broadcast. If it's not view/pure, then this call would be
     *         broadcasted, which is not what we want.
     */
    function getSphinxWalletsSortedByAddress(
        uint256 _numWallets
    ) internal pure returns (Wallet[] memory) {
        Wallet[] memory wallets = new Wallet[](_numWallets);
        for (uint256 i = 0; i < _numWallets; i++) {
            uint256 privateKey = getSphinxWalletPrivateKey(i);
            wallets[i] = Wallet({ addr: vm.addr(privateKey), privateKey: privateKey });
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

    function decodeApproveLeafData(
        SphinxLeaf memory leaf
    )
        internal
        pure
        returns (
            address leafSafeProxy,
            address moduleProxy,
            uint256 leafMerkleRootNonce,
            uint256 numLeaves,
            address executor,
            string memory uri,
            bool arbitraryChain
        )
    {
        return abi.decode(leaf.data, (address, address, uint256, uint256, address, string, bool));
    }

    function findNetworkInfoByChainId(uint256 _chainId) internal pure returns (NetworkInfo memory) {
        NetworkInfo[] memory all = getNetworkInfoArray();
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].chainId == _chainId) {
                return all[i];
            }
        }
        revert(
            string(
                abi.encodePacked(
                    "Sphinx: No network found with the given chain ID: ",
                    vm.toString(_chainId)
                )
            )
        );
    }

    function toString(address[] memory _ary) public pure returns (string memory) {
        string memory result = "\n";
        for (uint256 i = 0; i < _ary.length; i++) {
            result = string(abi.encodePacked(result, vm.toString(_ary[i])));
            if (i != _ary.length - 1) {
                result = string(abi.encodePacked(result, "\n"));
            }
        }
        result = string(abi.encodePacked(result));
        return result;
    }

    function computeCreate3Address(address _deployer, bytes32 _salt) public pure returns (address) {
        // Hard-coded bytecode of the proxy used by Create3 to deploy the contract. See the
        // `CREATE3.sol`
        // library for details.
        bytes memory proxyBytecode = hex"67363d3d37363d34f03d5260086018f3";

        address proxy = vm.computeCreate2Address(_salt, keccak256(proxyBytecode), _deployer);
        return vm.computeCreateAddress(proxy, 1);
    }

    /**
     * @notice Returns an array of addresses that appear more than once in the given array.
     * @param _ary The unfiltered elements.
     * @return duplicates The duplicated elements.
     */
    function getDuplicatedElements(address[] memory _ary) public pure returns (address[] memory) {
        // We return early here because the for-loop below will throw an underflow error if the
        // array is empty.
        if (_ary.length == 0) return new address[](0);

        address[] memory sorted = sortAddresses(_ary);
        address[] memory duplicates = new address[](_ary.length);
        uint256 numDuplicates = 0;
        for (uint256 i = 0; i < sorted.length - 1; i++) {
            if (sorted[i] == sorted[i + 1]) {
                duplicates[numDuplicates] = sorted[i];
                numDuplicates++;
            }
        }
        address[] memory trimmed = new address[](numDuplicates);
        for (uint256 i = 0; i < numDuplicates; i++) {
            trimmed[i] = duplicates[i];
        }
        return trimmed;
    }

    function isConfigObjectEmpty(UserSphinxConfig memory _config) internal pure returns (bool) {
        if (
            _config.mainnets.length == 0 &&
            _config.testnets.length == 0 &&
            bytes(_config.projectName).length == 0
        ) {
            return true;
        } else {
            return false;
        }
    }

    function fetchAndValidateConfig(address _script) public returns (UserSphinxConfig memory) {
        // We keep track of if we've called the configureSphinx() function yet or not so we
        // can avoid situations where there would be an infinite loop due to user calling
        // safeAddress() from their configureSphinx() function.
        if (calledConfigureSphinx == false) {
            calledConfigureSphinx = true;
            ISphinxScript(_script).configureSphinx();
        }

        UserSphinxConfig memory config = ISphinxScript(_script).sphinxFetchConfig();
        validate(config);
        return config;
    }

    /**
     * @notice Performs validation on the user's deployment. This mainly checks that the user's
     *         configuration is valid. This validation occurs regardless of the `SphinxMode` (e.g.
     *         proposals, broadcasting, etc).
     */
    function validate(UserSphinxConfig memory _config) public pure {
        // We still explicitly check if the config is empty b/c you could define the sphinxConfig
        // function, but not actually configure any options in it.
        if (isConfigObjectEmpty(_config)) {
            revert(
                "Sphinx: Detected missing Sphinx config. Are you sure you implemented the `configureSphinx` function correctly?\nSee the configuration options reference for more information:\nhttps://github.com/sphinx-labs/sphinx/blob/master/docs/writing-scripts.md#configuration-options"
            );
        }

        require(
            bytes(_config.projectName).length > 0,
            "Sphinx: Your 'sphinxConfig.projectName' cannot be an empty string. Please retrieve it from Sphinx's UI."
        );
    }

    /**
     * @notice Performs validation for a broadcast on a live network (i.e. not an Anvil or Hardhat
     *         node).
     */
    function validateLiveNetworkCLI(IGnosisSafe _safe, address _script) external {
        SphinxLockProject memory _project = fetchProjectFromLock(_script);
        require(
            _project.defaultSafe.owners.length == 1,
            "Sphinx: You cannot use the Deploy CLI with projects that have multiple owners."
        );

        // We use a try/catch instead of `vm.envOr` because `vm.envOr` is a potentially
        // state-changing operation, which means this entire function would need to be marked as
        // state-changing. However, we shouldn't do that because this call would be broadcasted.
        uint256 privateKey;
        try vm.envUint("PRIVATE_KEY") returns (uint256 _privateKey) {
            privateKey = _privateKey;
        } catch {
            revert("Sphinx: Did not detect 'PRIVATE_KEY' environment variable.");
        }

        address deployer = vm.addr(privateKey);
        require(
            deployer == _project.defaultSafe.owners[0],
            string(
                abi.encodePacked(
                    "Sphinx: The address corresponding to your 'PRIVATE_KEY' environment variable must match the address in the 'owners' array.\n",
                    "Address of your env variable: ",
                    vm.toString(deployer),
                    "\n",
                    "Address in the 'owners' array: ",
                    vm.toString(_project.defaultSafe.owners[0])
                )
            )
        );

        if (address(_safe).code.length > 0) {
            // Check that the deployer is the sole owner of the Gnosis Safe.
            require(
                _safe.isOwner(deployer),
                "Sphinx: The deployer must be an owner of the Gnosis Safe."
            );
            require(
                _safe.getOwners().length == 1,
                "Sphinx: The deployer must be the only owner of the Gnosis Safe."
            );
        }
    }

    function getInitialChainState(
        address _safe,
        ISphinxModule _sphinxModule
    ) private view returns (InitialChainState memory) {
        if (address(_safe).code.length == 0) {
            return
                InitialChainState({
                    isSafeDeployed: false,
                    isModuleDeployed: false,
                    isExecuting: false
                });
        } else {
            bool isModuleDeployed = address(_sphinxModule).code.length > 0;
            return
                InitialChainState({
                    isSafeDeployed: true,
                    isModuleDeployed: isModuleDeployed,
                    isExecuting: isModuleDeployed
                        ? _sphinxModule.activeMerkleRoot() != bytes32(0)
                        : false
                });
        }
    }

    function validateProposal(address _script) external {
        fetchAndValidateConfig(_script);
    }

    function getGnosisSafeProxyInitCode() internal pure returns (bytes memory) {
        return
            hex"608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea2646970667358221220d1429297349653a4918076d650332de1a1068c5f3e07c5c82360c277770b955264736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";
    }

    function getGnosisSafeProxyAddress(address _script) public returns (address) {
        (
            bytes memory safeInitializerData,
            SphinxLockProject memory project
        ) = getGnosisSafeInitializerData(_script);

        bytes32 salt = keccak256(
            abi.encodePacked(keccak256(safeInitializerData), project.defaultSafe.saltNonce)
        );
        bytes memory safeProxyInitCode = getGnosisSafeProxyInitCode();
        bytes memory deploymentData = abi.encodePacked(
            safeProxyInitCode,
            uint256(uint160(safeSingletonAddress))
        );
        address addr = vm.computeCreate2Address(
            salt,
            keccak256(deploymentData),
            safeFactoryAddress
        );
        return addr;
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministic}.
     *
     * Note: Copied from openzeppelin/contracts
     */
    function predictDeterministicAddress(
        address implementation,
        bytes32 salt,
        address deployer
    ) internal pure returns (address predicted) {
        assembly {
            let ptr := mload(0x40)
            mstore(add(ptr, 0x38), deployer)
            mstore(add(ptr, 0x24), 0x5af43d82803e903d91602b57fd5bf3ff)
            mstore(add(ptr, 0x14), implementation)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73)
            mstore(add(ptr, 0x58), salt)
            mstore(add(ptr, 0x78), keccak256(add(ptr, 0x0c), 0x37))
            predicted := keccak256(add(ptr, 0x43), 0x55)
        }
    }

    function getSphinxModuleAddress(address _script) public returns (address) {
        address safeProxyAddress = getGnosisSafeProxyAddress(_script);
        bytes32 salt = keccak256(
            abi.encode(
                safeProxyAddress,
                safeProxyAddress,
                // We always set the `saltNonce` of the Sphinx Module to `0` because the
                // `sphinxConfig.saltNonce` field is only used when deploying the Gnosis Safe. It's
                // not necessary to include the `saltNonce` here because a new Sphinx Module will be
                // deployed if the user sets the `sphinxConfig.saltNonce` to a new value and then
                // deploys a new Gnosis Safe using Sphinx's standard deployment method. A new Sphinx
                // Module is deployed in this scenario because its address is determined by the
                // address of the Gnosis Safe. It'd only be necessary to include a `saltNonce` for
                // the Sphinx Module if a single Gnosis Safe wants to enable multiple Sphinx
                // Modules, which isn't a feature that we currently support.
                0
            )
        );
        address addr = predictDeterministicAddress(
            sphinxModuleImplAddress,
            salt,
            sphinxModuleProxyFactoryAddress
        );
        return addr;
    }

    /**
     * @notice Encodes initializer data that will be submitted to a Gnosis Safe Proxy Factory to
     *         deploy a Gnosis Safe, deploy a Sphinx Module, and enable the Sphinx Module in the
     *         Gnosis Safe. We're able to deploy and enable the Sphinx Module in the same
     *         transaction that we deploy the Gnosis Safe by executing a transaction in the
     *         Gnosis Safe's `setup` function. Specifically, the `setup` function calls into
     *         the Gnosis Safe's `setupModules` function, which calls into its `execute` function.
     *         In the `execute` function, we batch two calls to the `SphinxModuleProxyFactory`:
     *         1. `deploySphinxModuleProxyFromSafe`
     *         2. `enableSphinxModuleProxyFromSafe`
     *         We're able to these calls by using Gnosis Safe's `MultiSend` contract.
     *
     * @dev    We refer to this function in Sphinx's documentation. Make sure to update the
     *         documentation if you change the name of this function or change its file
     *         location.
     */
    function getGnosisSafeInitializerData(
        address _script
    ) internal returns (bytes memory safeInitializerData, SphinxLockProject memory project) {
        project = fetchProjectFromLock(_script);

        // Sort the owner addresses. This provides a consistent ordering, which makes it easier
        // to calculate the `CREATE2` address of the Gnosis Safe off-chain.
        address[] memory sortedOwners = sortAddresses(project.defaultSafe.owners);

        ISphinxModuleProxyFactory moduleProxyFactory = ISphinxModuleProxyFactory(
            sphinxModuleProxyFactoryAddress
        );

        // Encode the data that will deploy the Sphinx Module.
        bytes memory encodedDeployModuleCall = abi.encodeWithSelector(
            moduleProxyFactory.deploySphinxModuleProxyFromSafe.selector,
            // Use the zero-hash as the salt.
            bytes32(0)
        );
        // Encode the data in a format that can be executed using `MultiSend`.
        bytes memory deployModuleMultiSendData = abi.encodePacked(
            // We use `Call` so that the Gnosis Safe calls the `SphinxModuleProxyFactory` to deploy
            // the Sphinx Module. This makes it easier for off-chain tooling to calculate the
            // deployed Sphinx Module address because the `SphinxModuleProxyFactory`'s address is a
            // global constant.
            uint8(IEnum.GnosisSafeOperation.Call),
            moduleProxyFactory,
            uint256(0),
            encodedDeployModuleCall.length,
            encodedDeployModuleCall
        );

        // Encode the data that will enable the Sphinx Module in the Gnosis Safe.
        bytes memory encodedEnableModuleCall = abi.encodeWithSelector(
            moduleProxyFactory.enableSphinxModuleProxyFromSafe.selector,
            // Use the zero-hash as the salt.
            bytes32(0)
        );
        // Encode the data in a format that can be executed using `MultiSend`.
        bytes memory enableModuleMultiSendData = abi.encodePacked(
            // We can only enable the module by delegatecalling the `SphinxModuleProxyFactory`
            // from the Gnosis Safe.
            uint8(IEnum.GnosisSafeOperation.DelegateCall),
            moduleProxyFactory,
            uint256(0),
            encodedEnableModuleCall.length,
            encodedEnableModuleCall
        );

        // Encode the entire `MultiSend` data.
        bytes memory multiSendData = abi.encodeWithSelector(
            IMultiSend.multiSend.selector,
            abi.encodePacked(deployModuleMultiSendData, enableModuleMultiSendData)
        );

        // Encode the call to the Gnosis Safe's `setup` function, which we'll submit to the Gnosis
        // Safe Proxy Factory. This data contains the `MultiSend` data that we created above.
        safeInitializerData = abi.encodePacked(
            IGnosisSafe.setup.selector,
            abi.encode(
                sortedOwners,
                project.defaultSafe.threshold,
                multiSendAddress,
                multiSendData,
                // This is the default fallback handler used by Gnosis Safe during their
                // standard deployments.
                compatibilityFallbackHandlerAddress,
                // The following fields are for specifying an optional payment as part of the
                // deployment. We don't use them.
                address(0),
                0,
                address(0)
            )
        );
    }

    function getMerkleRootNonce(ISphinxModule _module) public view returns (uint) {
        if (address(_module).code.length == 0) {
            return 0;
        } else {
            return _module.merkleRootNonce();
        }
    }

    function create2Deploy(bytes memory _initCodeWithArgs) public returns (address) {
        address addr = vm.computeCreate2Address(
            bytes32(0),
            keccak256(_initCodeWithArgs),
            DETERMINISTIC_DEPLOYMENT_PROXY
        );

        if (addr.code.length == 0) {
            bytes memory code = abi.encodePacked(bytes32(0), _initCodeWithArgs);
            (bool success, ) = DETERMINISTIC_DEPLOYMENT_PROXY.call(code);
            require(
                success,
                string(
                    abi.encodePacked(
                        "failed to deploy contract. expected address: ",
                        vm.toString(addr)
                    )
                )
            );
        }

        return addr;
    }

    function deploySphinxSystem(SystemContractInfo[] memory _contracts) public {
        vm.etch(
            DETERMINISTIC_DEPLOYMENT_PROXY,
            hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
        );

        for (uint256 i = 0; i < _contracts.length; i++) {
            SystemContractInfo memory ct = _contracts[i];
            address addr = create2Deploy(ct.initCodeWithArgs);
            require(
                addr == ct.expectedAddress,
                string(
                    abi.encodePacked(
                        "Sphinx: address mismatch. expected address: ",
                        vm.toString(ct.expectedAddress)
                    )
                )
            );
        }
    }

    function getNumRootAccountAccesses(
        Vm.AccountAccess[] memory _accesses,
        address _safeAddress,
        uint64 _callDepth,
        uint256 _chainId
    ) private view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < _accesses.length; i++) {
            Vm.AccountAccess memory access = _accesses[i];

            if (isRootAccountAccess(access, _safeAddress, _callDepth, _chainId)) {
                count += 1;
            }
        }
        return count;
    }

    /**
     * This function checks if a given AccountAccess struct is a "root" access meaning that it
     * is a transaction in the users script that originates from their Safe.
     *
     * We consider an AccountAccess struct to be a root access if fits these conditions:
     * - The accessor is the safe address, meaning the transaction originated from the safe.
     * - The AccountAccessKind is either Call or Create. These types are the only ones that
     * represent real transactions. However, if Foundry added support for deploying with the
     * CREATE2 opcode instead of the default CREATE2 factory, then Create2 would probably be
     * added as a kind here.
     * - The call depth is equal to the input call depth, which has a default value of 2. The
     * expected depth is 2 because the depth value starts at 1 and because we initiate the
     * collection process by doing a delegatecall to the entry point function so the depth is 2 by
     * the time any transactions get sent in the users script. The call depth will be greater than
     * 2 in Forge tests, which is why this is an input parameter instead of a constant.
     * - The target contract is not `SphinxUtils`. This can occur if the user calls a function
     * that calls into this contract during their script. I.e calling safeAddress().
     * - The chain ID of the account access is correct. It will differ if the user forks other
     * networks in their script.
     */
    function isRootAccountAccess(
        Vm.AccountAccess memory _access,
        address _safeAddress,
        uint64 _callDepth,
        uint256 _chainId
    ) private view returns (bool) {
        return
            _access.accessor == _safeAddress &&
            _access.depth == _callDepth &&
            _access.chainInfo.chainId == _chainId &&
            _access.account != address(this) &&
            (_access.kind == VmSafe.AccountAccessKind.Call ||
                _access.kind == VmSafe.AccountAccessKind.Create);
    }

    function getNumNestedAccountAccesses(
        Vm.AccountAccess[] memory _accesses,
        uint256 _rootIdx,
        address _safeAddress,
        uint64 _callDepth,
        uint256 _chainId
    ) internal view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = _rootIdx + 1; i < _accesses.length; i++) {
            Vm.AccountAccess memory access = _accesses[i];
            // If the current account access is a new root account access or exists on a different
            // chain, we'll return from this function.
            if (
                isRootAccountAccess(access, _safeAddress, _callDepth, _chainId) ||
                _chainId != access.chainInfo.chainId
            ) {
                return count;
            } else {
                count += 1;
            }
        }
        return count;
    }

    /**
     * @notice Serializes the `FoundryDeploymentInfo` struct. The serialized string is the
     *         same structure as the `FoundryDeploymentInfo` struct except all `uint` and `string`
     *         fields are ABI encoded (see inline docs for details).
     */
    function serializeFoundryDeploymentInfo(
        FoundryDeploymentInfo memory _deployment
    ) public returns (string memory) {
        // Set the object key to an empty JSON, which ensures that there aren't any existing values
        // stored in memory for the object key.
        vm.serializeJson(deploymentInfoKey, "{}");

        // Serialize simple fields
        vm.serializeAddress(deploymentInfoKey, "safeAddress", _deployment.safeAddress);
        vm.serializeAddress(deploymentInfoKey, "moduleAddress", _deployment.moduleAddress);
        vm.serializeAddress(deploymentInfoKey, "executorAddress", _deployment.executorAddress);
        vm.serializeBytes(deploymentInfoKey, "safeInitData", _deployment.safeInitData);
        vm.serializeBool(deploymentInfoKey, "requireSuccess", _deployment.requireSuccess);
        vm.serializeBool(deploymentInfoKey, "arbitraryChain", _deployment.arbitraryChain);
        vm.serializeBytes(
            deploymentInfoKey,
            "encodedAccountAccesses",
            _deployment.encodedAccountAccesses
        );

        // Next, we'll serialize `uint` values as ABI encoded bytes. We don't serialize them as
        // numbers to prevent the possibility that they lose precision due JavaScript's relatively
        // low integer size limit. We'll ABI decode these values in TypeScript. It'd be simpler to
        // serialize the numbers as strings without ABI encoding them, but that strategy is blocked
        // by a Foundry bug: https://github.com/foundry-rs/foundry/issues/6533
        vm.serializeBytes(deploymentInfoKey, "nonce", abi.encode(_deployment.nonce));
        vm.serializeBytes(deploymentInfoKey, "chainId", abi.encode(_deployment.chainId));
        vm.serializeBytes(
            deploymentInfoKey,
            "blockGasLimit",
            abi.encode(_deployment.blockGasLimit)
        );
        vm.serializeBytes(deploymentInfoKey, "blockNumber", abi.encode(_deployment.blockNumber));
        vm.serializeBytes(
            deploymentInfoKey,
            "executionMode",
            abi.encode(uint256(_deployment.executionMode))
        );
        vm.serializeBytes(
            deploymentInfoKey,
            "fundsRequestedForSafe",
            abi.encode(_deployment.fundsRequestedForSafe)
        );
        vm.serializeBytes(
            deploymentInfoKey,
            "safeStartingBalance",
            abi.encode(_deployment.safeStartingBalance)
        );
        // Serialize the gas estimates as an ABI encoded `uint256` array.
        vm.serializeBytes(deploymentInfoKey, "gasEstimates", abi.encode(_deployment.gasEstimates));
        // Serialize the Sphinx library version as an ABI encoded string. We ABI encode it to ensure
        // that Foundry doesn't serialize it as a number, which will happen if the
        // `sphinxLibraryVersion` consists only of numbers. If Foundry serializes it as a number,
        // it'll be prone to the same precision loss due to JavaScript's low integer size limit.
        vm.serializeBytes(
            deploymentInfoKey,
            "sphinxLibraryVersion",
            abi.encode(_deployment.sphinxLibraryVersion)
        );

        // Serialize structs
        vm.serializeString(
            deploymentInfoKey,
            "newConfig",
            serializeSphinxConfig(_deployment.newConfig)
        );
        string memory finalJson = vm.serializeString(
            deploymentInfoKey,
            "initialState",
            serializeInitialChainState(_deployment.initialState)
        );

        return finalJson;
    }

    function serializeSphinxConfig(
        InternalSphinxConfig memory config
    ) internal returns (string memory) {
        // Set the object key to an empty JSON, which ensures that there aren't any existing values
        // stored in memory for the object key.
        vm.serializeJson(sphinxConfigKey, "{}");

        vm.serializeAddress(sphinxConfigKey, "owners", config.owners);
        vm.serializeString(sphinxConfigKey, "mainnets", config.mainnets);
        vm.serializeString(sphinxConfigKey, "testnets", config.testnets);
        // Serialize the string values as ABI encoded strings.
        vm.serializeBytes(sphinxConfigKey, "projectName", abi.encode(config.projectName));
        vm.serializeBytes(sphinxConfigKey, "orgId", abi.encode(config.orgId));
        // Serialize the `uint` values as ABI encoded bytes.
        vm.serializeBytes(sphinxConfigKey, "saltNonce", abi.encode(config.saltNonce));
        string memory finalJson = vm.serializeBytes(
            sphinxConfigKey,
            "threshold",
            abi.encode(config.threshold)
        );

        return finalJson;
    }

    function serializeInitialChainState(
        InitialChainState memory _initialState
    ) internal returns (string memory) {
        // Set the object key to an empty JSON, which ensures that there aren't any existing values
        // stored in memory for the object key.
        vm.serializeJson(initialStateKey, "{}");

        vm.serializeBool(initialStateKey, "isSafeDeployed", _initialState.isSafeDeployed);
        vm.serializeBool(initialStateKey, "isModuleDeployed", _initialState.isModuleDeployed);
        string memory finalJson = vm.serializeBool(
            initialStateKey,
            "isExecuting",
            _initialState.isExecuting
        );

        return finalJson;
    }

    function fetchNumCreateAccesses(
        Vm.AccountAccess[] memory _accesses,
        uint256 _chainId
    ) public pure returns (uint) {
        uint numCreateAccesses = 0;
        for (uint i = 0; i < _accesses.length; i++) {
            if (isCreateAccountAccess(_accesses[i], _chainId)) {
                numCreateAccesses += 1;
            }
        }
        return numCreateAccesses;
    }

    function isCreateAccountAccess(
        Vm.AccountAccess memory _access,
        uint256 _chainId
    ) private pure returns (bool) {
        return
            _access.kind == VmSafe.AccountAccessKind.Create &&
            _access.chainInfo.chainId == _chainId;
    }

    function parseAccountAccesses(
        Vm.AccountAccess[] memory _accesses,
        address _safeAddress,
        uint64 _callDepth,
        uint256 _chainId
    ) internal view returns (ParsedAccountAccess[] memory) {
        uint256 numRoots = getNumRootAccountAccesses(_accesses, _safeAddress, _callDepth, _chainId);

        ParsedAccountAccess[] memory parsed = new ParsedAccountAccess[](numRoots);
        uint256 rootCount = 0;
        for (uint256 rootIdx = 0; rootIdx < _accesses.length; rootIdx++) {
            Vm.AccountAccess memory access = _accesses[rootIdx];

            if (isRootAccountAccess(access, _safeAddress, _callDepth, _chainId)) {
                uint256 numNested = getNumNestedAccountAccesses(
                    _accesses,
                    rootIdx,
                    _safeAddress,
                    _callDepth,
                    _chainId
                );
                Vm.AccountAccess[] memory nested = new Vm.AccountAccess[](numNested);
                for (uint256 nestedIdx = 0; nestedIdx < numNested; nestedIdx++) {
                    // Calculate the index of the current nested `AccountAccess` in the `_accesses`
                    // array. This index starts after the index of the root element (`rootIdx + 1`),
                    // then adds the offset (`nestedIdx`) to iterate through subsequent nested
                    // elements.
                    uint256 accessesIndex = rootIdx + nestedIdx + 1;

                    nested[nestedIdx] = _accesses[accessesIndex];
                }
                parsed[rootCount] = ParsedAccountAccess({ root: access, nested: nested });
                rootCount += 1;
            }
        }
        return parsed;
    }

    /**
     * @notice Converts an `AccountAccess` struct to a struct that can be executed from a Gnosis Safe
     *         via `GnosisSafe.execTransactionFromModule`.
     */
    function makeGnosisSafeTransaction(
        Vm.AccountAccess memory _access
    ) internal pure returns (GnosisSafeTransaction memory) {
        if (_access.kind == VmSafe.AccountAccessKind.Create) {
            // `Create` transactions are executed by delegatecalling the `CreateCall`
            // contract from the Gnosis Safe.
            return
                GnosisSafeTransaction({
                    operation: IEnum.GnosisSafeOperation.DelegateCall,
                    // The `value` field is always unused for `DelegateCall` operations.
                    // Instead, value is transferred via `performCreate` below.
                    value: 0,
                    to: createCallAddress,
                    txData: abi.encodePacked(
                        ICreateCall.performCreate.selector,
                        abi.encode(_access.value, _access.data)
                    )
                });
        } else if (_access.kind == VmSafe.AccountAccessKind.Call) {
            return
                GnosisSafeTransaction({
                    operation: IEnum.GnosisSafeOperation.Call,
                    value: _access.value,
                    to: _access.account,
                    txData: _access.data
                });
        } else {
            revert("AccountAccess kind is incorrect. Should never happen.");
        }
    }

    function getModuleInitializerMultiSendData() private pure returns (bytes memory) {
        ISphinxModuleProxyFactory moduleProxyFactory = ISphinxModuleProxyFactory(
            sphinxModuleProxyFactoryAddress
        );

        // Encode the data that will deploy the Sphinx Module.
        bytes memory encodedDeployModuleCall = abi.encodeWithSelector(
            moduleProxyFactory.deploySphinxModuleProxyFromSafe.selector,
            // Use the zero-hash as the salt.
            bytes32(0)
        );
        // Encode the data in a format that can be executed using `MultiSend`.
        bytes memory deployModuleMultiSendData = abi.encodePacked(
            // We use `Call` so that the Gnosis Safe calls the `SphinxModuleProxyFactory` to deploy
            // the Sphinx Module. This makes it easier for off-chain tooling to calculate the
            // deployed Sphinx Module address because the `SphinxModuleProxyFactory`'s address is a
            // global constant.
            uint8(IEnum.GnosisSafeOperation.Call),
            moduleProxyFactory,
            uint256(0),
            encodedDeployModuleCall.length,
            encodedDeployModuleCall
        );

        // Encode the data that will enable the Sphinx Module in the Gnosis Safe.
        bytes memory encodedEnableModuleCall = abi.encodeWithSelector(
            moduleProxyFactory.enableSphinxModuleProxyFromSafe.selector,
            // Use the zero-hash as the salt.
            bytes32(0)
        );
        // Encode the data in a format that can be executed using `MultiSend`.
        bytes memory enableModuleMultiSendData = abi.encodePacked(
            // We can only enable the module by delegatecalling the `SphinxModuleProxyFactory`
            // from the Gnosis Safe.
            uint8(IEnum.GnosisSafeOperation.DelegateCall),
            moduleProxyFactory,
            uint256(0),
            encodedEnableModuleCall.length,
            encodedEnableModuleCall
        );

        // Encode the entire `MultiSend` data.
        bytes memory multiSendData = abi.encodeWithSelector(
            IMultiSend.multiSend.selector,
            abi.encodePacked(deployModuleMultiSendData, enableModuleMultiSendData)
        );

        return multiSendData;
    }

    /**
     * @notice Deploys a Gnosis Safe, deploys a Sphinx Module,
     *         and enables the Sphinx Module in the Gnosis Safe
     */
    function deployModuleAndGnosisSafe(
        address[] memory _owners,
        uint256 _threshold,
        address _safeAddress
    ) public {
        // Get the encoded data that'll be sent to the `MultiSend` contract to deploy and enable the
        // Sphinx Module in the Gnosis Safe.
        bytes memory multiSendData = getModuleInitializerMultiSendData();

        // Deploy the Gnosis Safe Proxy to its expected address. We use cheatcodes to deploy the
        // Gnosis Safe instead of the standard deployment process to avoid a bug in Foundry.
        // Specifically, Foundry throws an error if we attempt to deploy a contract at the same
        // address as the `FOUNDRY_SENDER`. We must set the Gnosis Safe as the `FOUNDRY_SENDER` so
        // that deployed linked library addresses match the production environment. If we deploy the
        // Gnosis Safe without using cheatcodes, Foundry would throw an error here.
        deployContractTo(
            getGnosisSafeProxyInitCode(),
            abi.encode(safeSingletonAddress),
            _safeAddress
        );

        // Initialize the Gnosis Safe proxy.
        IGnosisSafe(_safeAddress).setup(
            sortAddresses(_owners),
            _threshold,
            multiSendAddress,
            multiSendData,
            // This is the default fallback handler used by Gnosis Safe during their
            // standard deployments.
            compatibilityFallbackHandlerAddress,
            // The following fields are for specifying an optional payment as part of the
            // deployment. We don't use them.
            address(0),
            0,
            payable(address(0))
        );
    }

    /**
     * @notice Deploy a contract to the given address. Slightly modified from
     *         `StdCheats.sol:deployCodeTo`.
     */
    function deployContractTo(
        bytes memory _initCode,
        bytes memory _abiEncodedConstructorArgs,
        address _where
    ) public {
        require(_where.code.length == 0, "SphinxUtils: contract already exists");
        vm.etch(_where, abi.encodePacked(_initCode, _abiEncodedConstructorArgs));
        (bool success, bytes memory runtimeBytecode) = _where.call("");
        require(success, "SphinxUtils: failed to create runtime bytecode");
        vm.etch(_where, runtimeBytecode);
        if (vm.getNonce(_where) == 0) {
            // Set the nonce to be 1, which is the initial nonce for contracts.
            vm.setNonce(_where, 1);
        }
    }

    /**
     * @notice Initializes the `FoundryDeploymentInfo` struct. Meant to be called before calling
     *         the user's script. Does not include all of the fields of the `FoundryDeploymentInfo`
     *         because some fields, like `gasEstimates`, must be assigned after the user's Forge
     *         script is called.
     */
    function initializeDeploymentInfo(
        UserSphinxConfig memory _config,
        ExecutionMode _executionMode,
        address _executor,
        address _scriptAddress
    ) external returns (FoundryDeploymentInfo memory) {
        address safe = getGnosisSafeProxyAddress(_scriptAddress);
        address module = getSphinxModuleAddress(_scriptAddress);

        (
            bytes memory safeInitData,
            SphinxLockProject memory project
        ) = getGnosisSafeInitializerData(_scriptAddress);
        FoundryDeploymentInfo memory deploymentInfo;
        deploymentInfo.executionMode = _executionMode;
        deploymentInfo.executorAddress = _executor;
        deploymentInfo.safeAddress = safe;
        deploymentInfo.moduleAddress = module;
        deploymentInfo.chainId = block.chainid;
        deploymentInfo.blockGasLimit = block.gaslimit;
        deploymentInfo.safeInitData = safeInitData;
        deploymentInfo.newConfig = InternalSphinxConfig({
            projectName: project.projectName,
            mainnets: _config.mainnets,
            testnets: _config.testnets,
            threshold: project.defaultSafe.threshold,
            saltNonce: project.defaultSafe.saltNonce,
            owners: project.defaultSafe.owners,
            orgId: project.orgId
        });
        deploymentInfo.initialState = getInitialChainState(safe, ISphinxModule(module));
        deploymentInfo.nonce = getMerkleRootNonce(ISphinxModule(module));
        deploymentInfo.sphinxLibraryVersion = getSphinxLibraryVersion();
        deploymentInfo.arbitraryChain = false;
        deploymentInfo.requireSuccess = true;

        // We fill the block number in later in Typescript. We have to do this using a call to the rpc provider
        // instead of using `block.number` within forge b/c some networks have odd changes to what `block.number`
        // means. For example, on Arbitrum` `block.number` returns the block number on ETH instead of Arbitrum.
        // This could cause the simulation to use an invalid block number and fail.
        deploymentInfo.blockNumber = 0;

        return deploymentInfo;
    }

    /**
     * @notice Estimates the values of the `gas` fields in the Merkle leaves using `gasleft`. This
     *         provides a more accurate estimate than simulating the transactions for two reasons:
     *         1. The `eth_estimateGas` RPC method includes the minimum gas limit (21k) and the
     *            calldata cost of initiating the transaction, which shouldn't be factored into the
     *            Merkle leaf's `gas` field because it's executed as a sub-call.
     *         2. It could be possible to underestimate the Merkle leaf's gas using a simulation due
     *            to gas refunds. Consider this (contrived) edge case: Say a user's transaction
     *            deploys a contract, which costs ~2 million gas, and also involves a large gas
     *            refund (~500k gas). Since gas refunds occur after the transaction is executed, the
     *            broadcast file will have a gas estimate of ~1.5 million gas. However, the user's
     *            transaction costs 2 million gas. This will cause Sphinx to underestimate the
     *            Merkle leaf's gas, resulting in a failed deployment on-chain. This situation uses
     *            contrived numbers, but the point is that using `gasleft` is accurate even if
     *            there's a large gas refund.
     */
    function estimateMerkleLeafGas(
        ParsedAccountAccess[] memory _accountAccesses,
        address _scriptAddress,
        FoundryDeploymentInfo memory _deploymentInfo
    ) public returns (uint256[] memory) {
        address safe = getGnosisSafeProxyAddress(_scriptAddress);
        address module = getSphinxModuleAddress(_scriptAddress);

        uint256[] memory gasEstimates = new uint256[](_accountAccesses.length);

        // We prank the Sphinx Module to replicate the production environment. In prod, the Sphinx
        // Module calls the Gnosis Safe.
        vm.startPrank(module);

        // Update the balance of the Safe to be equal to the starting balance + the amount of funds
        // requested. This ensures the Safe is properly funded when we execute the transactions below.
        vm.deal(
            _deploymentInfo.safeAddress,
            _deploymentInfo.safeStartingBalance + _deploymentInfo.fundsRequestedForSafe
        );

        for (uint256 i = 0; i < _accountAccesses.length; i++) {
            ParsedAccountAccess memory parsed = _accountAccesses[i];
            GnosisSafeTransaction memory txn = makeGnosisSafeTransaction(parsed.root);
            uint256 startGas = gasleft();
            bool success = IGnosisSafe(safe).execTransactionFromModule(
                txn.to,
                txn.value,
                txn.txData,
                txn.operation
            );
            uint256 finalGas = gasleft();

            require(success, "Sphinx: failed to call Gnosis Safe from Sphinx Module");

            // Include a buffer to ensure the user's transaction doesn't fail on-chain due to
            // variations between the simulation and the live execution environment. There are a
            // couple areas in particular that could lead to variations:
            // 1. The on-chain state could vary, which could impact the cost of execution. This is
            //    inherently a source of variation because there's a delay between the simulation
            //    and execution.
            // 2. Foundry's simulation is treated as a single transaction, which means SLOADs are
            //    more likely to be "warm" (i.e. cheaper) than the production environment, where
            //    transactions may be split between batches.
            //
            // Collecting the user's transactions in the same process as this function does not
            // impact the Merkle leaf gas fields because we use `vm.snapshot`/`vm.revertTo`. Also,
            // state changes on one fork do not impact the gas cost on other forks.
            //
            // We chose to multiply the gas by 10-20% because multiplying it by a higher number
            // could make a very large transaction unexecutable on-chain. Since this multiplier
            // doesn't impact small transactions very much, we add a constant amount too. We use
            // smaller buffers on Rootstock because gas costs are slightly lower on these networks
            // compared to the EVM. Also, the block gas limit is significantly lower on Rootstock.
            if (_deploymentInfo.chainId == 30 || _deploymentInfo.chainId == 31) {
                gasEstimates[i] = 60_000 + ((startGas - finalGas) * 11) / 10;
            } else {
                gasEstimates[i] = 120_000 + ((startGas - finalGas) * 12) / 10;
            }
        }

        vm.stopPrank();

        return gasEstimates;
    }

    /**
     * Handles adding an execute action that confirms the Safe has received the requested funding from
     * our backend. We only include this check if the user requests funds from our backend. This check
     * just protects the user from an error occurring in our backend which causes the funds to fail to
     * delivered. This check causes the deployment to immediately fail instead of potentially failing
     * part of the way through.
     *
     * It's worth noting the following edge case which this check does not protect against:
     * Say there are already funds in the Safe, the user then proposes a script that requires those
     * funds, the user executes a transaction via the Safe using a third party interface that reduces
     * the balance of the Safe. We then attempt to execute the deployment and it fails because the Safe
     * does not have enough funds.
     *
     * This is a specific case of the more general problem that if a deployment depends on some specific
     * on chain state, the deployment may end up failing if that state changes in between the deployment
     * being approved and it getting executed.
     */
    function addBalanceCheckAction(
        FoundryDeploymentInfo memory _deploymentInfo,
        ParsedAccountAccess[] memory parsedAccesses,
        uint64 _callDepth
    ) private pure returns (ParsedAccountAccess[] memory) {
        // We don't need a check balance action if the user did not request funds
        if (_deploymentInfo.fundsRequestedForSafe == 0) {
            return parsedAccesses;
        }

        ParsedAccountAccess memory checkFundsAccess = ParsedAccountAccess(
            VmSafe.AccountAccess({
                chainInfo: VmSafe.ChainInfo(0, _deploymentInfo.chainId),
                kind: VmSafe.AccountAccessKind.Call,
                account: _deploymentInfo.safeAddress,
                accessor: _deploymentInfo.safeAddress,
                initialized: true,
                // The old balance is the starting balance + the amount of funds requested because
                // this action is executed after we've already transferred the requested funds to
                // the Safe.
                oldBalance: _deploymentInfo.safeStartingBalance +
                    _deploymentInfo.fundsRequestedForSafe,
                newBalance: _deploymentInfo.safeStartingBalance +
                    _deploymentInfo.fundsRequestedForSafe,
                deployedCode: "",
                // We transfer the current balance of the Safe + the amount of funds requested
                // We include the starting balance in addition to the amount requested because the
                // safe may already have a balance that exceeds the amount requested.
                // The following case could occur if we just checked for the amount requested:
                // 1. The user requestes 0.1 eth using a Safe that has 0.15 eth
                // 2. Our backend executes the deployment and fails to transfer the requested 0.1 eth
                // due to an error.
                // 3. The rest of the deployment is executed and this check passed because the balance
                // of the Safe is greater than the amount of funds requested.
                // 4. Transactions in the rest of the deployment may fail because the Safe doesn't have
                // the amount of funds expected.
                value: _deploymentInfo.safeStartingBalance + _deploymentInfo.fundsRequestedForSafe,
                data: "",
                reverted: false,
                storageAccesses: new VmSafe.StorageAccess[](0),
                depth: _callDepth
            }),
            new VmSafe.AccountAccess[](0)
        );

        ParsedAccountAccess[] memory parsedAccessesWithCheck = new ParsedAccountAccess[](
            parsedAccesses.length + 1
        );
        parsedAccessesWithCheck[0] = checkFundsAccess;
        for (uint i = 1; i < parsedAccessesWithCheck.length; i++) {
            parsedAccessesWithCheck[i] = parsedAccesses[i - 1];
        }

        return parsedAccessesWithCheck;
    }

    /**
     * @notice Finishes creating the `FoundryDeploymentInfo` struct. Meant to be called after
     *         running the user's script and after calling `initializeDeploymentInfo`.
     *
     * @param _deploymentInfo The `FoundryDeploymentInfo` struct, which contains the initial values.
     *                        We'll modify this struct then return its final version.
     */
    function finalizeDeploymentInfo(
        FoundryDeploymentInfo memory _deploymentInfo,
        Vm.AccountAccess[] memory _accesses,
        uint64 _callDepth,
        address _scriptAddress
    ) external returns (FoundryDeploymentInfo memory) {
        ParsedAccountAccess[] memory parsedAccesses = parseAccountAccesses(
            _accesses,
            _deploymentInfo.safeAddress,
            _callDepth,
            // We use `deploymentInfo.chainId` instead of `block.chainid` because the user may have
            // changed the current `block.chainid` in their script by forking a different network.
            _deploymentInfo.chainId
        );

        parsedAccesses = addBalanceCheckAction(_deploymentInfo, parsedAccesses, _callDepth);

        // ABI encode each `ParsedAccountAccess` element individually. If, instead, we ABI encode
        // the entire array as a unit, the encoded bytes will be too large for EthersJS to ABI
        // decode, which causes an error. This occurs for large deployments, i.e. greater than 50
        // contracts.
        _deploymentInfo.encodedAccountAccesses = new bytes[](parsedAccesses.length);
        for (uint256 i = 0; i < parsedAccesses.length; i++) {
            _deploymentInfo.encodedAccountAccesses[i] = abi.encode(parsedAccesses[i]);
        }

        _deploymentInfo.gasEstimates = estimateMerkleLeafGas(
            parsedAccesses,
            _scriptAddress,
            _deploymentInfo
        );

        return _deploymentInfo;
    }

    function concatJsonPath(string memory a, string memory b) public pure returns (string memory) {
        return string(abi.encodePacked(a, ".", b));
    }

    function fetchProjectFromLock(address _script) public returns (SphinxLockProject memory) {
        UserSphinxConfig memory _config = fetchAndValidateConfig(_script);
        string memory root = vm.projectRoot();
        string memory path = string(abi.encodePacked(root, "/sphinx.lock"));
        string memory json = vm.readFile(path);

        string memory basePath = concatJsonPath(".projects", _config.projectName);
        bool exists = vm.keyExists(json, basePath);
        if (!exists) {
            revert(
                string(
                    abi.encodePacked(
                        "Project with the name ",
                        bytes(_config.projectName),
                        " was not found in the `sphinx.lock` file. You need to register this project in the Sphinx UI and then run `npx sphinx sync` to generate the latest `sphinx.lock` file. We recommend committing this file to version control."
                    )
                )
            );
        }

        string memory safePath = concatJsonPath(basePath, "defaultSafe");
        SphinxLockProject memory project = SphinxLockProject({
            projectName: vm.parseJsonString(json, concatJsonPath(basePath, "projectName")),
            orgId: vm.parseJsonString(json, ".orgId"),
            defaultSafe: DefaultSafe({
                owners: vm.parseJsonAddressArray(json, concatJsonPath(safePath, "owners")),
                safeName: vm.parseJsonString(json, concatJsonPath(safePath, "safeName")),
                threshold: vm.parseJsonUint(json, concatJsonPath(safePath, "threshold")),
                saltNonce: vm.parseJsonUint(json, concatJsonPath(safePath, "saltNonce"))
            })
        });

        return project;
    }
}
