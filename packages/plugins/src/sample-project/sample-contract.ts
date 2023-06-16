export const getSampleContractFile = (solcVersion: string) => {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion};

contract HelloChugSplash {
    uint8 public number;
    bool public stored;
    address public otherStorage;
    string public storageName;
}
`
}
