import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

const projectName = 'Variable Validation'

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
  },
  contracts: {
    ExternalLibrary: {
      contract: 'ExternalLibrary',
      kind: 'no-proxy',
    },
    Stateless: {
      contract: 'Stateless',
      kind: 'no-proxy',
      constructorArgs: {
        _immutableUint: 1,
      },
      libraries: {
        UnnecessaryLibrary: '{{ UnnecessaryLibrary }}',
        ExternalLibrary: 'invalidAddress',
      },
    },
  },
}

export default config
