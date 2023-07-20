export const sampleSphinxFileTypeScript = `import { UserConfig } from '@sphinx/core'

const config: UserConfig = {
  project: 'MyFirstProject',
  contracts: {
    MyContract: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _number: 1,
      },
    },
  },
}

export default config
`

export const sampleSphinxFileJavaScript = `
module.exports = {
  project: 'MyFirstProject',
  contracts: {
    MyContract: {
      contract: 'HelloSphinx',
      kind: 'immutable',
      constructorArgs: {
        _number: 1,
      },
    },
  },
}
`
