export const sampleChugSplashFileTypeScript = `import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  options: {
    organizationID: '0x0000000000000000000000000000000000000000000000000000000000000000',
    projectName: 'Hello ChugSplash',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloChugSplash',
      kind: 'immutable',
      constructorArgs: {
        _number: 1,
        _stored: true,
        _storageName: 'First',
        _otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}

export default config
`

export const sampleChugSplashFileJavaScript = `
module.exports = {
  options: {
    organizationID: '0x0000000000000000000000000000000000000000000000000000000000000000',
    projectName: 'Hello ChugSplash',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloChugSplash',
      kind: 'immutable',
      constructorArgs: {
        _number: 1,
        _stored: true,
        _storageName: 'First',
        _otherStorage: '0x1111111111111111111111111111111111111111',
      },
    },
  },
}
`
