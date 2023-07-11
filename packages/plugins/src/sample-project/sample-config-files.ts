export const sampleChugSplashFileTypeScript = `import { UserChugSplashConfig } from '@chugsplash/core'

const config: UserChugSplashConfig = {
  projects: {
    MyFirstProject: {
      contracts: {
        MyContract: {
          contract: 'HelloChugSplash',
          kind: 'immutable',
          constructorArgs: {
            _number: 1,
          },
        },
      },
    },
  },
}

export default config
`

export const sampleChugSplashFileJavaScript = `
module.exports = {
  projects: {
    MyFirstProject: {
      contracts: {
        MyContract: {
          contract: 'HelloChugSplash',
          kind: 'immutable',
          constructorArgs: {
            _number: 1,
          },
        },
      },
    },
  },
}
`
