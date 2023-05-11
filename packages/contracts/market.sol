contract ChugSplashMarketplace {

    uint _currTokenId = 0;

    // Mapping from token ID to owner address
    mapping(uint256 => address) private _owners;

    function import(string _org) external {
        require(msg.sender == registry.owners(_org));
        _owners[_currTokenId] = msg.sender;
        _currTokenId++;
    }
}
