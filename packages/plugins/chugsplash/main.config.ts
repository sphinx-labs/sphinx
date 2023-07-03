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
import {
  projectName as transparentName,
  config as transparentConfig,
} from './projects/proxies/TransparentUpgradableUpgrade.config'
import {
  projectName as uupsAccessControlName,
  config as uupsAccessControlConfig,
} from './projects/proxies/UUPSAccessControlUpgradableUpgrade.config'
import {
  projectName as uupsOwnableName,
  config as uupsOwnableConfig,
} from './projects/proxies/UUPSOwnableUpgradableUpgrade.config'

export const owner = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const config: UserChugSplashConfig = {
  options: {
    owner,
  },
  projects: {
    [constructorArgName]: constructorArgConfig,
    [create3Name]: create3Config,
    // [metatxName]: metatxConfig, // TODO: uncomment after supporting new meta txns
    [noProxyContractReferenceName]: noProxyContractReferenceConfig,
    [storageName]: storageConfig,
    [validationName]: validationConfig,
    [transparentName]: transparentConfig,
    [uupsAccessControlName]: uupsAccessControlConfig,
    [uupsOwnableName]: uupsOwnableConfig,
  },
}

export default config
