import { UserSphinxConfig } from '@sphinx/core'

import {
  projectName as constructorArgName,
  config as constructorArgConfig,
} from './projects/validation/ConstructorArgValidation.config'
import {
  projectName as validationName,
  config as validationConfig,
} from './projects/validation/Validation.config'
import {
  projectName as reverterName,
  config as reverterConfig,
} from './projects/validation/Reverter.config'

const config: UserSphinxConfig = {
  projects: {
    [constructorArgName]: constructorArgConfig,
    [validationName]: validationConfig,
    [reverterName]: reverterConfig,
  },
}

export default config
