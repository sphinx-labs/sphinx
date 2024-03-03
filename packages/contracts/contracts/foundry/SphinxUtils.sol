// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Vm, VmSafe } from "../../lib/forge-std/src/Vm.sol";
import { StdUtils } from "../../lib/forge-std/src/StdUtils.sol";
import { console } from "../../lib/forge-std/src/console.sol"; // TODO(later): rm

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
    SphinxConfig,
    InitialChainState,
    OptionalAddress,
    Wallet,
    ExecutionMode,
    SystemContractInfo,
    GnosisSafeTransaction,
    ParsedAccountAccess
} from "./SphinxPluginTypes.sol";
import { SphinxConstants } from "./SphinxConstants.sol";
import { ICreateCall } from "./interfaces/ICreateCall.sol";
import { IGnosisSafeProxyFactory } from "./interfaces/IGnosisSafeProxyFactory.sol";
import { IGnosisSafe } from "./interfaces/IGnosisSafe.sol";
import { IMultiSend } from "./interfaces/IMultiSend.sol";
import { IEnum } from "./interfaces/IEnum.sol";

interface ISphinxScript {
    function sphinxFetchConfig() external view returns (SphinxConfig memory);
    function configureSphinx() external;
}

contract SphinxUtils is SphinxConstants, StdUtils {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    // Source: https://github.com/Arachnid/deterministic-deployment-proxy
    address public constant DETERMINISTIC_DEPLOYMENT_PROXY =
        0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // Object keys for the JSON serialization functions in this contract.
    string internal initialStateKey = "Sphinx_Internal__InitialChainState";
    string internal deploymentInfoKey = "Sphinx_Internal__FoundryDeploymentInfo";
    string internal sphinxConfigKey = "Sphinx_Internal__SphinxConfig";

    function slice(
        bytes calldata _data,
        uint256 _start,
        uint256 _end
    ) external pure returns (bytes memory) {
        return _data[_start:_end];
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

    function getEIP1967ProxyAdminAddress(address _proxyAddress) public view returns (address) {
        // The EIP-1967 storage slot that holds the address of the owner.
        // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
        bytes32 ownerKey = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

        bytes32 ownerBytes32 = vm.load(_proxyAddress, ownerKey);

        // Convert the bytes32 value to an address.
        return address(uint160(uint256(ownerBytes32)));
    }

    function inefficientSlice(
        SphinxLeafWithProof[] memory selected,
        uint256 start,
        uint256 end
    ) public pure returns (SphinxLeafWithProof[] memory sliced) {
        sliced = new SphinxLeafWithProof[](end - start);
        for (uint256 i = start; i < end; i++) {
            sliced[i - start] = selected[i];
        }
    }

    function sortAddresses(address[] memory _unsorted) public pure returns (address[] memory) {
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

    function getSphinxWalletPrivateKey(uint256 _num) public pure returns (uint256) {
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
    ) public pure returns (Wallet[] memory) {
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

    function decodeExecutionLeafData(
        SphinxLeaf memory leaf
    )
        internal
        pure
        returns (
            address to,
            uint256 value,
            uint256 gas,
            bytes memory uri,
            uint256 operation,
            bool requireSuccess
        )
    {
        return abi.decode(leaf.data, (address, uint256, uint256, bytes, uint256, bool));
    }

    function equals(string memory _str1, string memory _str2) public pure returns (bool) {
        return keccak256(abi.encodePacked(_str1)) == keccak256(abi.encodePacked(_str2));
    }

    function toBytes32(address _addr) public pure returns (bytes32) {
        return bytes32(uint256(uint160(_addr)));
    }

    function getLeavesOnNetwork(
        SphinxLeafWithProof[] memory leaves
    ) external view returns (SphinxLeafWithProof[] memory) {
        // Check if `arbitraryChain` is `true`. If it is, there's only a single `APPROVE` leaf in
        // the tree, which applies to all networks. We return the entire array of leaves in this
        // case.
        for (uint256 i = 0; i < leaves.length; i++) {
            SphinxLeaf memory leaf = leaves[i].leaf;
            if (leaf.leafType == SphinxLeafType.APPROVE) {
                (, , , , , , bool arbitraryChain) = decodeApproveLeafData(leaf);
                if (arbitraryChain) {
                    return leaves;
                }
            }
        }

        // We know that `arbitraryChain` is `false`, so we retrieve the leaves that exist on the
        // current chain.
        uint256 numLeavesOnNetwork = 0;
        for (uint256 i = 0; i < leaves.length; i++) {
            if (leaves[i].leaf.chainId == block.chainid) {
                numLeavesOnNetwork += 1;
            }
        }

        SphinxLeafWithProof[] memory leavesOnNetwork = new SphinxLeafWithProof[](
            numLeavesOnNetwork
        );
        uint256 arrayIndex = 0;
        for (uint256 i = 0; i < leaves.length; i++) {
            if (leaves[i].leaf.chainId == block.chainid) {
                leavesOnNetwork[arrayIndex] = leaves[i];
                arrayIndex += 1;
            }
        }

        return leavesOnNetwork;
    }

    function getCodeSize(address _addr) external view returns (uint256) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size;
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
     * @notice Returns an array of unique uint256 values from a given array of uint256 values, which
     *         may contain duplicates.
     *
     * @param _values An array of uint256 values that may contain duplicates.
     */
    function getUniqueUint256(uint256[] memory _values) public pure returns (uint256[] memory) {
        // First, we get an array of unique uint256 values. We do this by iterating over the input
        // array and adding each value to a new array if it hasn't been added already.
        uint256[] memory uniqueValues = new uint256[](_values.length);
        uint256 uniqueValueCount = 0;
        for (uint256 i = 0; i < _values.length; i++) {
            bool isUnique = true;
            // Check if the value has already been added to the uniqueValues array.
            for (uint256 j = 0; j < uniqueValueCount; j++) {
                if (_values[i] == uniqueValues[j]) {
                    isUnique = false;
                    break;
                }
            }
            // If the value hasn't been added yet, add it to the uniqueValues array.
            if (isUnique) {
                uniqueValues[uniqueValueCount] = _values[i];
                uniqueValueCount += 1;
            }
        }

        // Next, we create a new array with the correct length and copy the unique uint256 values
        // into it. This is necessary because the uniqueValues array may contain zero values at the
        // end.
        uint256[] memory trimmedUniqueValues = new uint256[](uniqueValueCount);
        for (uint256 i = 0; i < uniqueValueCount; i++) {
            trimmedUniqueValues[i] = uniqueValues[i];
        }

        return trimmedUniqueValues;
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
                    "Sphinx: No network found with the given chain ID: ",
                    vm.toString(_chainId)
                )
            )
        );
    }

    function getNetworkInfo(Network _network) public pure returns (NetworkInfo memory) {
        NetworkInfo[] memory all = getNetworkInfoArray();
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].network == _network) {
                return all[i];
            }
        }
        revert("Sphinx: Could not find network. Should never happen.");
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

    function arrayContainsAddress(
        address[] memory _ary,
        address _addr
    ) private pure returns (bool) {
        for (uint256 i = 0; i < _ary.length; i++) {
            if (_ary[i] == _addr) {
                return true;
            }
        }
        return false;
    }

    function computeCreate3Address(address _deployer, bytes32 _salt) public pure returns (address) {
        // Hard-coded bytecode of the proxy used by Create3 to deploy the contract. See the
        // `CREATE3.sol`
        // library for details.
        bytes memory proxyBytecode = hex"67363d3d37363d34f03d5260086018f3";

        address proxy = vm.computeCreate2Address(_salt, keccak256(proxyBytecode), _deployer);
        return computeCreateAddress(proxy, 1);
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

    function getMappingValueSlotKey(
        bytes32 _mappingSlotKey,
        bytes32 _key
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_key, _mappingSlotKey));
    }

    function isConfigObjectEmpty(SphinxConfig memory _config) internal pure returns (bool) {
        if (
            _config.owners.length == 0 &&
            _config.threshold == 0 &&
            bytes(_config.projectName).length == 0 &&
            _config.mainnets.length == 0 &&
            _config.testnets.length == 0 &&
            _config.saltNonce == 0 &&
            bytes(_config.orgId).length == 0
        ) {
            return true;
        } else {
            return false;
        }
    }

    function fetchAndValidateConfig(address _script) public returns (SphinxConfig memory) {
        ISphinxScript(_script).configureSphinx();
        SphinxConfig memory config = ISphinxScript(_script).sphinxFetchConfig();
        validate(config);
        return config;
    }

    /**
     * @notice Performs validation on the user's deployment. This mainly checks that the user's
     *         configuration is valid. This validation occurs regardless of the `SphinxMode` (e.g.
     *         proposals, broadcasting, etc).
     */
    function validate(SphinxConfig memory _config) public pure {
        // We still explicitly check if the config is empty b/c you could define the sphinxConfig
        // function, but not actually configure any options in it.
        if (isConfigObjectEmpty(_config)) {
            revert(
                "Sphinx: Detected missing Sphinx config. Are you sure you implemented the `configureSphinx` function correctly?\nSee the configuration options reference for more information:\nhttps://github.com/sphinx-labs/sphinx/blob/master/docs/writing-scripts.md#configuration-options"
            );
        }

        require(
            _config.owners.length > 0,
            "Sphinx: You must have at least one owner in your 'sphinxConfig.owners' array before calling this function."
        );
        require(
            _config.threshold > 0,
            "Sphinx: You must set your 'sphinxConfig.threshold' to a value greater than 0 before calling this function."
        );
        require(
            _config.owners.length >= _config.threshold,
            "Sphinx: Your 'sphinxConfig.threshold' field must be less than or equal to the number of owners in your 'owners' array."
        );
        require(
            bytes(_config.projectName).length > 0,
            "Sphinx: Your 'sphinxConfig.projectName' cannot be an empty string. Please enter a project name."
        );

        address[] memory duplicateOwners = getDuplicatedElements(_config.owners);
        require(
            duplicateOwners.length == 0,
            string(
                abi.encodePacked(
                    "Sphinx: Your 'sphinxConfig.owners' array contains duplicate addresses: ",
                    toString(duplicateOwners)
                )
            )
        );
    }

    /**
     * @notice Performs validation for a broadcast on a live network (i.e. not an Anvil or Hardhat
     *         node).
     */
    function validateLiveNetworkCLI(SphinxConfig memory _config, IGnosisSafe _safe) external view {
        require(
            _config.owners.length == 1,
            "Sphinx: There must be a single owner in your 'owners' array."
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
    ) external view returns (InitialChainState memory) {
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

    function validateProposal(address _script) external {
        SphinxConfig memory config = fetchAndValidateConfig(_script);
        require(
            bytes(config.orgId).length > 0,
            "Sphinx: Your 'sphinxConfig.orgId' cannot be an empty string. Please retrieve it from Sphinx's UI."
        );
    }

    function getGnosisSafeProxyInitCode() public pure returns (bytes memory) {
        return
            hex"608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea2646970667358221220d1429297349653a4918076d650332de1a1068c5f3e07c5c82360c277770b955264736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";
    }

    function getGnosisSafeProxyAddress(address _script) public returns (address) {
        bytes memory safeInitializerData = getGnosisSafeInitializerData(_script);
        SphinxConfig memory _config = fetchAndValidateConfig(_script);

        bytes32 salt = keccak256(
            abi.encodePacked(keccak256(safeInitializerData), _config.saltNonce)
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
    ) public returns (bytes memory safeInitializerData) {
        SphinxConfig memory _config = fetchAndValidateConfig(_script);

        // Sort the owner addresses. This provides a consistent ordering, which makes it easier
        // to calculate the `CREATE2` address of the Gnosis Safe off-chain.
        address[] memory sortedOwners = sortAddresses(_config.owners);

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
                _config.threshold,
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

    function merkleRootStatusToString(
        MerkleRootStatus _status
    ) public pure returns (string memory) {
        if (_status == MerkleRootStatus.EMPTY) {
            return "empty";
        } else if (_status == MerkleRootStatus.APPROVED) {
            return "approved";
        } else if (_status == MerkleRootStatus.COMPLETED) {
            return "completed";
        } else if (_status == MerkleRootStatus.CANCELED) {
            return "cancelled";
        } else if (_status == MerkleRootStatus.FAILED) {
            return "failed";
        } else {
            revert("Sphinx: Invalid MerkleRootStatus. Should never happen.");
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
        address _safeAddress
    ) private returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < _accesses.length; i++) {
            Vm.AccountAccess memory access = _accesses[i];

            if (isRootAccountAccess(access, _safeAddress)) {
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
     * - The call depth is equal to 2. The expected depth is 2 because the depth value starts
     * at 1 and because we initiate the collection process by doing a delegatecall to the run()
     * function so the depth is 2 by the time any transactions get sent in the users script.
     */
    function isRootAccountAccess(
        Vm.AccountAccess memory _access,
        address _safeAddress
    ) private returns (bool) {
        console.log('moose', _access.accessor, uint(_access.kind));
        return
            _access.accessor == _safeAddress &&
            _access.depth == 2 &&
            (_access.kind == VmSafe.AccountAccessKind.Call ||
                _access.kind == VmSafe.AccountAccessKind.Create);
    }

    function getNumNestedAccountAccesses(
        Vm.AccountAccess[] memory _accesses,
        uint256 _rootIdx,
        address _safeAddress
    ) private returns (uint256) {
        uint256 count = 0;
        for (uint256 i = _rootIdx + 1; i < _accesses.length; i++) {
            Vm.AccountAccess memory access = _accesses[i];
            if (isRootAccountAccess(access, _safeAddress)) {
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

    function serializeSphinxConfig(SphinxConfig memory config) internal returns (string memory) {
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

    function parseAccountAccesses(
        Vm.AccountAccess[] memory _accesses,
        address _safeAddress
    ) public returns (ParsedAccountAccess[] memory) {
        uint256 numRoots = getNumRootAccountAccesses(_accesses, _safeAddress);

        ParsedAccountAccess[] memory parsed = new ParsedAccountAccess[](numRoots);
        uint256 rootCount = 0;
        for (uint256 rootIdx = 0; rootIdx < _accesses.length; rootIdx++) {
            Vm.AccountAccess memory access = _accesses[rootIdx];

            if (isRootAccountAccess(access, _safeAddress)) {
                console.log('found root');
                uint256 numNested = getNumNestedAccountAccesses(_accesses, rootIdx, _safeAddress);
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
        console.log('finished parsing');
        return parsed;
    }

    /**
     * @notice Converts an `AccountAccess` struct to a struct that can be executed from a Gnosis Safe
     *         via `GnosisSafe.execTransactionFromModule`.
     */
    function makeGnosisSafeTransaction(
        Vm.AccountAccess memory _access
    ) external pure returns (GnosisSafeTransaction memory) {
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
    ) external {
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
}
