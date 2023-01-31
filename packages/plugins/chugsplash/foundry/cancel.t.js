module.exports = {
  // Configuration options for the project:
  options: {
    projectName: 'Cancel test',
  },
  contracts: {
    MySimpleStorage: {
      contract: 'SimpleStorage',
      variables: {
        myStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}
