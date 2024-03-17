// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import { NetworkInfo, NetworkType } from "./SphinxPluginTypes.sol";

contract SphinxConstants {
  string public constant sphinxLibraryVersion = 'v0.20.4';
  address public constant compatibilityFallbackHandlerAddress = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;
  address public constant multiSendAddress = 0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761;
  address public constant createCallAddress = 0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4;
  address public constant sphinxModuleProxyFactoryAddress = 0x8f3301c9Eada5642B5bB12FD047D3EBb2932E619;
  address public constant managedServiceAddress = 0xB5E96127D417b1B3ef8438496a38A143167209c7;
  address public constant safeFactoryAddress = 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2;
  address public constant safeSingletonAddress = 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552;
  address public constant sphinxModuleImplAddress = 0x8f4E4d51B8050B0ff713eff1F88f3dD8b5e8a530;

  uint8 internal constant numSupportedNetworks = 44;

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
    all[23] = NetworkInfo({
      network: Network.celo,
      name: "celo",
      chainId: 42220,
      networkType: NetworkType.Mainnet
    });
    all[24] = NetworkInfo({
      network: Network.celo_alfajores,
      name: "celo_alfajores",
      chainId: 44787,
      networkType: NetworkType.Testnet
    });
    all[25] = NetworkInfo({
      network: Network.moonriver,
      name: "moonriver",
      chainId: 1285,
      networkType: NetworkType.Mainnet
    });
    all[26] = NetworkInfo({
      network: Network.moonbeam,
      name: "moonbeam",
      chainId: 1284,
      networkType: NetworkType.Mainnet
    });
    all[27] = NetworkInfo({
      network: Network.moonbase_alpha,
      name: "moonbase_alpha",
      chainId: 1287,
      networkType: NetworkType.Testnet
    });
    all[28] = NetworkInfo({
      network: Network.fuse,
      name: "fuse",
      chainId: 122,
      networkType: NetworkType.Mainnet
    });
    all[29] = NetworkInfo({
      network: Network.evmos,
      name: "evmos",
      chainId: 9001,
      networkType: NetworkType.Mainnet
    });
    all[30] = NetworkInfo({
      network: Network.evmos_testnet,
      name: "evmos_testnet",
      chainId: 9000,
      networkType: NetworkType.Testnet
    });
    all[31] = NetworkInfo({
      network: Network.kava,
      name: "kava",
      chainId: 2222,
      networkType: NetworkType.Mainnet
    });
    all[32] = NetworkInfo({
      network: Network.kava_testnet,
      name: "kava_testnet",
      chainId: 2221,
      networkType: NetworkType.Testnet
    });
    all[33] = NetworkInfo({
      network: Network.oktc,
      name: "oktc",
      chainId: 66,
      networkType: NetworkType.Mainnet
    });
    all[34] = NetworkInfo({
      network: Network.scroll,
      name: "scroll",
      chainId: 534352,
      networkType: NetworkType.Mainnet
    });
    all[35] = NetworkInfo({
      network: Network.scroll_sepolia,
      name: "scroll_sepolia",
      chainId: 534351,
      networkType: NetworkType.Testnet
    });
    all[36] = NetworkInfo({
      network: Network.rootstock,
      name: "rootstock",
      chainId: 30,
      networkType: NetworkType.Mainnet
    });
    all[37] = NetworkInfo({
      network: Network.rootstock_testnet,
      name: "rootstock_testnet",
      chainId: 31,
      networkType: NetworkType.Testnet
    });
    all[38] = NetworkInfo({
      network: Network.zora,
      name: "zora",
      chainId: 7777777,
      networkType: NetworkType.Mainnet
    });
    all[39] = NetworkInfo({
      network: Network.zora_sepolia,
      name: "zora_sepolia",
      chainId: 999999999,
      networkType: NetworkType.Testnet
    });
    all[40] = NetworkInfo({
      network: Network.rari,
      name: "rari",
      chainId: 1380012617,
      networkType: NetworkType.Mainnet
    });
    all[41] = NetworkInfo({
      network: Network.rari_sepolia,
      name: "rari_sepolia",
      chainId: 1918988905,
      networkType: NetworkType.Testnet
    });
    all[42] = NetworkInfo({
      network: Network.blast_sepolia,
      name: "blast_sepolia",
      chainId: 168587773,
      networkType: NetworkType.Testnet
    });
    all[43] = NetworkInfo({
      network: Network.blast,
      name: "blast",
      chainId: 81457,
      networkType: NetworkType.Mainnet
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
  base_sepolia,
  celo,
  celo_alfajores,
  moonriver,
  moonbeam,
  moonbase_alpha,
  fuse,
  evmos,
  evmos_testnet,
  kava,
  kava_testnet,
  oktc,
  scroll,
  scroll_sepolia,
  rootstock,
  rootstock_testnet,
  zora,
  zora_sepolia,
  rari,
  rari_sepolia,
  blast_sepolia,
  blast
}
