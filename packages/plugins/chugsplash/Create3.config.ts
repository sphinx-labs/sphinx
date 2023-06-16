import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

const projectName = 'My First Project'
export const orgId = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(projectName)
)

// This config intentionally uses the same organizationID, projectName, and reference name as the
// `Stateless` contract in `Storage.config.ts`. The purpose of this is to test that the Create3
// calculation generates a different address when adding a user-defined salt into the calculation.
const config: UserChugSplashConfig = {
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
  },
  contracts: {
    Stateless: {
      contract: 'Stateless',
      kind: 'no-proxy',
      constructorArgs: {
        _immutableUint: 2,
        _immutableContractReference: ethers.constants.AddressZero,
      },
      salt: '0x' + '11'.repeat(32),
    },
  },
}

export default config
