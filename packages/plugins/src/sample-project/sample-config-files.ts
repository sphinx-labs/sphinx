export const sampleSphinxFileTypeScript = `import { UserSphinxConfig } from '@sphinx/core'

const config: UserSphinxConfig = {
  projects: {
    MyFirstProject: {
      contracts: {
        MyContract: {
          contract: 'HelloSphinx',
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

export const sampleSphinxFileJavaScript = `
module.exports = {
  projects: {
    MyFirstProject: {
      contracts: {
        MyContract: {
          contract: 'HelloSphinx',
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
