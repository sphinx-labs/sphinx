// We use hardhat for compiling Solidity contracts. We could use other tools for doing this
// compilation, but hardhat was a simple solution. We should probably replace this with a simpler
// solution later and put the compilation function in @chugsplash/core.

import { HardhatUserConfig } from 'hardhat/types'

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.15',
  },
}

export default config
