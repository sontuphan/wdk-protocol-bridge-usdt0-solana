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
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type SolanaGaslessWalletPaymasterConfigOverrides = import("@tetherto/wdk-wallet-solana-gasless").SolanaGaslessWalletPaymasterConfigOverrides;
/**
 * A chain supported by the protocol, in the canonical WDK swidge shape.
 *
 * Mirrors `SwidgeSupportedChain` from `@tetherto/wdk-wallet/protocols`; declared locally until the swidge migration.
 */
export type SwidgeSupportedChain = {
    /**
     * - The provider-specific chain identifier.
     */
    id: string | number;
    /**
     * - The human-readable chain name.
     */
    name: string;
    /**
     * - The chain or virtual machine type (e.g., 'evm', 'svm', 'ton', 'tvm').
     */
    type: string;
    /**
     * - The symbol of the chain's native token.
     */
    nativeToken: string;
};
/**
 * A token supported by the protocol, in the canonical WDK swidge shape.
 *
 * Mirrors `SwidgeSupportedToken` from `@tetherto/wdk-wallet/protocols`; declared locally until the swidge migration.
 */
export type SwidgeSupportedToken = {
    /**
     * - The provider-specific token identifier to use in operations.
     */
    token: string;
    /**
     * - The chain on which the token is available.
     */
    chain: string | number;
    /**
     * - The token symbol.
     */
    symbol: string;
    /**
     * - The number of decimal places for the token's base unit.
     */
    decimals: number;
    /**
     * - The token contract address, if applicable.
     */
    address?: string;
    /**
     * - The token's full name.
     */
    name?: string;
};
/**
 * Optional filters for chain- or route-scoped token discovery.
 *
 * Mirrors `SwidgeSupportedTokensOptions` from `@tetherto/wdk-wallet/protocols`; declared locally until the swidge migration.
 */
export type SwidgeSupportedTokensOptions = {
    /**
     * - The optional source chain for route-scoped discovery.
     */
    fromChain?: string | number;
    /**
     * - The optional source token for route-scoped discovery.
     */
    fromToken?: string;
    /**
     * - The optional destination chain for route-scoped discovery.
     */
    toChain?: string | number;
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
