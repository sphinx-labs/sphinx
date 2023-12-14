// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {LzApp} from "@layerzerolabs/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";
import {Script} from "sphinx-forge-std/Script.sol";
import {ILayerZeroEndpoint} from "@layerzerolabs/solidity-examples/contracts/interfaces/ILayerZeroEndpoint.sol";
import {NonblockingLzApp} from "@layerzerolabs/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";

/**
 * @notice This script sends funds from Goerli to any destination testnet supported by LayerZero.
 *         Instructions:
 *         a. Make sure that you have an `ALCHEMY_API_KEY` and `PRIVATE_KEY` in your `.env` file.
 *            The `PRIVATE_KEY` must store the funds that you're transferring from Goerli.
 *         b. Update the sections of this contract marked by (1) and (2).
 *         c. To run this script:
 *            `forge script script/BridgeFunds.s.sol --broadcast --tc SphinxScript`
 */
contract SphinxScript is LzApp, Script {
    // (1) Update all of the variables in this section.
    // Amount to receive on each destination chain. If you'd like to skip sending funds to a
    // particular chain, set the amount to 0 here.
    uint256 bnbTestnetAmount = 0; // 1 BNBT
    uint256 gnosisChiadoAmount = 0; // 2 XDAI
    uint256 avaxAmount = 150 * (10 ** 18);
    uint256 ftmAmount = 1000 * (10 ** 18);
    // Address that will receive the funds on the destination chain:
    address tokenReceiver = 0x4856e043a1F2CAA8aCEfd076328b4981Aca91000;
    // Address of the SphinxLZReceiver contract on the destination chain. This is *not* the address
    // that receives funds. This contract is necessary because the cross-chain message must be sent
    // to a contract that can receive the LayerZero message, or else the funds won't be transferred
    // to the receiver EOA. To deploy it to a new destination chain, write a script that deploys the
    // `SphinxLZReceiver` at the bottom of this file to the destination chain. Then, add the address
    // of the deployed contract here.
    address bnbTestnetLzReceiver = 0x4a3844F8B63ffb024aE7b5d3BD613f8AD7bcB43b;
    address gnosisChiadoLzReceiver = 0x4a3844F8B63ffb024aE7b5d3BD613f8AD7bcB43b;
    address fantomLzReceiver = 0x4a3844F8B63ffb024aE7b5d3BD613f8AD7bcB43b;
    address avaxLzReceiver = 0x4a3844F8B63ffb024aE7b5d3BD613f8AD7bcB43b;
    // LayerZero chain IDs. Add new chains here.
    uint16 goerliLzChainId = 10121;
    uint16 bnbTestnetLzChainId = 10102;
    uint16 gnosisChiadoLzChainId = 10145;
    uint16 phantomLzChainId = 10112;
    uint16 avaxLzChainId = 10106;
    // If you're adding a new chain, go to (2) below.

    /**
     * @custom:field dstChainId LayerZero Chain ID of the destination chain. Note that this is not
     *               the same as the EVM chain ID.
     * @custom:field dstNativeTokenAmount Amount of native tokens to send to the destination chain.
     *               For example, if the destination chain is the BSC testnet, whose native token is
     *               BNB, then specifying 2*(10^18) here will send 2 BNB.
     * @custom:field dstLzReceiver Address of the contract that receives an empty LayerZero message
     *               on the destination chain. This is *not* the address that receives funds.
     */
    struct FundingInfo {
        uint16 dstChainId;
        uint256 dstTotalNativeTokenAmount;
        address dstLzReceiver;
    }

    string alchemyApiKey = vm.envString("ALCHEMY_API_KEY");
    string sepoliaRpcUrl = string(abi.encodePacked("https://eth-sepolia.g.alchemy.com/v2/", alchemyApiKey));
    uint256 funderPrivateKey = vm.envUint("PRIVATE_KEY");
    address funder = vm.addr(funderPrivateKey);

    address localEndpoint = 0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23;
    ILayerZeroRelayerV2 relayer = ILayerZeroRelayerV2(0xC9b7EDc65488bDBb428526B03935090aef40Ff03);
    uint16 adapterParamVersion = 2;
    uint16 outboundProofType = 1;
    // Default amount of gas to provide for the destination chain call. 200k is recommended by
    // LayerZero.
    uint256 dstGasAmount = 200_000;

    FundingInfo[] fundingInfo;

    constructor() LzApp(localEndpoint) {
        // (2) If you're adding a new chain, add a new FundingInfo struct here.
        fundingInfo.push(FundingInfo(bnbTestnetLzChainId, bnbTestnetAmount, bnbTestnetLzReceiver));
        fundingInfo.push(FundingInfo(gnosisChiadoLzChainId, gnosisChiadoAmount, gnosisChiadoLzReceiver));
        fundingInfo.push(FundingInfo(phantomLzChainId, ftmAmount, fantomLzReceiver));
        fundingInfo.push(FundingInfo(avaxLzChainId, avaxAmount, avaxLzReceiver));

        _transferOwnership(funder);
    }

    function run() public {
        vm.createSelectFork(sepoliaRpcUrl);
        vm.startBroadcast(funderPrivateKey);
        for (uint256 i = 0; i < fundingInfo.length; i++) {
            uint16 dstChainId = fundingInfo[i].dstChainId;
            uint256 dstTotalNativeTokenAmount = fundingInfo[i].dstTotalNativeTokenAmount;
            address dstLzReceiver = fundingInfo[i].dstLzReceiver;

            bytes memory addressPair = abi.encodePacked(dstLzReceiver, funder);
            // Set the trusted remote address for the destination chain
            trustedRemoteLookup[dstChainId] = addressPair;

            uint256 amountSent = 0;
            while (amountSent < dstTotalNativeTokenAmount) {
                uint256 amountToSend = relayer.dstConfigLookup(dstChainId, outboundProofType).dstNativeAmtCap;
                require(amountToSend > 0, "BridgeFunds: amountToSend must be greater than 0");

                if (amountToSend + amountSent > dstTotalNativeTokenAmount) {
                    amountToSend = dstTotalNativeTokenAmount - amountSent;
                }

                bytes memory adapterParam = abi.encodePacked(
                    adapterParamVersion, // Adapter params version
                    dstGasAmount, // Default amount of gas recommended by LayerZero
                    amountToSend, // Amount of native tokens to send to the receiver
                    tokenReceiver // Address that will receive the funds on the destination chain
                );

                (uint256 fee,) = lzEndpoint.estimateFees(
                    dstChainId,
                    address(this), // The "user application" on the source chain
                    "", // We don't send a message payload when sending funds
                    false, // Do not pay with LayerZero's ZRO token
                    adapterParam
                );

                _lzSend(
                    dstChainId,
                    "", // We don't send a message payload when sending funds
                    payable(funder), // Address on the source chain to send leftover funds to
                    address(0x0), // ZRO token payment address (not applicable)
                    adapterParam,
                    fee // Native fee for the message
                );

                amountSent += amountToSend;
            }
        }
        vm.stopBroadcast();
    }

    /**
     * @notice Overrides the _blockingLzReceive function from LzApp. It's necessary for us to
     *            override this function so that this contract isn't marked abstract by the Solidity
     *            compiler.
     */
    function _blockingLzReceive(uint16 _srcChainId, bytes memory _srcAddress, uint64 _nonce, bytes memory _payload)
        internal
        override
    {}
}

interface ILayerZeroRelayerV2 {
    struct DstConfig {
        uint128 dstNativeAmtCap;
        uint64 baseGas;
        uint64 gasPerByte;
    }

    function dstConfigLookup(uint16 dstChainId, uint16 outboundProofType) external view returns (DstConfig memory);
}

/**
 * @title SphinxLZReceiver
 * @notice This contract receives LayerZero cross chain messages. It is meant to exist on a
 *            destination chain. We use the non-blocking version of LayerZero so that we can continue
 *            to receive messages if a transaction fails on this chain.
 */
contract SphinxLZReceiver is NonblockingLzApp {
    /**
     * @param _endpoint Address of the LayerZero endpoint on the destination chain. See:
     *    https://layerzero.gitbook.io/docs/technical-reference/testnet/testnet-addresses
     */
    constructor(address _endpoint) NonblockingLzApp(_endpoint) {}

    bool public received;

    /**
     * @notice Receives crosschain funding messages and emits a confirmation event. LayerZero
     *           recommends overriding `_nonblockingLzReceive`, but it's necessary for us to override
     *           this function instead because the inherited version of this function requires a
     *           trusted remote address pair, which we don't use.
     */
    function lzReceive(uint16, bytes calldata, uint64, bytes calldata) public override {
        received = true;
    }

    /**
     * @notice Overrides the inherited function from LayerZero. It's necessary for us to override
     *    this function so that this contract isn't marked abstract by the Solidity compiler. We
     *    override the message receiving functionality of `lzReceive` instead of this function. See the
     *    docs for `lzReceive` for more details.
     */
    function _nonblockingLzReceive(uint16, bytes memory, uint64, bytes memory) internal virtual override {}
}
