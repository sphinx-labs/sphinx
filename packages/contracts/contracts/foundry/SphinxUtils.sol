// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Vm } from "sphinx-forge-std/Vm.sol";
import { StdUtils } from "sphinx-forge-std/StdUtils.sol";

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
    DeploymentInfo,
    HumanReadableAction,
    NetworkInfo,
    NetworkType,
    Network,
    SphinxConfig,
    InitialChainState,
    OptionalAddress,
    Wallet,
    Label
} from "./SphinxPluginTypes.sol";
import { SphinxContractInfo, SphinxConstants } from "./SphinxConstants.sol";
import { IGnosisSafeProxyFactory } from "./interfaces/IGnosisSafeProxyFactory.sol";
import { IGnosisSafe } from "./interfaces/IGnosisSafe.sol";
import { IMultiSend } from "./interfaces/IMultiSend.sol";
import { IEnum } from "./interfaces/IEnum.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";

contract SphinxUtils is SphinxConstants, StdUtils {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bool private SPHINX_INTERNAL__TEST_VERSION_UPGRADE =
        vm.envOr("SPHINX_INTERNAL__TEST_VERSION_UPGRADE", false);
    string private rootPluginPath =
        vm.envOr("DEV_FILE_PATH", string("./node_modules/@sphinx-labs/plugins/"));
    string private rootFfiPath = string(abi.encodePacked(rootPluginPath, "dist/foundry/"));
    string private mainFfiScriptPath = string(abi.encodePacked(rootFfiPath, "index.js"));

    uint256 private systemOwnerPrivateKey =
        vm.envOr("SPHINX_INTERNAL__OWNER_PRIVATE_KEY", uint256(0));

    address public systemOwner =
        systemOwnerPrivateKey != 0
            ? vm.rememberKey(systemOwnerPrivateKey)
            : 0x226F14C3e19788934Ff37C653Cf5e24caD198341;

    // Source: https://github.com/Arachnid/deterministic-deployment-proxy
    address public constant DETERMINISTIC_DEPLOYMENT_PROXY =
        0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // Number of networks that Sphinx supports, i.e. the number of networks in the `Networks` enum
    // in SphinxPluginTypes.sol. Unfortunately, we can't retrieve this value using type(Network).max
    // because Solidity v0.8.0 doesn't support this operation. The test file for this contract
    // contains a test that ensures this value is correct.
    uint8 internal constant numSupportedNetworks = 23;

    function slice(
        bytes calldata _data,
        uint256 _start,
        uint256 _end
    ) external pure returns (bytes memory) {
        return _data[_start:_end];
    }

    function getEIP1967ProxyAdminAddress(address _proxyAddress) public view returns (address) {
        // The EIP-1967 storage slot that holds the address of the owner.
        // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
        bytes32 ownerKey = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

        bytes32 ownerBytes32 = vm.load(_proxyAddress, ownerKey);

        // Convert the bytes32 value to an address.
        return address(uint160(uint256(ownerBytes32)));
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

    function getNetworkInfoArray() public pure returns (NetworkInfo[] memory) {
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
            network: Network.sepolia,
            name: "sepolia",
            chainId: 11155111,
            networkType: NetworkType.Testnet
        });
        all[13] = NetworkInfo({
            network: Network.optimism_sepolia,
            name: "optimism_sepolia",
            chainId: 11155420,
            networkType: NetworkType.Testnet
        });
        all[14] = NetworkInfo({
            network: Network.arbitrum_sepolia,
            name: "arbitrum_sepolia",
            chainId: 421614,
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
            network: Network.base_sepolia,
            name: "base_sepolia",
            chainId: 84532,
            networkType: NetworkType.Testnet
        });
        return all;
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

    function toString(Network[] memory _network) public pure returns (string memory) {
        string memory result = "\n";
        for (uint256 i = 0; i < _network.length; i++) {
            result = string(abi.encodePacked(result, getNetworkInfo(_network[i]).name));
            if (i != _network.length - 1) {
                result = string(abi.encodePacked(result, "\n"));
            }
        }
        return result;
    }

    function removeNetworkType(
        Network[] memory _networks,
        NetworkType _networkType
    ) public pure returns (Network[] memory) {
        Network[] memory notNetworkType = new Network[](_networks.length);
        uint256 numNotNetworkType = 0;
        for (uint256 i = 0; i < _networks.length; i++) {
            if (getNetworkInfo(_networks[i]).networkType != _networkType) {
                notNetworkType[numNotNetworkType] = _networks[i];
                numNotNetworkType++;
            }
        }
        Network[] memory trimmed = new Network[](numNotNetworkType);
        for (uint256 i = 0; i < numNotNetworkType; i++) {
            trimmed[i] = notNetworkType[i];
        }
        return trimmed;
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
        if (result.exitCode != 0) {
            revert(string(result.stderr));
        }
        return abi.decode(result.stdout, (bool));
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

        address proxy = computeCreate2Address(_salt, keccak256(proxyBytecode), _deployer);
        return computeCreateAddress(proxy, 1);
    }

    /**
     * @notice Returns an array of Networks that appear more than once in the given array.
     * @param _networks The unfiltered elements.
     * @return duplicates The duplicated elements.
     */
    function getDuplicatedElements(
        Network[] memory _networks
    ) public pure returns (Network[] memory) {
        // We return early here because the for-loop below will throw an underflow error if the
        // array is empty.
        if (_networks.length == 0) return new Network[](0);

        Network[] memory sorted = sortNetworks(_networks);
        Network[] memory duplicates = new Network[](_networks.length);
        uint256 numDuplicates = 0;
        for (uint256 i = 0; i < sorted.length - 1; i++) {
            if (sorted[i] == sorted[i + 1]) {
                duplicates[numDuplicates] = sorted[i];
                numDuplicates++;
            }
        }
        Network[] memory trimmed = new Network[](numDuplicates);
        for (uint256 i = 0; i < numDuplicates; i++) {
            trimmed[i] = duplicates[i];
        }
        return trimmed;
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

    /**
     * @notice Sorts the networks in ascending order according to the Network enum's value.
     * @param _unsorted The networks to sort.
     * @return sorted The sorted networks.
     */
    function sortNetworks(Network[] memory _unsorted) private pure returns (Network[] memory) {
        Network[] memory sorted = _unsorted;
        for (uint256 i = 0; i < sorted.length; i++) {
            for (uint256 j = i + 1; j < sorted.length; j++) {
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

    /**
     * @notice Performs validation on the user's deployment. This mainly checks that the user's
     *         configuration is valid. This validation occurs regardless of the `SphinxMode` (e.g.
     *         proposals, broadcasting, etc).
     */
    function validate(SphinxConfig memory _config) external pure {
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

        address[] memory duplicateOwners = getDuplicatedElements(_config.owners);
        Network[] memory duplicateMainnets = getDuplicatedElements(_config.mainnets);
        Network[] memory duplicateTestnets = getDuplicatedElements(_config.testnets);
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
    }

    /**
     * @notice Performs validation for a broadcast on a live network (i.e. not an Anvil or Hardhat
     *         node).
     */
    function validateLiveNetworkBroadcast(
        SphinxConfig memory _config,
        IGnosisSafe _safe
    ) external view {
        require(
            sphinxModuleProxyFactoryAddress.code.length > 0,
            "Sphinx: Unsupported network. Contact the Sphinx team if you'd like us to support it."
        );
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

    function validateProposal(SphinxConfig memory _config) external pure {
        require(
            bytes(_config.orgId).length > 0,
            "Sphinx: Your 'sphinxConfig.orgId' cannot be an empty string. Please retrieve it from Sphinx's UI."
        );
        require(
            bytes(_config.projectName).length > 0,
            "Sphinx: Your 'sphinxConfig.projectName' cannot be an empty string. Please enter a project name."
        );
    }

    function getSphinxSafeAddress(SphinxConfig memory _config) public pure returns (address) {
        address[] memory owners = _config.owners;
        uint256 threshold = _config.threshold;

        address[] memory sortedOwners = sortAddresses(owners);
        bytes memory safeInitializerData = getGnosisSafeInitializerData(sortedOwners, threshold);
        bytes32 salt = keccak256(
            abi.encodePacked(keccak256(safeInitializerData), _config.saltNonce)
        );
        bytes memory deploymentData = abi.encodePacked(
            safeProxyBytecode,
            uint256(uint160(safeSingletonAddress))
        );
        address addr = computeCreate2Address(salt, keccak256(deploymentData), safeFactoryAddress);
        return addr;
    }

    function getSphinxModuleAddress(SphinxConfig memory _config) public pure returns (address) {
        address safeProxyAddress = getSphinxSafeAddress(_config);
        bytes32 saltNonce = bytes32(0);
        bytes32 salt = keccak256(abi.encode(safeProxyAddress, safeProxyAddress, saltNonce));
        address addr = Clones.predictDeterministicAddress(
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
        address[] memory _owners,
        uint _threshold
    ) public pure returns (bytes memory safeInitializerData) {
        require(
            _owners.length > 0,
            "Sphinx: You must have at least one owner in your 'sphinxConfig.owners' array."
        );
        require(
            _threshold > 0,
            "Sphinx: You must set your 'sphinxConfig.threshold' to a value greater than 0."
        );

        // Sort the owner addresses. This provides a consistent ordering, which makes it easier
        // to calculate the `CREATE2` address of the Gnosis Safe off-chain.
        address[] memory sortedOwners = sortAddresses(_owners);

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
}
