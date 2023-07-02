import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

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

export const orgId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('proxies'))

const config: UserChugSplashConfig = {
  options: {
    organizationID: orgId,
  },
  projects: {
    [transparentName]: transparentConfig,
    [uupsAccessControlName]: uupsAccessControlConfig,
    [uupsOwnableName]: uupsOwnableConfig,
  },
}

export default config
