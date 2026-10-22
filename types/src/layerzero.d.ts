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
/**
 * Resolves the endpoint and message library accounts an oapp forwards to the layerzero endpoint's 'quote' instruction.
 *
 * Port of `SendHelper.getQuoteAccounts` from `@layerzerolabs/lz-solana-sdk-v2`, restricted to the ULN message library.
 *
 * @param {GetAccounts} getAccounts - Fetches accounts, returning null for missing ones.
 * @param {Address} endpoint - The layerzero endpoint program.
 * @param {Address} sender - The oapp sending the message (the oft store).
 * @param {number} dstEid - The destination endpoint id.
 * @param {Uint8Array} receiver - The remote peer, encoded as 32 bytes.
 * @returns {Promise<AccountMeta[]>} The accounts, all read-only.
 * @throws {Error} If the route is not configured or uses a message library other than the ULN.
 */
export function getQuoteSendAccounts(getAccounts: GetAccounts, endpoint: Address, sender: Address, dstEid: number, receiver: Uint8Array): Promise<AccountMeta[]>;
export type Address = import("@solana/addresses").Address;
export type AccountMeta = import("@solana/instructions").AccountMeta;
export type AccountInfo = {
    /**
     * - The program owning the account.
     */
    owner: Address;
    /**
     * - The account data.
     */
    data: Uint8Array;
};
export type GetAccounts = (addresses: Address[]) => Promise<(AccountInfo | null)[]>;
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
