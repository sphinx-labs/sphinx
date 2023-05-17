const { ethers } = require('ethers')

const projectName = 'Transfer test'

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
      variables: {
        myStorage: '0x1111111111111111111111111111111111111111',
        myStateless: '0x1111111111111111111111111111111111111111',
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
