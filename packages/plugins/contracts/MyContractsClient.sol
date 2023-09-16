// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract MyContract1Client {
    event SphinxFunctionCall(string fullyQualifiedName, address to, bytes4 selector, bytes data);

    address public immutable sphinxManager;
    address public immutable sphinxClient;
    address public immutable impl;
    constructor(address _sphinxManager, address _sphinxClient, address _impl) {
        sphinxManager = _sphinxManager;
        sphinxClient = _sphinxClient;
        impl = _impl;
    }

    function incrementUint() external {
        require(msg.sender == sphinxManager, "TODO: the user probably did vm.prank/startPrank with another address");

        bytes memory encodedCall = abi.encodePacked(MyContract1Client.incrementUint.selector), abi.encode();
        bytes32 callHash = keccak256(abi.encode(address(this), encodedCall));
        uint256 currentNonce = sphinxManager.callNonces(callHash);

        sphinxClient.incrementCallCount(callHash);

        if (sphinxClient.callCount(callHash) >= currentNonce) {
            emit SphinxFunctionCall(
                "contracts/test/MyContracts.sol:MyContract1",
                address(this),
                MyContract1Client.incrementUint.selector,
                abi.encode();
            );

            (bool sphinxCallSuccess, bytes memory sphinxReturnData) = impl.delegatecall(
                abi.encodeCall(MyContract1Client.incrementUint, ())
            );
            // TODO: replace this with the assembly error message decoder snippet
            require(sphinxCallSuccess, string(sphinxReturnData));

            // TODO: if this function returns data, we'd need to decode the sphinxReturnData and
            // return it.
        }
    }
}

