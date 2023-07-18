import { UserSphinxConfig } from '@sphinx/core'

const config: UserSphinxConfig = {
  projects: {
    MyFirstProject: {
      contracts: {
        MyFirstContract: {
          contract: 'HelloSphinx',
          kind: 'proxy',
          variables: {
            number: 1,
            stored: true,
            storageName: 'First',
            otherStorage: '0x1111111111111111111111111111111111111111',
          },
        },
      },
    },
  },
}

export default config
