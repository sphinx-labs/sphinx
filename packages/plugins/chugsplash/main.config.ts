import { UserChugSplashConfig } from '@chugsplash/core'

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
  projectName as storageName,
  config as storageConfig,
} from './projects/Storage.config'

const config: UserChugSplashConfig = {
  projects: {
    [create3Name]: create3Config,
    // [metatxName]: metatxConfig, // TODO: uncomment after supporting new meta txns
    [storageName]: storageConfig,
  },
}

export default config
