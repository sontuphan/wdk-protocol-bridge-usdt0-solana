/**
 * Parses a Legacy Mesh oft store account.
 *
 * @param {MaybeEncodedAccount} account - The account.
 * @param {Address} programAddress - The oft program expected to own it.
 * @returns {OftStore | null} The oft store, or null if the account is missing, has another owner or discriminator, or is truncated.
 */
export function parseOftStore(account: MaybeEncodedAccount, programAddress: Address): OftStore | null;
/**
 * Parses a Legacy Mesh oft peer config account.
 *
 * @param {MaybeEncodedAccount} account - The account.
 * @param {Address} programAddress - The oft program expected to own it.
 * @returns {PeerConfig | null} The peer config, or null if the account is missing, has another owner or discriminator, or is truncated.
 */
export function parsePeerConfig(account: MaybeEncodedAccount, programAddress: Address): PeerConfig | null;
/**
 * Derives an oft program's peer config account for a destination.
 *
 * @param {Address} programAddress - The oft program.
 * @param {number} dstEid - The destination endpoint id.
 * @returns {Promise<Address>} The peer config address.
 */
export function getPeerAddress(programAddress: Address, dstEid: number): Promise<Address>;
/**
 * Derives a Legacy Mesh oft program's credits account.
 *
 * @param {Address} programAddress - The oft program.
 * @returns {Promise<Address>} The credits address.
 */
export function getCreditsAddress(programAddress: Address): Promise<Address>;
export const quoteSendEncoder: import("@solana/codecs").VariableSizeEncoder<{
    discriminator: void;
    dstEid: number | bigint;
    composeMsg: any;
    to: Uint8Array<ArrayBufferLike> | import("@solana/codecs").ReadonlyUint8Array;
    minAmountLD: number | bigint;
    amountLD: number | bigint;
    extraOptions: Uint8Array<ArrayBufferLike> | import("@solana/codecs").ReadonlyUint8Array;
    payInLzToken: boolean;
}>;
export const sendEncoder: import("@solana/codecs").VariableSizeEncoder<{
    discriminator: void;
    dstEid: number | bigint;
    composeMsg: any;
    to: Uint8Array<ArrayBufferLike> | import("@solana/codecs").ReadonlyUint8Array;
    minAmountLD: number | bigint;
    lzTokenFee: number | bigint;
    amountLD: number | bigint;
    extraOptions: Uint8Array<ArrayBufferLike> | import("@solana/codecs").ReadonlyUint8Array;
    nativeFee: number | bigint;
}>;
export const messagingFeeDecoder: import("@solana/codecs").FixedSizeDecoder<{
    nativeFee: bigint;
    lzTokenFee: bigint;
}>;
export const ulnSettingsDecoder: import("@solana/codecs").VariableSizeDecoder<{
    discriminator: void;
    eid: number;
    treasury: {
        admin: import("@solana/addresses").Address<string>;
        nativeReceiver: import("@solana/addresses").Address<string>;
        nativeFeeBps: bigint;
        lzToken: {
            receiver: import("@solana/addresses").Address<string>;
            fee: bigint;
        };
    };
    endpoint: import("@solana/addresses").Address<string>;
    bump: number;
    endpointProgram: import("@solana/addresses").Address<string>;
    admin: import("@solana/addresses").Address<string>;
}>;
export const sendLibraryConfigDecoder: import("@solana/codecs").FixedSizeDecoder<{
    discriminator: void;
    messageLib: import("@solana/addresses").Address<string>;
}>;
export const ulnSendConfigDecoder: import("@solana/codecs").VariableSizeDecoder<{
    discriminator: void;
    bump: number;
    requiredDvns: import("@solana/addresses").Address<string>[];
    confirmations: bigint;
    optionalDvnCount: number;
    maxMessageSize: number;
    requiredDvnCount: number;
    optionalDvnThreshold: number;
    optionalDvns: import("@solana/addresses").Address<string>[];
    executor: import("@solana/addresses").Address<string>;
}>;
export const executorConfigDecoder: import("@solana/codecs").VariableSizeDecoder<{
    discriminator: void;
    bump: number;
    priceFeed: import("@solana/addresses").Address<string>;
    executors: import("@solana/addresses").Address<string>[];
    owner: import("@solana/addresses").Address<string>;
    denyList: import("@solana/addresses").Address<string>[];
    paused: boolean;
    allowList: import("@solana/addresses").Address<string>[];
    admins: import("@solana/addresses").Address<string>[];
    msglibs: import("@solana/addresses").Address<string>[];
    defaultMultiplierBps: number;
}>;
export const dvnConfigDecoder: import("@solana/codecs").VariableSizeDecoder<{
    discriminator: void;
    vid: number;
    priceFeed: import("@solana/addresses").Address<string>;
    denyList: import("@solana/addresses").Address<string>[];
    bump: number;
    quorum: number;
    msglibs: import("@solana/addresses").Address<string>[];
    signers: import("@solana/codecs").ReadonlyUint8Array[];
    allowList: import("@solana/addresses").Address<string>[];
    paused: boolean;
    admins: import("@solana/addresses").Address<string>[];
}>;
export type Address = import("@solana/addresses").Address;
export type MaybeEncodedAccount = import("@solana/accounts").MaybeEncodedAccount;
/**
 * A Legacy Mesh oft store account.
 */
export type OftStore = {
    /**
     * - The token mint.
     */
    tokenMint: Address;
    /**
     * - The escrow holding the tvl and fees.
     */
    tokenEscrow: Address;
    /**
     * - The layerzero endpoint program.
     */
    endpointProgram: Address;
    /**
     * - The pda bump.
     */
    bump: number;
    /**
     * - The accrued fees.
     */
    feeBalance: bigint;
    /**
     * - The super admin.
     */
    superAdmin: Address;
    /**
     * - The planner.
     */
    planner: Address;
    /**
     * - The lp admin.
     */
    lpAdmin: Address;
    /**
     * - The burn and nilify admin.
     */
    burnAndNilifyAdmin: Address;
    /**
     * - The fee, in basis points.
     */
    feeBps: number;
    /**
     * - The address lookup table, if any.
     */
    alt: Address | null;
};
/**
 * A Legacy Mesh oft peer config account.
 */
export type PeerConfig = {
    /**
     * - The remote peer, encoded as 32 bytes.
     */
    peerAddress: Uint8Array;
    /**
     * - The enforced options per message type.
     */
    enforcedOptions: {
        withdrawRemote: Uint8Array;
        sendOft: Uint8Array;
        sendCredits: Uint8Array;
        sendOftAndCall: Uint8Array;
    };
    /**
     * - The pda bump.
     */
    bump: number;
};
