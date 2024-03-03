import { expect } from 'chai'

import {
  fetchEtherscanConfigForNetwork,
  isBlockscoutSupportedForNetwork,
  isEtherscanSupportedForNetwork,
  isVerificationSupportedForNetwork,
} from '../src/networks'

const mockSphinxNetworks: Array<any> = [
  {
    name: 'NetworkWithEtherscan',
    displayName: 'Network With Etherscan',
    chainId: BigInt(1),
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.etherscan.io',
        browserURL: 'https://etherscan.io',
        envKey: 'ETHERSCAN_API_KEY',
      },
    },
  },
  {
    name: 'NetworkWithBlockscout',
    displayName: 'Network With Blockscout',
    chainId: BigInt(2),
    blockexplorers: {
      blockscout: {
        apiURL: 'https://api.blockscout.com',
        browserURL: 'https://blockscout.com',
        envKey: 'BLOCKSCOUT_API_KEY',
      },
    },
  },
  {
    name: 'NetworkWithBoth',
    displayName: 'Network With Both Explorers',
    chainId: BigInt(3),
    blockexplorers: {
      etherscan: {
        apiURL: 'https://api.etherscan.io',
        browserURL: 'https://etherscan.io',
        envKey: 'ETHERSCAN_API_KEY',
      },
      blockscout: {
        apiURL: 'https://api.blockscout.com',
        browserURL: 'https://blockscout.com',
        envKey: 'BLOCKSCOUT_API_KEY',
      },
    },
  },
  {
    name: 'NetworkWithNeither',
    displayName: 'Network With Neither Explorer',
    chainId: BigInt(4),
    blockexplorers: {},
  },
]

describe('Block Explorer Config Fetch', () => {
  describe('isEtherscanSupportedForNetwork', () => {
    it('should return true for a network with Etherscan support', () => {
      const result = isEtherscanSupportedForNetwork(
        BigInt(1),
        mockSphinxNetworks
      )
      expect(result).to.be.true
    })

    it('should return false for a network without Etherscan support', () => {
      const result = isEtherscanSupportedForNetwork(
        BigInt(2),
        mockSphinxNetworks
      )
      expect(result).to.be.false
    })

    it('should throw an error for an unsupported network', () => {
      expect(() =>
        isEtherscanSupportedForNetwork(BigInt(6), mockSphinxNetworks)
      ).to.throw()
    })
  })

  describe('isBlockscoutSupportedForNetwork', () => {
    it('should return true for a network with Blockscout support', () => {
      const result = isBlockscoutSupportedForNetwork(
        BigInt(2),
        mockSphinxNetworks
      )
      expect(result).to.be.true
    })

    it('should return false for a network without Blockscout support', () => {
      const result = isBlockscoutSupportedForNetwork(
        BigInt(1),
        mockSphinxNetworks
      )
      expect(result).to.be.false
    })

    it('should throw an error for an unsupported network', () => {
      expect(() =>
        isBlockscoutSupportedForNetwork(BigInt(6), mockSphinxNetworks)
      ).to.throw()
    })
  })

  describe('isVerificationSupportedForNetwork', () => {
    it('should return true for a network supported by either Etherscan or Blockscout', () => {
      expect(isVerificationSupportedForNetwork(BigInt(1), mockSphinxNetworks))
        .to.be.true
      expect(isVerificationSupportedForNetwork(BigInt(2), mockSphinxNetworks))
        .to.be.true
    })

    it('should return true for a network supported by both', () => {
      expect(isVerificationSupportedForNetwork(BigInt(3), mockSphinxNetworks))
        .to.be.true
    })

    it('should return false for a network not supported by either Etherscan or Blockscout', () => {
      expect(isVerificationSupportedForNetwork(BigInt(4), mockSphinxNetworks))
        .to.be.false
    })

    it('should throw an error for an unsupported network', () => {
      expect(() =>
        isVerificationSupportedForNetwork(BigInt(6), mockSphinxNetworks)
      ).to.throw()
    })
  })

  describe('fetchEtherscanConfigForNetwork', () => {
    it('should return Etherscan config for a network with Etherscan and explorerName Etherscan', () => {
      const config = fetchEtherscanConfigForNetwork(
        BigInt(1),
        'Etherscan',
        mockSphinxNetworks
      )
      expect(config).to.have.property('apiURL', 'https://api.etherscan.io')
    })

    it('should return Blockscout config for a network with Blockscout and explorerName Blockscout', () => {
      const config = fetchEtherscanConfigForNetwork(
        BigInt(2),
        'Blockscout',
        mockSphinxNetworks
      )
      expect(config).to.have.property('apiURL', 'https://api.blockscout.com')
    })

    it('should return Etherscan config for a network with Etherscan when no explorerName is provided', () => {
      const config = fetchEtherscanConfigForNetwork(
        BigInt(1),
        undefined,
        mockSphinxNetworks
      )
      expect(config).to.have.property('apiURL', 'https://api.etherscan.io')
    })

    it('should return Blockscout config for a network with only Blockscout when no explorerName is provided', () => {
      const config = fetchEtherscanConfigForNetwork(
        BigInt(2),
        undefined,
        mockSphinxNetworks
      )
      expect(config).to.have.property('apiURL', 'https://api.blockscout.com')
    })

    it('should throw an error for a network where neither explorer is available when no explorerName is provided', () => {
      expect(() =>
        fetchEtherscanConfigForNetwork(BigInt(4), undefined, mockSphinxNetworks)
      ).to.throw()
    })

    it('should throw an error for an unsupported network', () => {
      expect(() =>
        fetchEtherscanConfigForNetwork(BigInt(6), undefined, mockSphinxNetworks)
      ).to.throw()
    })

    it('should throw an error for a supported network but unsupported explorerName', () => {
      expect(() =>
        fetchEtherscanConfigForNetwork(
          BigInt(1),
          'Unknown' as any,
          mockSphinxNetworks
        )
      ).to.throw()
    })
  })
})
