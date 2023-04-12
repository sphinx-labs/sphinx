import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

import {
  invalidValueTypesPartOne,
  invalidValueTypesPartTwo,
} from '../test/constants'

const projectName = 'Constructor Args Validation'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
    claimer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
  contracts: {
    ConstructorArgsValidationPartOne: {
      contract: 'ConstructorArgsValidationPartOne',
      constructorArgs: {
        ...invalidValueTypesPartOne,
        _immutableUint: 1,
      },
    },
    ConstructorArgsValidationPartTwo: {
      contract: 'ConstructorArgsValidationPartTwo',
      constructorArgs: {
        ...invalidValueTypesPartTwo,
      },
    },
  },
}

export default config
