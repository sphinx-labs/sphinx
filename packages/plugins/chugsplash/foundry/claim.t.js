const { ethers } = require('ethers')

const projectName = 'Claim test'

const hre = require('hardhat')
require('@nomiclabs/hardhat-ethers')


const main = async () => {
  const provider = hre.ethers.provider
  const data = await provider.getNetwork()

  return {
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
}

const result = main()

module.exports = result

// module.exports = {
//   // Configuration options for the project:
//   options: {
//     organizationID: ethers.utils.keccak256(
//       ethers.utils.toUtf8Bytes(projectName)
//     ),
//     projectName,
//   },
//   contracts: {
//     MySimpleStorage: {
//       contract: 'SimpleStorage',
//       variables: {
//         myStorage: '0x1111111111111111111111111111111111111111',
//         myStateless: '0x1111111111111111111111111111111111111111',
//       },
//       constructorArgs: {
//         // _immutableContractReference:
//         //   '0x1111111111111111111111111111111111111111',
//         _statelessImmutableContractReference:
//           '0x1111111111111111111111111111111111111111',
//       },
//       unsafeAllow: {
//         delegatecall: true,
//       }
//     },
//   },
// }
