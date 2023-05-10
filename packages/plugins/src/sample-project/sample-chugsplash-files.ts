export const sampleChugSplashFileTypeScript = `import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  options: {
    organizationID: '0x0000000000000000000000000000000000000000000000000000000000000000',
    projectName: 'Hello ChugSplash',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloChugSplash',
      variables: {
        number: 1,
        stored: true,
        storageName: 'First',
        otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}

export default config
`

export const sampleChugSplashFileJavaScript = `require('@chugsplash/core')

module.exports = {
  options: {
    organizationID: '0x0000000000000000000000000000000000000000000000000000000000000000',
    projectName: 'Hello ChugSplash',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloChugSplash',
      variables: {
        number: 1,
        stored: true,
        storageName: 'First',
        otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}
`
