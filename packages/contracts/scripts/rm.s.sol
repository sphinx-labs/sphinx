// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.0;

// import { console } from "../contracts/forge-std/src/console.sol";
// import { Script } from "../contracts/forge-std/src/Script.sol";
// import { SphinxModuleProxyFactory } from "../contracts/core/SphinxModuleProxyFactory.sol";
// import { SphinxGnosisSafeProxyFactory } from "../contracts/core/SphinxGnosisSafeProxyFactory.sol";
// import "../test/TestUtils.t.sol";
// import { GnosisSafeProxy as GnosisSafeProxy_1_3_0 } from
//     "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxy.sol";

// contract Sample is TestUtils {

//     address moduleProxyFactory = 0x8f3301c9Eada5642B5bB12FD047D3EBb2932E619;
//     address[] owners = [0x4856e043a1F2CAA8aCEfd076328b4981Aca91000];
//     uint threshold = 1;

//     function run() public {
//         bytes memory safeProxyInitCode = hex"608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea2646970667358221220d1429297349653a4918076d650332de1a1068c5f3e07c5c82360c277770b955264736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";

//         vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

//         uint256 saltNonce = 0;

//         bytes memory safeInitCode = abi.encodePacked(
//             safeProxyInitCode,
//             abi.encode(0x3E5c63644E683549055b9Be8653de26E0B4CD36E)
//         );

//         bytes memory safeInitializerData = makeGnosisSafeInitializerData({
//             _moduleProxyFactory: SphinxModuleProxyFactory(moduleProxyFactory),
//             _saltNonce: saltNonce,
//             _owners: owners,
//             _threshold: threshold,
//             _multiSend: address(0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761),
//             _fallbackHandler: address(0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4)
//         });

//         SphinxGnosisSafeProxyFactory safeProxyFactory = new SphinxGnosisSafeProxyFactory(address(moduleProxyFactory));
//         address safeProxy = safeProxyFactory.deployGnosisSafeWithSphinxModule({
//             _safeInitCode: safeInitCode,
//             _safeInitializer: safeInitializerData,
//             _saltNonce: saltNonce
//         });
//         console.log(safeProxy);
//     }

// }
