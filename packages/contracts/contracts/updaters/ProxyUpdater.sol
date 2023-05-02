// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { IProxyUpdater } from "../interfaces/IProxyUpdater.sol";

/**
 * @title ProxyUpdater
 * @notice An abstract contract for setting storage slot values within a proxy at a given storage
        slot key and offset.
 */
abstract contract ProxyUpdater is IProxyUpdater {
    /**
     * @notice Sets a proxy's storage slot value at a given storage slot key and offset. Note that
       this will thrown an error if the length of the storage slot value plus the offset (both in
       bytes) is greater than 32.
     *
     *         To illustrate how this function works, consider the following example. Say we call
     *         this function on some storage slot key with the input parameters:
     *         `_offset = 2`
     *         `_value = 0x22222222`
     *
     *         Say the storage slot value prior to calling this function is:
     *         0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC
     *
     *         This function works by creating a bit mask at the location of the value, which in
     *         this case is at an `offset` of 2 and is 4 bytes long (extending left from the
     *         offset). The bit mask would be:
     *         0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFF
     *
     *         Applying this bit mask to the existing slot value, we get:
     *         0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC00000000CCCC
     *
     *         Then, we offset the new value to the correct location in the storage slot:
     *         0x0000000000000000000000000000000000000000000000000000222222220000
     *
     *         Lastly, add these two values together to get the new storage slot value:
     *         0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC22222222CCCC
     *
     * @param _key     Storage slot key to modify.
     * @param _offset  Bytes offset of the new storage slot value from the right side of the storage
       slot. An offset of 0 means the new value will start at the right-most byte of the storage
       slot.
     * @param _value New value of the storage slot at the given key and offset. The length of the
                     value is in the range [1, 32] bytes (inclusive).
     */
    function setStorage(bytes32 _key, uint8 _offset, bytes memory _value) public virtual {
        require(_value.length <= 32, "ProxyUpdater: value is too large");

        bytes32 valueBytes32 = bytes32(_value);

        // If the length of the new value equals the size of the storage slot, we can just replace
        // the entire slot value.
        if (_value.length == 32) {
            assembly {
                sstore(_key, valueBytes32)
            }
        } else {
            // Load the existing storage slot value.
            bytes32 currVal;
            assembly {
                currVal := sload(_key)
            }

            // Convert lengths from bytes to bits. Makes calculations easier to read.
            uint256 valueLengthBits = _value.length * 8;
            uint256 offsetBits = _offset * 8;

            // Create a bit mask that will set the values of the existing storage slot to 0 at the
            // location of the new value. It's worth noting that the expresion:
            // `(2 ** (valueLengthBits) - 1)` would revert if `valueLengthBits = 256`. However,
            // this will never happen because values of length 32 are set directly in the
            // if-statement above.
            uint256 mask = ~((2 ** (valueLengthBits) - 1) << offsetBits);

            // Apply the bit mask to the existing storage slot value.
            bytes32 maskedCurrVal = bytes32(mask) & currVal;

            // Calculate the offset of the value from the left side of the storage slot.
            // Denominated in bits for consistency.
            uint256 leftOffsetBits = 256 - offsetBits - valueLengthBits;

            // Shift the value right so that it's aligned with the bitmasked location.
            bytes32 rightShiftedValue = (valueBytes32 >> leftOffsetBits);

            // Create the new storage slot value by adding the bit masked slot value to the new
            // value.
            uint256 newVal = uint256(maskedCurrVal) + uint256(rightShiftedValue);

            // Set the new value of the storage slot.
            assembly {
                sstore(_key, newVal)
            }
        }
    }
}
