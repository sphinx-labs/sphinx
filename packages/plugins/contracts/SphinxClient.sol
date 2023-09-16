// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { MyContract1Client } from "./MyContractsClient.sol";
import { DefaultCreate3 } from "@sphinx-labs/contracts/contracts/DefaultCreate3.sol";
import { Semver } from "@sphinx-labs/contracts/contracts/Semver.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { SphinxAuthProxy } from "@sphinx-labs/contracts/contracts/SphinxAuthProxy.sol";
import { SphinxManagerProxy } from "@sphinx-labs/contracts/contracts/SphinxManagerProxy.sol";
import { StdCheats } from "forge-std/src/StdCheats.sol";

enum Network {
    ethereum
}

struct SphinxConfig {
	address[] owners;
	address[] proposers;
	Network[] mainnets;
	Network[] testnets;
	uint256 threshold;
	Semver managerVersion;
}

contract SphinxClient {

    /**
     * @notice Maps a CREATE3 salt to a boolean indicating whether the salt has already been used
     *         in this deployment. We use this mapping to ensure that the user attempts to deploy
     *         only one contract at a given CREATE3 address in a single deployment.
     */
    mapping(bytes32 => bool) salts;

    /**
     * @notice Maps a call hash to the number of times the call hash was attempted to be deployed
     *         in this deployment. We use this to determine whether or not to skip function calls.
     */
    mapping(bytes32 => uint256) public callCount;

    address immutable sphinxManager;
    DefaultCreate3 immutable create3Factory;
    SphinxConfig sphinxConfig;

    struct DeployOptions {
        bytes32 salt;
        string referenceName;
    }

    event SphinxDeployment(
        string fullyQualifiedName;
        bytes constructorArgs;
        DeployOptions options;
    );

    // TODO(notes):
    // - I think we shold prepend "sphinx" to the variable names in all of the clients to avoid
    //   collisions with user-defined variables. E.g. if a user has a function param called "salt"
    //   and the logic in the corresponding client contract has a variable named "salt", then this
    //   could result in unexpected behavior. I started to do this in these contracts but I don't
    //   think it's exhaustive.

    constructor(SphinxConfig memory _sphinxConfig) {
        sphinxConfig = _sphinxConfig;
        defaultCreate3 = new DefaultCreate3();

        // Sort the owners in ascending order. This makes it required to calculate the the address
        // of the SphinxAuth contract, which is generated using the auth data.
        address[] memory sortedOwners = sortAddresses(_sphinxConfig.owners);

        bytes memory authData = abi.encode(sortedOwners, _sphinxConfig.threshold);
        bytes32 authSalt = keccak256(abi.encode(authData, _sphinxConfig.projectName));
        address auth = Create2.computeAddress(
                authSalt,
                // We can hard-code the resulting bytes32 value since it's known in advance:
                keccak256(
                    abi.encodePacked(
                        type(SphinxAuthProxy).creationCode,
                        // AuthFactory address (twice):
                        abi.encode(0x7AB6e96AC770025c33033dA05631B1D6EdC2Ee85, 0x7AB6e96AC770025c33033dA05631B1D6EdC2Ee85)
                    )
                )
            );

        bytes32 sphinxManagerSalt = keccak256(abi.encode(auth, _sphinxConfig.projectName, hex""));

        sphinxManager = Create2.computeAddress(
                sphinxManagerSalt,
                keccak256(
                    abi.encodePacked(
                        type(SphinxManagerProxy).creationCode,
                        // SphinxRegistry address (twice):
                        abi.encode(0x1132793DCc6AF3827CcB92FE9699Bc1C62Ba3eE2, 0x1132793DCc6AF3827CcB92FE9699Bc1C62Ba3eE2)
                    )
                )
            );
    }

    function incrementCallCount(bytes32 _callHash) external {
        callCount[_callHash] += 1;
    }

    function deployMyContract1(
        int _intArg,
        uint _uintArg,
        address _addressArg,
        address _otherAddressArg
    ) internal returns (MyContract1Client) {
        bytes32 sphinxCreate3Salt = keccak256(abi.encode("MyContract1", bytes32(0)));
        require(
            !salts[sphinxCreate3Salt],
            "SphinxClient: CREATE3 salt already used in this deployment. Please use a different 'salt' or 'referenceName'."
        );

        address create3Address = create3Factory.getAddressFromDeployer(
            create3Salt,
            sphinxManager
        );

        if (create3Address.code.length == 0) {
            bytes memory constructorArgs = abi.encode(_intArg, _uintArg, _addressArg, _otherAddressArg);
            deployCodeTo("contracts/test/MyContracts.sol:MyContract1", constructorArgs, create3Address);

            emit SphinxDeployment(
                "contracts/test/MyContracts.sol:MyContract1",
                constructorArgs,
                DeployOptions(bytes32(0), "MyContract1")
            );
        }

        // The implementation's address is the CREATE3 address minus one.
        address impl = address(uint160(address(create3Address)) - 1);

        vm.etch(impl, create3Address.code);
        deployCodeTo("contracts/MyContractsClient.sol:MyContract1", abi.encode(sphinxManager, address(this), impl), create3Address);

        // We set this to 'true' even if a contract has already been deployed at the CREATE3 address
        // prior to this deployment. This is because the purpose of the 'salts' mapping is to
        // prevent the user from accidentally attempting to deploy a contract twice at the same
        // address in the *same* deployment script.
        salts[sphinxCreate3Salt] = true;

        return MyContract1Client(create3Address);
    }

    function deployMyContract1(
        int _intArg,
        uint _uintArg,
        address _addressArg,
        address _otherAddressArg,
        DeployOptions memory _sphinxOptions
    ) internal returns (MyContract1Client) {}

    // TODO: move this to SphinxUtils, or at least Sphinx.sol
    function sortAddresses(address[] memory _unsorted) private pure returns (address[] memory) {
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
}
