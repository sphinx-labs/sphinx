// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import { NetworkInfo, NetworkType } from "./SphinxPluginTypes.sol";

contract SphinxConstants {
  address public constant compatibilityFallbackHandlerAddress = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;
  address public constant multiSendAddress = 0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761;
  address public constant sphinxModuleProxyFactoryAddress = 0x8f3301c9Eada5642B5bB12FD047D3EBb2932E619;
  address public constant managedServiceAddress = 0xB5E96127D417b1B3ef8438496a38A143167209c7;
  address public constant safeFactoryAddress = 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2;
  address public constant safeSingletonAddress = 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552;
  address public constant sphinxModuleImplAddress = 0x8f4E4d51B8050B0ff713eff1F88f3dD8b5e8a530;

  uint8 internal constant numSupportedNetworks = 23;

  function getNetworkInfoArray() public pure returns (NetworkInfo[] memory) {
    NetworkInfo[] memory all = new NetworkInfo[](numSupportedNetworks);
    all[0] = NetworkInfo({
      network: Network.anvil,
      name: "anvil",
      chainId: 31337,
      networkType: NetworkType.Local
    });
    all[1] = NetworkInfo({
      network: Network.ethereum,
      name: "ethereum",
      chainId: 1,
      networkType: NetworkType.Mainnet
    });
    all[2] = NetworkInfo({
      network: Network.sepolia,
      name: "sepolia",
      chainId: 11155111,
      networkType: NetworkType.Testnet
    });
    all[3] = NetworkInfo({
      network: Network.optimism,
      name: "optimism",
      chainId: 10,
      networkType: NetworkType.Mainnet
    });
    all[4] = NetworkInfo({
      network: Network.optimism_sepolia,
      name: "optimism_sepolia",
      chainId: 11155420,
      networkType: NetworkType.Testnet
    });
    all[5] = NetworkInfo({
      network: Network.arbitrum,
      name: "arbitrum",
      chainId: 42161,
      networkType: NetworkType.Mainnet
    });
    all[6] = NetworkInfo({
      network: Network.arbitrum_sepolia,
      name: "arbitrum_sepolia",
      chainId: 421614,
      networkType: NetworkType.Testnet
    });
    all[7] = NetworkInfo({
      network: Network.polygon,
      name: "polygon",
      chainId: 137,
      networkType: NetworkType.Mainnet
    });
    all[8] = NetworkInfo({
      network: Network.polygon_mumbai,
      name: "polygon_mumbai",
      chainId: 80001,
      networkType: NetworkType.Testnet
    });
    all[9] = NetworkInfo({
      network: Network.bnb,
      name: "bnb",
      chainId: 56,
      networkType: NetworkType.Mainnet
    });
    all[10] = NetworkInfo({
      network: Network.bnb_testnet,
      name: "bnb_testnet",
      chainId: 97,
      networkType: NetworkType.Testnet
    });
    all[11] = NetworkInfo({
      network: Network.gnosis,
      name: "gnosis",
      chainId: 100,
      networkType: NetworkType.Mainnet
    });
    all[12] = NetworkInfo({
      network: Network.gnosis_chiado,
      name: "gnosis_chiado",
      chainId: 10200,
      networkType: NetworkType.Testnet
    });
    all[13] = NetworkInfo({
      network: Network.linea,
      name: "linea",
      chainId: 59144,
      networkType: NetworkType.Mainnet
    });
    all[14] = NetworkInfo({
      network: Network.linea_goerli,
      name: "linea_goerli",
      chainId: 59140,
      networkType: NetworkType.Testnet
    });
    all[15] = NetworkInfo({
      network: Network.polygon_zkevm,
      name: "polygon_zkevm",
      chainId: 1101,
      networkType: NetworkType.Mainnet
    });
    all[16] = NetworkInfo({
      network: Network.polygon_zkevm_goerli,
      name: "polygon_zkevm_goerli",
      chainId: 1442,
      networkType: NetworkType.Testnet
    });
    all[17] = NetworkInfo({
      network: Network.avalanche,
      name: "avalanche",
      chainId: 43114,
      networkType: NetworkType.Mainnet
    });
    all[18] = NetworkInfo({
      network: Network.avalanche_fuji,
      name: "avalanche_fuji",
      chainId: 43113,
      networkType: NetworkType.Testnet
    });
    all[19] = NetworkInfo({
      network: Network.fantom,
      name: "fantom",
      chainId: 250,
      networkType: NetworkType.Mainnet
    });
    all[20] = NetworkInfo({
      network: Network.fantom_testnet,
      name: "fantom_testnet",
      chainId: 4002,
      networkType: NetworkType.Testnet
    });
    all[21] = NetworkInfo({
      network: Network.base,
      name: "base",
      chainId: 8453,
      networkType: NetworkType.Mainnet
    });
    all[22] = NetworkInfo({
      network: Network.base_sepolia,
      name: "base_sepolia",
      chainId: 84532,
      networkType: NetworkType.Testnet
    });
    return all;
  }
}

enum Network {
  anvil,
  ethereum,
  sepolia,
  optimism,
  optimism_sepolia,
  arbitrum,
  arbitrum_sepolia,
  polygon,
  polygon_mumbai,
  bnb,
  bnb_testnet,
  gnosis,
  gnosis_chiado,
  linea,
  linea_goerli,
  polygon_zkevm,
  polygon_zkevm_goerli,
  avalanche,
  avalanche_fuji,
  fantom,
  fantom_testnet,
  base,
  base_sepolia
}
