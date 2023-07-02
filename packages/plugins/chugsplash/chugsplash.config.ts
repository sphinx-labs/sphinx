import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

import {
  projectName as constructorArgName,
  config as constructorArgConfig,
} from './projects/ConstructorArgValidation.config'
import {
  projectName as create3Name,
  config as create3Config,
} from './projects/Create3.config'
import {
  projectName as metatxName,
  config as metatxConfig,
} from './projects/Metatx.config'
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
  options: {

  },
  projects: {
    [constructorArgName]: constructorArgConfig,
    [create3Name]: create3Config,
    [metatxName]: metatxConfig,
    [noProxyContractReferenceName]: noProxyContractReferenceConfig,
    [storageName]: storageConfig,
    [validationName]: validationConfig,
  },
}

export default config
