import { UserChugSplashConfig } from '@chugsplash/core'
import { ethers } from 'ethers'

import { variables, constructorArgs } from '../test/constants'

const projectName = 'My First Project'
export const orgId = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(projectName)
)

const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    organizationID: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(projectName)
    ),
    projectName,
    claimer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
  contracts: {
    MyStorage: {
      contract: 'Storage',
      constructorArgs,
      variables,
    },
    MySimpleStorage: {
      contract: 'SimpleStorage',
      variables: {
        myStorage: '{{ MyStorage }}',
        myStateless: '{{ Stateless }}',
      },
    },
    Stateless: {
      contract: 'Stateless',
      kind: 'no-proxy',
      constructorArgs: {
        _immutableUint: 1,
      },
    },
  },
}

export default config
