import { UserChugSplashConfig } from '@chugsplash/core'

import {
  projectName as constructorArgName,
  config as constructorArgConfig,
} from './projects/ConstructorArgValidation.config'
import {
  projectName as create3Name,
  config as create3Config,
} from './projects/Create3.config'
// TODO: uncomment after supporting new meta txns
// import {
//   projectName as metatxName,
//   config as metatxConfig,
// } from './projects/Metatx.config'
import {
  projectName as noProxyContractReferenceName,
  config as noProxyContractReferenceConfig,
} from './projects/NoProxyContractReference.config'
import {
  projectName as storageName,
  config as storageConfig,
} from './projects/Storage.config'
import {
  projectName as validationName,
  config as validationConfig,
} from './projects/Validation.config'

const config: UserChugSplashConfig = {
  projects: {
    [constructorArgName]: constructorArgConfig,
    [create3Name]: create3Config,
    // [metatxName]: metatxConfig, // TODO: uncomment after supporting new meta txns
    [noProxyContractReferenceName]: noProxyContractReferenceConfig,
    [storageName]: storageConfig,
    [validationName]: validationConfig,
  },
}

export default config
