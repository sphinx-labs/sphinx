module.exports = {
  // Configuration options for the project:
  options: {
    projectID: '0x' + '00'.repeat(31) + '02',
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
