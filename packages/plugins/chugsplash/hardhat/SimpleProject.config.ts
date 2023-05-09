import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

const projectName = 'Simple Project'

const config: UserChugSplashConfig = {
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
  },
  contracts: {
    MyContract: {
      contract: 'SimpleStorage',
      variables: {
        myStorage: '0x' + '11'.repeat(20),
      },
    },
  },
}

export default config
