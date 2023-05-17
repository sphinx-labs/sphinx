import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

import {
  invalidConstructorArgsPartOne,
  invalidConstructorArgsPartTwo,
} from '../test/constants'

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
    ConstructorArgsValidationPartOne: {
      contract: 'ConstructorArgsValidationPartOne',
      constructorArgs: {
        ...invalidConstructorArgsPartOne,
        _immutableUint: 1,
      },
    },
    ConstructorArgsValidationPartTwo: {
      contract: 'ConstructorArgsValidationPartTwo',
      constructorArgs: {
        ...invalidConstructorArgsPartTwo,
      },
    },
  },
}

export default config
