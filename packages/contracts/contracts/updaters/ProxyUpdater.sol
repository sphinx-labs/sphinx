// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IProxyUpdater } from "../interfaces/IProxyUpdater.sol";

import "hardhat/console.sol";

/**
 * @title ProxyUpdater
 * @notice An abstract contract that contains the logic which sets storage slots within the proxy
 *         contract when an action is executed in the ChugSplashManager. When execution is being
 *         initiated, the ChugSplashManager sets each proxy to have a ProxyUpdater as its
 *         implementation. Then, during execution, the ChugSplashManager triggers `setStorage`
 *         actions on the proxy by calling the proxy, which then delegatecalls into a ProxyUpdater
 *         contract.
 */
abstract contract ProxyUpdater is IProxyUpdater {
    /**
     * @notice Replaces a segment of a proxy's storage slot value at a given key and offset. The
     *         storage value outside of this segment remains the same. Note that it's crucial for
     *         this function not to revert under any circumstances because this would halt the
     *         entire execution process. This means overflow checks must occur off-chain before
     *         execution begins.
     *
     *         To illustrate how this function works, consider the following example. Say we call
     *         this function on some storage slot key with the input parameters:
     *         `_offset = 2`
     *         `_value = 0x22222222`
     *
     *         Say the storage slot value prior to calling this function is:
     *         0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC
     *
     *         This function works by creating a bit mask at the location of the segment, which in
     *         this case is at an `offset` of 2 and is 4 bytes long (extending left from the
     *         offset). The bit mask would be:
     *         0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFF
     *
     *         Applying this bit mask to the existing slot value, we get:
     *         0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC00000000CCCC
     *
     *         Then, we offset the new segment to the correct location in the storage slot:
     *         0x0000000000000000000000000000000000000000000000000000222222220000
     *
     *         Lastly, add these two values together to get the new storage slot value:
     *         0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC22222222CCCC
     *
     * @param _key     Storage key to modify.
     * @param _offset  Bytes offset of the new segment from the right side of the storage slot.
     * @param _segment New value for the segment of the storage slot. The length of this value is a
     *                 bytesN value, where N is in the range [1, 32] (inclusive).
     */
    function setStorage(bytes32 _key, uint8 _offset, bytes memory _segment) external {
        bytes32 segmentBytes32 = bytes32(_segment);
        console.log('updating!');
        console.log('address', address(this));

        // If the length of the new segment equals the size of the storage slot, we can just replace
        // the entire slot value.
        if (_segment.length == 32) {
            assembly {
                sstore(_key, segmentBytes32)
            }
        } else {
            // Load the existing storage slot value.
            bytes32 currVal;
            assembly {
                currVal := sload(_key)
            }

            // Convert lengths from bytes to bits. Makes calculations easier to read.
            uint256 segmentLengthBits = _segment.length * 8;
            uint256 offsetBits = _offset * 8;

            // Create a bit mask that will set the values of the existing storage slot to 0 at the
            // location of the new segment. It's worth noting that the expresion:
            // `(2 ** (valueLengthBits) - 1)` would revert if `valueLengthBits = 256`. However,
            // this will never happen because segments of length 32 are set directly in the
            // if-statement above.
            uint256 mask = ~((2 ** (segmentLengthBits) - 1) << offsetBits);

            // Apply the bit mask to the existing storage slot value.
            bytes32 maskedCurrVal = bytes32(mask) & currVal;

            // Calculate the offset of the segment from the left side of the storage slot.
            // Denominated in bits for consistency.
            uint256 leftOffsetBits = 256 - offsetBits - segmentLengthBits;

            // Shift the segment right so that it's aligned with the bitmasked location.
            bytes32 rightShiftedSegment = (segmentBytes32 >> leftOffsetBits);

            // Create the new storage slot value by adding the bit masked slot value to the new
            // segment.
            uint256 newVal = uint256(maskedCurrVal) + uint256(rightShiftedSegment);

            // Set the new value of the storage slot.
            assembly {
                sstore(_key, newVal)
            }
        }
    }
}
