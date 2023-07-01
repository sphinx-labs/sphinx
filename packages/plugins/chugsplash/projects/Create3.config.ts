import { UserProjectConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

const projectName = 'Create3'

// This config intentionally uses the same organizationID, projectName, and reference name as the
// `Stateless` contract in `Storage.config.ts`. The purpose of this is to test that the Create3
// calculation generates a different address when adding a user-defined salt into the calculation.
const config: UserProjectConfig = {
  contracts: {
    Stateless: {
      contract: 'Stateless',
      kind: 'immutable',
      constructorArgs: {
        _immutableUint: 2,
        _immutableContractReference: ethers.constants.AddressZero,
      },
      salt: 1,
    },
  },
}

export { config, projectName }
