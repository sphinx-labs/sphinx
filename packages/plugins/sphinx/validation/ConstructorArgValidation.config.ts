import { UserConfig } from '@sphinx/core'

import {
  invalidConstructorArgsPartOne,
  invalidConstructorArgsPartTwo,
} from '../../test/constants'

const projectName = 'ConstructorArgValidation'

const config: UserConfig = {
  projectName,
  contracts: {
    ConstructorArgsValidationPartOne: {
      contract: 'ConstructorArgsValidationPartOne',
      kind: 'proxy',
      constructorArgs: {
        ...invalidConstructorArgsPartOne,
        _immutableUint: 1,
      },
    },
    ConstructorArgsValidationPartTwo: {
      contract: 'ConstructorArgsValidationPartTwo',
      kind: 'proxy',
      constructorArgs: {
        ...invalidConstructorArgsPartTwo,
      },
    },
  },
}

export default config
