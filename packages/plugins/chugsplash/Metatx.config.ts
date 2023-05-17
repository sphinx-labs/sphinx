import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

const projectName = 'Meta txs'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
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
        _immutableUint: 1,
        _immutableContractReference:
          '0x1111111111111111111111111111111111111111',
      },
    },
  },
}

export default config
