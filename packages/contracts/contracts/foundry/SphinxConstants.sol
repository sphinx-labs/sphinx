// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import { NetworkInfo, NetworkType } from "./SphinxPluginTypes.sol";

contract SphinxConstants {
  string public constant sphinxLibraryVersion = 'v0.23.0';
  address public constant compatibilityFallbackHandlerAddress = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;
  address public constant multiSendAddress = 0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761;
  address public constant createCallAddress = 0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4;
  address public constant sphinxModuleProxyFactoryAddress = 0x8f3301c9Eada5642B5bB12FD047D3EBb2932E619;
  address public constant permissionlessRelayAddress = 0xA2eA7657440875bF916CBFC0cfA88F13e38aD463;
  address public constant safeFactoryAddress = 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2;
  address public constant safeSingletonAddress = 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552;
  address public constant sphinxModuleImplAddress = 0x8f4E4d51B8050B0ff713eff1F88f3dD8b5e8a530;

  uint8 internal constant numSupportedNetworks = 53;

  function getNetworkInfoArray() public pure returns (NetworkInfo[] memory) {
    NetworkInfo[] memory all = new NetworkInfo[](numSupportedNetworks);
    all[0] = NetworkInfo({
      network: Network.anvil,
      name: "anvil",
      chainId: 31337,
      networkType: NetworkType.Local,
      dripSize: 1000000000000000000,
      dripSizeString: '1 ETH'
    });
    all[1] = NetworkInfo({
      network: Network.ethereum,
      name: "ethereum",
      chainId: 1,
      networkType: NetworkType.Mainnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[2] = NetworkInfo({
      network: Network.sepolia,
      name: "sepolia",
      chainId: 11155111,
      networkType: NetworkType.Testnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 ETH'
    });
    all[3] = NetworkInfo({
      network: Network.optimism,
      name: "optimism",
      chainId: 10,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[4] = NetworkInfo({
      network: Network.optimism_sepolia,
      name: "optimism_sepolia",
      chainId: 11155420,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[5] = NetworkInfo({
      network: Network.arbitrum,
      name: "arbitrum",
      chainId: 42161,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[6] = NetworkInfo({
      network: Network.arbitrum_sepolia,
      name: "arbitrum_sepolia",
      chainId: 421614,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[7] = NetworkInfo({
      network: Network.polygon,
      name: "polygon",
      chainId: 137,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 MATIC'
    });
    all[8] = NetworkInfo({
      network: Network.polygon_amoy,
      name: "polygon_amoy",
      chainId: 80002,
      networkType: NetworkType.Testnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 MATIC'
    });
    all[9] = NetworkInfo({
      network: Network.bnb,
      name: "bnb",
      chainId: 56,
      networkType: NetworkType.Mainnet,
      dripSize: 50000000000000000,
      dripSizeString: '0.05 BNB'
    });
    all[10] = NetworkInfo({
      network: Network.bnb_testnet,
      name: "bnb_testnet",
      chainId: 97,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 BNB'
    });
    all[11] = NetworkInfo({
      network: Network.gnosis,
      name: "gnosis",
      chainId: 100,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 xDAI'
    });
    all[12] = NetworkInfo({
      network: Network.gnosis_chiado,
      name: "gnosis_chiado",
      chainId: 10200,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 xDAI'
    });
    all[13] = NetworkInfo({
      network: Network.linea,
      name: "linea",
      chainId: 59144,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[14] = NetworkInfo({
      network: Network.linea_sepolia,
      name: "linea_sepolia",
      chainId: 59141,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[15] = NetworkInfo({
      network: Network.polygon_zkevm,
      name: "polygon_zkevm",
      chainId: 1101,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[16] = NetworkInfo({
      network: Network.polygon_zkevm_cardona,
      name: "polygon_zkevm_cardona",
      chainId: 2442,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[17] = NetworkInfo({
      network: Network.avalanche,
      name: "avalanche",
      chainId: 43114,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 AVAX'
    });
    all[18] = NetworkInfo({
      network: Network.avalanche_fuji,
      name: "avalanche_fuji",
      chainId: 43113,
      networkType: NetworkType.Testnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 AVAX'
    });
    all[19] = NetworkInfo({
      network: Network.fantom,
      name: "fantom",
      chainId: 250,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 FTM'
    });
    all[20] = NetworkInfo({
      network: Network.fantom_testnet,
      name: "fantom_testnet",
      chainId: 4002,
      networkType: NetworkType.Testnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 FTM'
    });
    all[21] = NetworkInfo({
      network: Network.base,
      name: "base",
      chainId: 8453,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[22] = NetworkInfo({
      network: Network.base_sepolia,
      name: "base_sepolia",
      chainId: 84532,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[23] = NetworkInfo({
      network: Network.celo,
      name: "celo",
      chainId: 42220,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 CELO'
    });
    all[24] = NetworkInfo({
      network: Network.celo_alfajores,
      name: "celo_alfajores",
      chainId: 44787,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 CELO'
    });
    all[25] = NetworkInfo({
      network: Network.moonriver,
      name: "moonriver",
      chainId: 1285,
      networkType: NetworkType.Mainnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 MOVR'
    });
    all[26] = NetworkInfo({
      network: Network.moonbeam,
      name: "moonbeam",
      chainId: 1284,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 GLMR'
    });
    all[27] = NetworkInfo({
      network: Network.moonbase_alpha,
      name: "moonbase_alpha",
      chainId: 1287,
      networkType: NetworkType.Testnet,
      dripSize: 50000000000000000,
      dripSizeString: '0.05 GLMR'
    });
    all[28] = NetworkInfo({
      network: Network.fuse,
      name: "fuse",
      chainId: 122,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 FUSE'
    });
    all[29] = NetworkInfo({
      network: Network.evmos,
      name: "evmos",
      chainId: 9001,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 EVMOS'
    });
    all[30] = NetworkInfo({
      network: Network.evmos_testnet,
      name: "evmos_testnet",
      chainId: 9000,
      networkType: NetworkType.Testnet,
      dripSize: 15000000000000000,
      dripSizeString: '0.015 EVMOS'
    });
    all[31] = NetworkInfo({
      network: Network.kava,
      name: "kava",
      chainId: 2222,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 KAVA'
    });
    all[32] = NetworkInfo({
      network: Network.kava_testnet,
      name: "kava_testnet",
      chainId: 2221,
      networkType: NetworkType.Testnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 KAVA'
    });
    all[33] = NetworkInfo({
      network: Network.scroll,
      name: "scroll",
      chainId: 534352,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[34] = NetworkInfo({
      network: Network.scroll_sepolia,
      name: "scroll_sepolia",
      chainId: 534351,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[35] = NetworkInfo({
      network: Network.rootstock,
      name: "rootstock",
      chainId: 30,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000,
      dripSizeString: '0.001 RBTC'
    });
    all[36] = NetworkInfo({
      network: Network.rootstock_testnet,
      name: "rootstock_testnet",
      chainId: 31,
      networkType: NetworkType.Testnet,
      dripSize: 1000000000000000,
      dripSizeString: '0.001 RBTC'
    });
    all[37] = NetworkInfo({
      network: Network.zora,
      name: "zora",
      chainId: 7777777,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[38] = NetworkInfo({
      network: Network.zora_sepolia,
      name: "zora_sepolia",
      chainId: 999999999,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[39] = NetworkInfo({
      network: Network.rari,
      name: "rari",
      chainId: 1380012617,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[40] = NetworkInfo({
      network: Network.rari_sepolia,
      name: "rari_sepolia",
      chainId: 1918988905,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[41] = NetworkInfo({
      network: Network.blast_sepolia,
      name: "blast_sepolia",
      chainId: 168587773,
      networkType: NetworkType.Testnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[42] = NetworkInfo({
      network: Network.blast,
      name: "blast",
      chainId: 81457,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[43] = NetworkInfo({
      network: Network.taiko_katla,
      name: "taiko_katla",
      chainId: 167008,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[44] = NetworkInfo({
      network: Network.mode_sepolia,
      name: "mode_sepolia",
      chainId: 919,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[45] = NetworkInfo({
      network: Network.mode,
      name: "mode",
      chainId: 34443,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[46] = NetworkInfo({
      network: Network.darwinia_pangolin,
      name: "darwinia_pangolin",
      chainId: 43,
      networkType: NetworkType.Testnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 RING'
    });
    all[47] = NetworkInfo({
      network: Network.mantle_sepolia,
      name: "mantle_sepolia",
      chainId: 5003,
      networkType: NetworkType.Testnet,
      dripSize: 5000000000000000000,
      dripSizeString: '5 MNT'
    });
    all[48] = NetworkInfo({
      network: Network.mantle,
      name: "mantle",
      chainId: 5000,
      networkType: NetworkType.Mainnet,
      dripSize: 5000000000000000000,
      dripSizeString: '5 MNT'
    });
    all[49] = NetworkInfo({
      network: Network.astar_zkyoto,
      name: "astar_zkyoto",
      chainId: 6038361,
      networkType: NetworkType.Testnet,
      dripSize: 150000000000000000,
      dripSizeString: '0.15 ETH'
    });
    all[50] = NetworkInfo({
      network: Network.astar,
      name: "astar",
      chainId: 3776,
      networkType: NetworkType.Mainnet,
      dripSize: 25000000000000000,
      dripSizeString: '0.025 ETH'
    });
    all[51] = NetworkInfo({
      network: Network.crab,
      name: "crab",
      chainId: 44,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 CRAB'
    });
    all[52] = NetworkInfo({
      network: Network.darwinia,
      name: "darwinia",
      chainId: 46,
      networkType: NetworkType.Mainnet,
      dripSize: 1000000000000000000,
      dripSizeString: '1 RING'
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
  polygon_amoy,
  bnb,
  bnb_testnet,
  gnosis,
  gnosis_chiado,
  linea,
  linea_sepolia,
  polygon_zkevm,
  polygon_zkevm_cardona,
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
  scroll,
  scroll_sepolia,
  rootstock,
  rootstock_testnet,
  zora,
  zora_sepolia,
  rari,
  rari_sepolia,
  blast_sepolia,
  blast,
  taiko_katla,
  mode_sepolia,
  mode,
  darwinia_pangolin,
  mantle_sepolia,
  mantle,
  astar_zkyoto,
  astar,
  crab,
  darwinia
}
