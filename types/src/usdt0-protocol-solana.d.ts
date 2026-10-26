export default class Usdt0ProtocolSolana extends BridgeProtocol {
    /**
     * Bridges a token from solana to a different blockchain.
     *
     * Gasless accounts pay through their paymaster, which also fronts the layerzero fee and charges it back in the
     * paymaster token.
     *
     * @param {BridgeOptions} options - The bridge's options. Optionally pass 'dstEid' to override the destination
     *   endpoint id.
     * @param {PaymasterConfigOverrides & Pick<BridgeProtocolConfig, 'bridgeMaxFee'>} [config] - If the protocol has
     *   been initialized with a gasless wallet account, it can be used to override its paymaster options;
     *   'bridgeMaxFee' overrides the protocol's. 'bridgeMaxFee' caps 'fee' plus 'bridgeFee', in lamports; for a
     *   gasless account it caps 'bridgeFee' alone, and 'transactionMaxFee' caps 'fee', the paymaster fee in the
     *   paymaster token, which includes the layerzero fee.
     * @returns {Promise<BridgeResult>} The bridge's result.
     */
    bridge(options: BridgeOptions, config?: PaymasterConfigOverrides & Pick<BridgeProtocolConfig, "bridgeMaxFee">): Promise<BridgeResult>;
    /**
     * Quotes the costs of a bridge operation.
     *
     * @param {BridgeOptions} options - The bridge's options. Optionally pass 'dstEid' to override the destination
     *   endpoint id.
     * @param {Pick<PaymasterConfigOverrides, 'paymasterToken'>} [config] - If the protocol has been
     *   initialized with a gasless wallet account, it can be used to override its paymaster token.
     * @returns {Promise<Omit<BridgeResult, 'hash'>>} The bridge's quotes.
     */
    quoteBridge(options: BridgeOptions, config?: Pick<PaymasterConfigOverrides, "paymasterToken">): Promise<Omit<BridgeResult, "hash">>;
    /**
     * Retrieves the chains supported by the protocol for bridge operations.
     *
     * Derived from the static config, in the canonical WDK swidge shape.
     *
     * @returns {Promise<SwidgeSupportedChain[]>} The supported chains.
     */
    getSupportedChains(): Promise<SwidgeSupportedChain[]>;
    /**
     * Retrieves the tokens supported by the protocol for bridge operations.
     *
     * Derived from the static config: the tokens with an oft deployment on solana.
     *
     * @param {SwidgeSupportedTokensOptions} [options] - Optional filters for chain- or token-scoped discovery.
     * @returns {Promise<SwidgeSupportedToken[]>} The supported tokens.
     */
    getSupportedTokens(options?: SwidgeSupportedTokensOptions): Promise<SwidgeSupportedToken[]>;
    /** @private */
    private _resolveChainKey;
    /** @private */
    private _getBridgeTransaction;
    /** @private */
    private _quoteOftSend;
    /** @private */
    private _getOftRoute;
    /** @private */
    private _getEndpointAccounts;
    /** @private */
    private _buildOftSendInstructions;
    /** @private */
    private _encodeRecipient;
    /** @private */
    private _assertValidRecipient;
}
export type BridgeProtocolConfig = import("@tetherto/wdk-wallet/protocols").BridgeProtocolConfig;
export type BridgeResult = import("@tetherto/wdk-wallet/protocols").BridgeResult;
export type SwidgeSupportedChain = import("@tetherto/wdk-wallet/protocols").SwidgeSupportedChain;
export type SwidgeSupportedToken = import("@tetherto/wdk-wallet/protocols").SwidgeSupportedToken;
export type SwidgeSupportedTokensOptions = import("@tetherto/wdk-wallet/protocols").SwidgeSupportedTokensOptions;
/**
 * The paymaster options a gasless wallet account accepts as overrides.
 */
export type PaymasterConfigOverrides = {
    /**
     * - The paymaster token configuration.
     */
    paymasterToken?: {
        address: string;
    };
    /**
     * - The maximum fee amount for sendTransaction and signTransaction
     * operations.
     */
    transactionMaxFee?: number | bigint;
};
export type BridgeOptions = {
    /**
     * - The identifier of the destination blockchain (e.g., "arbitrum").
     */
    targetChain: string;
    /**
     * - The address of the recipient.
     */
    recipient: string;
    /**
     * - The spl mint address of the token to bridge.
     */
    token: string;
    /**
     * - The amount of tokens to bridge to the destination chain (in base unit).
     */
    amount: number | bigint;
    /**
     * - Custom LayerZero destination endpoint ID to override the default for the target chain.
     */
    dstEid?: number;
};
import { BridgeProtocol } from '@tetherto/wdk-wallet/protocols';
