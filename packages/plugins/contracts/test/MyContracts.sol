// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Governor } from "@openzeppelin/contracts/governance/Governor.sol";
import { SphinxUtils } from "@sphinx-labs/contracts/contracts/foundry/SphinxUtils.sol";

struct TopLevelStruct {
    int256 a;
}

contract MyContract1 {
    int256 public intArg;
    int256 public secondIntArg;
    int256 public thirdIntArg;
    uint256 public uintArg;
    address public addressArg;
    address public otherAddressArg;

    struct MyStruct {
        int256 a;
        int256 b;
        MyNestedStruct c;
    }

    struct MyNestedStruct {
        address d;
    }

    constructor(int256 _intArg, uint256 _uintArg, address _addressArg, address _otherAddressArg) {
        intArg = _intArg;
        uintArg = _uintArg;
        addressArg = _addressArg;
        otherAddressArg = _otherAddressArg;
    }

    function incrementUint() external {
        uintArg += 1;
    }

    function set(int256 _int) external {
        intArg = _int;
    }

    function set(address _addr, address _otherAddr) external {
        addressArg = _addr;
        otherAddressArg = _otherAddr;
    }

    function setInts(int256 _a, int256 _b, int256 _c) external {
        intArg = _a;
        secondIntArg = _b;
        thirdIntArg = _c;
    }

    function setMyStructValues(MyStruct memory _myStruct) external {
        intArg = _myStruct.a;
        secondIntArg = _myStruct.b;
        addressArg = _myStruct.c.d;
    }

    function myPureFunction() external pure returns (MyStruct memory) {
        return MyStruct({ a: 42, b: 123, c: MyNestedStruct({ d: address(256) }) });
    }

    function reverter() external pure {
        revert("reverter");
    }
}

contract MyContract2 {
    uint256 public number;

    function incrementMyContract2(uint256 _num) external {
        number += _num;
    }

    receive() external payable {}
}

contract MyContractPayable {
    constructor() payable {}
}

contract MyOwnable is Ownable {
    uint256 public value;

    constructor(address _safe, uint256 _initialValue) {
        value = _initialValue;
        _transferOwnership(_safe);
    }

    function increment() external {
        value += 1;
    }

    function set(uint256 _value) external onlyOwner {
        value = _value;
    }
}

// This contract's size is ~22500 bytes, which is near the contract size limit of 24576 bytes. The
// contract's deployment cost is very close to the maximum batch size limit on vanilla Anvil nodes.
contract MyLargeContract is Governor, AccessControl {
    constructor() Governor("") {
        // The large number of SSTOREs increases the deployment cost significantly.
        for (uint160 i = 0; i < 150; i++) {
            _grantRole(bytes32(0), address(i));
        }
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(Governor, AccessControl) returns (bool) {}

    function name() public view override(Governor) returns (string memory) {}

    function clock() public view override returns (uint48) {}

    function CLOCK_MODE() public view override returns (string memory) {}

    function COUNTING_MODE() public view virtual override returns (string memory) {}

    function votingDelay() public view virtual override returns (uint256) {}

    function votingPeriod() public view virtual override returns (uint256) {}

    function quorum(uint256 timepoint) public view virtual override returns (uint256) {}

    function hasVoted(
        uint256 proposalId,
        address account
    ) public view virtual override returns (bool) {}

    function _quorumReached(uint256 proposalId) internal view virtual override returns (bool) {}

    function _voteSucceeded(uint256 proposalId) internal view virtual override returns (bool) {}

    function _getVotes(
        address account,
        uint256 timepoint,
        bytes memory params
    ) internal view virtual override returns (uint256) {}

    function _countVote(
        uint256 proposalId,
        address account,
        uint8 support,
        uint256 weight,
        bytes memory params
    ) internal virtual override {}
}

contract DuplicateContractName {
    function duplicateContractTwo() external {}
}

library MyLibraryOne {
    function myFirstLibraryFunction() external pure returns (uint256) {
        return 42;
    }
}

library MyLibraryTwo {
    function mySecondLibraryFunction() external pure returns (uint256) {
        return 123;
    }
}

// A contract that contains calls to libraries. We call two distinct libraries, and make two calls
// to the same library, to ensure that our TypeScript logic can handle contracts with a somewhat
// complex `linkReferences` field in its artifact.
contract MyContractWithLibraries {
    uint256 public myValue;

    function doubleValue() external {
        myValue = 2 * MyLibraryOne.myFirstLibraryFunction();
    }

    function tripleValue() external {
        myValue = 3 * MyLibraryOne.myFirstLibraryFunction();
    }

    function newValue() external {
        myValue = MyLibraryTwo.mySecondLibraryFunction();
    }
}

contract MyImmutableContract {
    uint256 public immutable myFirstImmutable;
    uint8 public immutable mySecondImmutable;

    constructor(uint256 _one, uint8 _two) {
        myFirstImmutable = _one;
        mySecondImmutable = _two;
    }

    function addImmutables() external view returns (uint) {
        return myFirstImmutable + uint256(mySecondImmutable);
    }
}

contract ExceedsContractMaxSizeLimit is SphinxUtils {}
