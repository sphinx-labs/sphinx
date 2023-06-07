const { ethers } = require('ethers')

const projectName = 'Claim test'

module.exports = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
  },
  contracts: {
    MySimpleStorage: {
      contract: 'SimpleStorage',
      kind: 'no-proxy',
      unsafeAllow: {
        flexibleConstructor: true
      },
      constructorArgs: {
        _immutableContractReference:
          '0x1111111111111111111111111111111111111111',
        _statelessImmutableContractReference:
          '0x1111111111111111111111111111111111111111',
      },
    },
  },
}
