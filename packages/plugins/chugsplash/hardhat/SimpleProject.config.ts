import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

const projectName = 'Simple Project'

const config: UserChugSplashConfig = {
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
    claimer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
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
