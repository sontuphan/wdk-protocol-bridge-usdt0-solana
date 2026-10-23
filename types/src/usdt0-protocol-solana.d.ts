export default class Usdt0ProtocolSolana extends BridgeProtocol {
    /**
     * Creates a new read-only interface to the usdt0 protocol for the solana blockchain.
     *
     * @overload
     * @param {IWalletAccountReadOnly} account - The wallet account to use to interact with the protocol.
     * @param {BridgeProtocolConfig} [config] - The bridge protocol configuration.
     */
    constructor(account: IWalletAccountReadOnly, config?: BridgeProtocolConfig);
    /**
     * Creates a new interface to the usdt0 protocol for the solana blockchain.
     *
     * @overload
     * @param {IWalletAccount} account - The wallet account to use to interact with the protocol.
     * @param {BridgeProtocolConfig} [config] - The bridge protocol configuration.
     */
    constructor(account: IWalletAccount, config?: BridgeProtocolConfig);
    /**
     * Bridges a token from solana to a different blockchain.
     *
     * Gasless accounts pay through their kora paymaster, which also fronts the layerzero fee and charges it back in the paymaster token.
     *
     * @param {BridgeOptions} options - The bridge's options. Optionally pass 'dstEid' to override the destination endpoint id.
     * @param {SolanaGaslessWalletPaymasterConfigOverrides & Pick<BridgeProtocolConfig, 'bridgeMaxFee'>} [config] - If the protocol has been
     *   initialized with a gasless wallet account, it can be used to override its paymaster options; 'bridgeMaxFee' overrides the protocol's.
     *   A gasless account ignores 'bridgeMaxFee': its 'transactionMaxFee' caps the paymaster fee, which includes the layerzero fee.
     * @returns {Promise<BridgeResult>} The bridge's result.
     */
    bridge(options: BridgeOptions, config?: SolanaGaslessWalletPaymasterConfigOverrides & Pick<BridgeProtocolConfig, "bridgeMaxFee">): Promise<BridgeResult>;
    /**
     * Quotes the costs of a bridge operation.
     *
     * @param {BridgeOptions} options - The bridge's options. Optionally pass 'dstEid' to override the destination endpoint id.
     * @param {SolanaGaslessWalletPaymasterConfigOverrides} [config] - If the protocol has been initialized with a gasless wallet account,
     *   it can be used to override its paymaster options.
     * @returns {Promise<Omit<BridgeResult, 'hash'>>} The bridge's quotes.
     */
    quoteBridge(options: BridgeOptions, config?: SolanaGaslessWalletPaymasterConfigOverrides): Promise<Omit<BridgeResult, "hash">>;
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
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
/**
 * The paymaster options a gasless wallet account accepts as overrides.
 *
 * Mirrors `SolanaGaslessWalletPaymasterConfigOverrides` from `@tetherto/wdk-wallet-solana-gasless`; declared locally so the
 * gasless wallet is not a runtime dependency.
 */
export type SolanaGaslessWalletPaymasterConfigOverrides = {
    /**
     * - The paymaster token configuration.
     */
    paymasterToken?: {
        address: string;
    };
    /**
     * - The maximum fee amount for transfer operations.
     */
    transferMaxFee?: number | bigint;
    /**
     * - The maximum fee amount for sendTransaction and signTransaction operations.
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
