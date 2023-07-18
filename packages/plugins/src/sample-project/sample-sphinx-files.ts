export const sampleSphinxFileTypeScript = `import { UserSphinxConfig } from '@sphinx/core'

const config: UserSphinxConfig = {
  options: {
    owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloSphinx',
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

export const sampleSphinxFileJavaScript = `
module.exports = {
  options: {
    owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
  contracts: {
    MyFirstContract: {
      contract: 'HelloSphinx',
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
