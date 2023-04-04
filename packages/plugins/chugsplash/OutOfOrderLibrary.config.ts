import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

const projectName = 'Out of order'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
  },
  contracts: {
    Stateless: {
      contract: 'Stateless',
      kind: 'no-proxy',
      constructorArgs: {
        _immutableUint: 1,
      },
      libraries: {
        ExternalLibrary: '{{ ExternalLibrary }}',
      },
    },
    ExternalLibrary: {
      contract: 'ExternalLibrary',
      kind: 'no-proxy',
    },
  },
}

export default config
