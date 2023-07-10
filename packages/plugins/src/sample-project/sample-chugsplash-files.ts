export const sampleChugSplashFileTypeScript = `import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  options: {
    owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
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
    owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
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
