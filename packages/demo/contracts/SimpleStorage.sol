contract SimpleStorage {
    // Define immutable variables
    uint8 public immutable number;
    bool public immutable stored;
    address public immutable otherStorage;
    // Leave `storageName` unchanged since Solidity doesn't support immutable strings
    string public storageName;

    // We must instantiate the immutable variables in the constructor so that
    // Solidity doesn't throw an error.
    constructor(uint8 _number, bool _stored, address _otherStorage) {
        number = _number;
        stored = _stored;
        otherStorage = _otherStorage;
    }
}
