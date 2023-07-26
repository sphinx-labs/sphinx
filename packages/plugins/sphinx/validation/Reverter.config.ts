import { UserConfig } from '@sphinx/core'

const config: UserConfig = {
  projectName: 'Reverter',
  contracts: {
    Reverter1: {
      contract: 'Reverter',
      kind: 'immutable',
    },
    Reverter2: {
      contract: 'Reverter',
      kind: 'immutable',
    },
  },
}

export default config
