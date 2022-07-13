import { ChugSplashConfig } from '@chugsplash/core'

const config: ChugSplashConfig = {
  options: {
    name: 'My Demo Project',
    owner: '0x0000000000000000000000000000000000000000',
  },
  contracts: {
    MyToken: {
      source: 'MyToken',
      variables: {
        name: 'MyToken',
        symbol: 'MYT',
        //decimals: 18,
        totalSupply: 1000,
        // balanceOf: {
        //   '0x0000000000000000000000000000000000000000': 1000,
        // },
      },
    },
  },
}

export default config
