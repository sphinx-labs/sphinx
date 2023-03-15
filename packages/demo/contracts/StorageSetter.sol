// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import { Owned } from "@rari-capital/solmate/src/auth/Owned.sol";

// TODO: StorageInitializer
// TODO: docs: this is only meant to be used with the 'no-proxy' type in chugsplash!
contract StorageSetter {
    address private immutable _owner = msg.sender;

    bool private _initialized;

    modifier onlyOwner() virtual {
        require(msg.sender == _owner, "TODO");

        _;
    }

    function setStorage(bytes32 _key, uint8 _offset, bytes memory _segment) external onlyOwner {
        require(!_initialized, "TODO");
        bytes32 segmentBytes32 = bytes32(_segment);

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

    function stopInitializing() external onlyOwner {
        _initialized = true;
    }
}
