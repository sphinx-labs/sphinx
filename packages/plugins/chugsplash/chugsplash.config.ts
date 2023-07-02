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

export const orgId = ethers.constants.HashZero

const config: UserChugSplashConfig = {
  options: {
    organizationID: orgId,
  },
  projects: {
    [constructorArgName]: constructorArgConfig,
    [create3Name]: create3Config,
    [metatxName]: metatxConfig,
    [noProxyContractReferenceName]: noProxyContractReferenceConfig,
    [storageName]: storageConfig,
    [validationName]: validationConfig,
    [transparentName]: transparentConfig,
    [uupsAccessControlName]: uupsAccessControlConfig,
    [uupsOwnableName]: uupsOwnableConfig,
  },
}

export default config
