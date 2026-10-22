/**
 * Parses a Legacy Mesh oft store account.
 *
 * @param {AccountInfo | null} account - The account.
 * @param {Address} programAddress - The oft program expected to own it.
 * @returns {OftStore | null} The oft store, or null if the account is missing, has another owner or discriminator, or is truncated.
 */
export function parseOftStore(account: AccountInfo | null, programAddress: Address): OftStore | null;
/**
 * Parses a Legacy Mesh oft peer config account.
 *
 * @param {AccountInfo | null} account - The account.
 * @param {Address} programAddress - The oft program expected to own it.
 * @returns {PeerConfig | null} The peer config, or null if the account is missing, has another owner or discriminator, or is truncated.
 */
export function parsePeerConfig(account: AccountInfo | null, programAddress: Address): PeerConfig | null;
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
export const sendLibraryConfigDecoder: import("@solana/codecs").FixedSizeDecoder<{
    discriminator: import("@solana/codecs").ReadonlyUint8Array;
    messageLib: import("@solana/addresses").Address<string>;
}>;
export const ulnSendConfigDecoder: import("@solana/codecs").VariableSizeDecoder<{
    discriminator: import("@solana/codecs").ReadonlyUint8Array;
    bump: number;
    requiredDvns: import("@solana/addresses").Address<string>[];
    confirmations: bigint;
    maxMessageSize: number;
    optionalDvnCount: number;
    requiredDvnCount: number;
    optionalDvnThreshold: number;
    optionalDvns: import("@solana/addresses").Address<string>[];
    executor: import("@solana/addresses").Address<string>;
}>;
export const executorConfigDecoder: import("@solana/codecs").VariableSizeDecoder<{
    discriminator: import("@solana/codecs").ReadonlyUint8Array;
    bump: number;
    priceFeed: import("@solana/addresses").Address<string>;
    executors: import("@solana/addresses").Address<string>[];
    owner: import("@solana/addresses").Address<string>;
    paused: boolean;
    denyList: import("@solana/addresses").Address<string>[];
    allowList: import("@solana/addresses").Address<string>[];
    admins: import("@solana/addresses").Address<string>[];
    msglibs: import("@solana/addresses").Address<string>[];
    defaultMultiplierBps: number;
}>;
export const dvnConfigDecoder: import("@solana/codecs").VariableSizeDecoder<{
    discriminator: import("@solana/codecs").ReadonlyUint8Array;
    vid: number;
    priceFeed: import("@solana/addresses").Address<string>;
    denyList: import("@solana/addresses").Address<string>[];
    bump: number;
    msglibs: import("@solana/addresses").Address<string>[];
    quorum: number;
    signers: import("@solana/codecs").ReadonlyUint8Array[];
    allowList: import("@solana/addresses").Address<string>[];
    paused: boolean;
    admins: import("@solana/addresses").Address<string>[];
}>;
export type Address = import("@solana/addresses").Address;
/**
 * An account as returned by the rpc's 'getMultipleAccounts' with base64 encoding.
 */
export type AccountInfo = {
    /**
     * - The program owning the account.
     */
    owner: Address;
    /**
     * - The base64-encoded account data and its encoding.
     */
    data: readonly [string, string];
};
/**
 * A Legacy Mesh oft store account.
 */
export type OftStore = {
    /**
     * - The anchor account discriminator.
     */
    discriminator: Uint8Array;
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
     * - The anchor account discriminator.
     */
    discriminator: Uint8Array;
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
