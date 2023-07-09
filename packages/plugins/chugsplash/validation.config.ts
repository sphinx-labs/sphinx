import { UserChugSplashConfig } from '@chugsplash/core'

import {
  projectName as constructorArgName,
  config as constructorArgConfig,
} from './projects/validation/ConstructorArgValidation.config'
import {
  projectName as validationName,
  config as validationConfig,
} from './projects/validation/Validation.config'

const config: UserChugSplashConfig = {
  projects: {
    [constructorArgName]: constructorArgConfig,
    [validationName]: validationConfig,
  },
}

export default config
