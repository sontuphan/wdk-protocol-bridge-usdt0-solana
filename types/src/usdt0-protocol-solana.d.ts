/**
 * A chain supported by the protocol, in the canonical WDK swidge shape.
 *
 * Mirrors `SwidgeSupportedChain` from `@tetherto/wdk-wallet/protocols`; declared locally until the swidge migration.
 *
 * @typedef {Object} SwidgeSupportedChain
 * @property {string | number} id - The provider-specific chain identifier.
 * @property {string} name - The human-readable chain name.
 * @property {string} type - The chain or virtual machine type (e.g., 'evm', 'svm', 'ton', 'tvm').
 * @property {string} nativeToken - The symbol of the chain's native token.
 */
/**
 * A token supported by the protocol, in the canonical WDK swidge shape.
 *
 * Mirrors `SwidgeSupportedToken` from `@tetherto/wdk-wallet/protocols`; declared locally until the swidge migration.
 *
 * @typedef {Object} SwidgeSupportedToken
 * @property {string} token - The provider-specific token identifier to use in operations.
 * @property {string | number} chain - The chain on which the token is available.
 * @property {string} symbol - The token symbol.
 * @property {number} decimals - The number of decimal places for the token's base unit.
 * @property {string} [address] - The token contract address, if applicable.
 * @property {string} [name] - The token's full name.
 */
/**
 * Optional filters for chain- or route-scoped token discovery.
 *
 * Mirrors `SwidgeSupportedTokensOptions` from `@tetherto/wdk-wallet/protocols`; declared locally until the swidge migration.
 *
 * @typedef {Object} SwidgeSupportedTokensOptions
 * @property {string | number} [fromChain] - The optional source chain for route-scoped discovery.
 * @property {string} [fromToken] - The optional source token for route-scoped discovery.
 * @property {string | number} [toChain] - The optional destination chain for route-scoped discovery.
 */
/**
 * @typedef {object} BridgeOptions
 * @property {string} targetChain - The identifier of the destination blockchain (e.g., "arbitrum").
 * @property {string} recipient - The address of the recipient.
 * @property {string} token - The spl mint address of the token to bridge.
 * @property {number | bigint} amount - The amount of tokens to bridge to the destination chain (in base unit).
 * @property {number} [dstEid] - Custom LayerZero destination endpoint ID to override the default for the target chain.
 */
/**
 * @typedef {object} OftSendParam
 * @property {number} dstEid - The LayerZero destination endpoint id.
 * @property {Uint8Array} to - The recipient address, encoded as 32 bytes.
 * @property {bigint} amountLD - The amount to send, in local decimals.
 * @property {bigint} minAmountLD - The minimum amount to receive, in local decimals.
 * @property {Uint8Array} extraOptions - The LayerZero executor options.
 * @property {Uint8Array} composeMsg - The compose message.
 * @property {Uint8Array} oftCmd - The oft command.
 */
/**
 * The oft accounts a quote or a send to a destination reads.
 *
 * @typedef {Object} OftRoute
 * @property {SolanaAddress} programAddress - The oft program.
 * @property {SolanaAddress} oftStore - The oft store.
 * @property {SolanaAddress} peer - The destination's peer config.
 * @property {SolanaAddress} credits - The credits account.
 * @property {import('./layerzero.js').OftStore} store - The parsed oft store.
 * @property {import('./layerzero.js').PeerConfig} peerConfig - The parsed peer config.
 * @property {Record<SolanaAddress, SolanaAddress[]>} lookupTables - The store's address lookup table, by address.
 */
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
     * @param {BridgeOptions} options - The bridge's options. Optionally pass 'dstEid' to override the destination endpoint id.
     * @returns {Promise<BridgeResult>} The bridge's result.
     */
    bridge(options: BridgeOptions): Promise<BridgeResult>;
    /**
     * Quotes the costs of a bridge operation.
     *
     * @param {BridgeOptions} options - The bridge's options. Optionally pass 'dstEid' to override the destination endpoint id.
     * @returns {Promise<Omit<BridgeResult, 'hash'>>} The bridge's quotes.
     */
    quoteBridge(options: BridgeOptions): Promise<Omit<BridgeResult, "hash">>;
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
    private _getOftDeployment;
    /**
     * Quotes the layerzero messaging fee of an oft send by simulating the oft program's 'quote_send' instruction.
     *
     * @private
     * @param {typeof SOLANA_OFT_DEPLOYMENTS[keyof typeof SOLANA_OFT_DEPLOYMENTS]} deployment - The oft deployment.
     * @param {OftSendParam} sendParam - The send parameters.
     * @returns {Promise<{ nativeFee: bigint, lzTokenFee: bigint }>} The messaging fee, in lamports.
     * @throws {Error} If the deployment, route, or simulation result is invalid.
     * @see https://github.com/LayerZero-Labs/usdt-native-mesh/blob/main/programs/oft/src/instructions/quote_send.rs
     */
    private _quoteOftSend;
    /**
     * Fetches and validates the oft accounts a quote or a send to a destination reads.
     *
     * @private
     * @param {typeof SOLANA_OFT_DEPLOYMENTS[keyof typeof SOLANA_OFT_DEPLOYMENTS]} deployment - The oft deployment.
     * @param {number} dstEid - The destination endpoint id.
     * @returns {Promise<OftRoute>} The oft accounts.
     * @throws {Error} If the store, the peer, or the lookup table is invalid.
     */
    private _getOftRoute;
    /**
     * Resolves the endpoint and message library accounts an oapp forwards to the layerzero endpoint's 'quote' instruction,
     * or to its 'send' instruction when a payer is given.
     *
     * Port of `SendHelper.getQuoteAccounts` and `SendHelper.getSendAccounts` from `@layerzerolabs/lz-solana-sdk-v2`,
     * restricted to the ULN message library.
     *
     * @private
     * @param {SolanaAddress} endpoint - The layerzero endpoint program.
     * @param {SolanaAddress} sender - The oapp sending the message (the oft store).
     * @param {number} dstEid - The destination endpoint id.
     * @param {Uint8Array} receiver - The remote peer, encoded as 32 bytes.
     * @param {SolanaAddress} [payer] - The account paying the messaging fee, for a send.
     * @returns {Promise<import('@solana/instructions').AccountMeta[]>} The accounts.
     * @throws {Error} If the route is not configured or uses a message library other than the ULN.
     */
    private _getEndpointAccounts;
    /**
     * Builds the oft program's 'send' instruction(s).
     *
     * @private
     * @param {typeof SOLANA_OFT_DEPLOYMENTS[keyof typeof SOLANA_OFT_DEPLOYMENTS]} deployment - The oft deployment.
     * @param {OftSendParam} sendParam - The send parameters.
     * @param {bigint} nativeFee - The layerzero native fee to pay, in lamports.
     * @param {string} sender - The sender's address.
     * @returns {Promise<import('@solana/instructions').Instruction[]>} The instructions.
     * @see https://github.com/LayerZero-Labs/usdt-native-mesh/blob/main/programs/oft/src/instructions/send.rs
     */
    private _buildOftSendInstructions;
    /**
     * Encodes a recipient address of the target chain as 32 bytes, left-padded with zeros.
     *
     * @private
     * @param {string} targetChain - The target chain.
     * @param {string} recipient - The recipient's address.
     * @returns {Uint8Array} The encoded address.
     */
    private _encodeRecipient;
    /** @private */
    private _assertValidRecipient;
}
export type BridgeProtocolConfig = import("@tetherto/wdk-wallet/protocols").BridgeProtocolConfig;
export type BridgeResult = import("@tetherto/wdk-wallet/protocols").BridgeResult;
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type SolanaAddress = import("@solana/addresses").Address;
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
export type OftSendParam = {
    /**
     * - The LayerZero destination endpoint id.
     */
    dstEid: number;
    /**
     * - The recipient address, encoded as 32 bytes.
     */
    to: Uint8Array;
    /**
     * - The amount to send, in local decimals.
     */
    amountLD: bigint;
    /**
     * - The minimum amount to receive, in local decimals.
     */
    minAmountLD: bigint;
    /**
     * - The LayerZero executor options.
     */
    extraOptions: Uint8Array;
    /**
     * - The compose message.
     */
    composeMsg: Uint8Array;
    /**
     * - The oft command.
     */
    oftCmd: Uint8Array;
};
/**
 * The oft accounts a quote or a send to a destination reads.
 */
export type OftRoute = {
    /**
     * - The oft program.
     */
    programAddress: SolanaAddress;
    /**
     * - The oft store.
     */
    oftStore: SolanaAddress;
    /**
     * - The destination's peer config.
     */
    peer: SolanaAddress;
    /**
     * - The credits account.
     */
    credits: SolanaAddress;
    /**
     * - The parsed oft store.
     */
    store: import("./layerzero.js").OftStore;
    /**
     * - The parsed peer config.
     */
    peerConfig: import("./layerzero.js").PeerConfig;
    /**
     * - The store's address lookup table, by address.
     */
    lookupTables: Record<SolanaAddress, SolanaAddress[]>;
};
import { BridgeProtocol } from '@tetherto/wdk-wallet/protocols';
