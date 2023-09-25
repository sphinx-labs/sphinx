import { UserSphinxConfig } from '@sphinx-labs/core'

import {
  invalidConstructorArgsPartOne,
  invalidConstructorArgsPartTwo,
} from '../../test-folder/constants'

const projectName = 'ConstructorArgValidation'

const config: UserSphinxConfig = {
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
