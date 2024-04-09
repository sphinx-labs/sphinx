import { expect } from 'chai'

import { contractsExceedSizeLimitErrorMessage } from '../../src/error-messages'

describe('Error Messages', () => {
  it('contractsExceedSizeLimitErrorMessage', () => {
    const contracts = [
      {
        address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        fullyQualifiedName: 'contracts/ExampleContract.sol:ExampleContract',
      },
      { address: '0x1234567890ABCDEF1234567890ABCDEF12345678' }, // Unlabeled
    ]
    // eslint-disable-next-line prettier/prettier
    const expectedMessage =
`The following contracts are over the contract size limit (24,576 bytes), which means they
cannot be deployed on live networks:
- contracts/ExampleContract.sol:ExampleContract at 0xABCDEF1234567890ABCDEF1234567890ABCDEF12
- 0x1234567890ABCDEF1234567890ABCDEF12345678 (unlabeled)`

    const actualMessage = contractsExceedSizeLimitErrorMessage(contracts)

    expect(actualMessage).to.equal(expectedMessage)
  })
})
