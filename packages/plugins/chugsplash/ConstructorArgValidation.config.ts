import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

const projectName = 'Constructor Args Validation'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
  },
  contracts: {
    ConstructorArgsValidation: {
      contract: 'ConstructorArgsValidation',
      constructorArgs: {
        _immutableUint: 1,
      },
    },
  },
}

export default config
