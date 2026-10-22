export const FEE_TOLERANCE: 999n;
/**
 * The chain key of the source chain this module bridges from.
 */
export const SOURCE_CHAIN: "solana";
export namespace SOLANA_OFT_DEPLOYMENTS {
    namespace USDT0 {
        let programId: string;
        let oftStore: string;
        let mint: string;
    }
}
/**
 * The LayerZero V2 ULN (ultra light node) message library program on Solana mainnet.
 * @see https://docs.layerzero.network/v2/deployments/deployed-contracts
 */
export const LAYERZERO_ULN_PROGRAM: "7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH";
export namespace BLOCKCHAINS {
    namespace ethereum {
        let name: string;
        let type: string;
        let nativeToken: string;
        let eid: number;
        let chainId: number;
    }
    namespace arbitrum {
        let name_1: string;
        export { name_1 as name };
        let type_1: string;
        export { type_1 as type };
        let nativeToken_1: string;
        export { nativeToken_1 as nativeToken };
        let eid_1: number;
        export { eid_1 as eid };
        let chainId_1: number;
        export { chainId_1 as chainId };
    }
    namespace celo {
        let name_2: string;
        export { name_2 as name };
        let type_2: string;
        export { type_2 as type };
        let nativeToken_2: string;
        export { nativeToken_2 as nativeToken };
        let eid_2: number;
        export { eid_2 as eid };
        let chainId_2: number;
        export { chainId_2 as chainId };
    }
    namespace solana {
        let name_3: string;
        export { name_3 as name };
        let type_3: string;
        export { type_3 as type };
        let nativeToken_3: string;
        export { nativeToken_3 as nativeToken };
        let eid_3: number;
        export { eid_3 as eid };
        let chainId_3: number;
        export { chainId_3 as chainId };
    }
    namespace ton {
        let name_4: string;
        export { name_4 as name };
        let type_4: string;
        export { type_4 as type };
        let nativeToken_4: string;
        export { nativeToken_4 as nativeToken };
        let eid_4: number;
        export { eid_4 as eid };
        let chainId_4: number;
        export { chainId_4 as chainId };
    }
    namespace tron {
        let name_5: string;
        export { name_5 as name };
        let type_5: string;
        export { type_5 as type };
        let nativeToken_5: string;
        export { nativeToken_5 as nativeToken };
        let eid_5: number;
        export { eid_5 as eid };
        let chainId_5: number;
        export { chainId_5 as chainId };
    }
}
export namespace TOKENS {
    export namespace USDT0_1 {
        export let symbol: string;
        export let decimals: number;
        let name_6: string;
        export { name_6 as name };
    }
    export { USDT0_1 as USDT0 };
    export namespace XAUT0 {
        let symbol_1: string;
        export { symbol_1 as symbol };
        let decimals_1: number;
        export { decimals_1 as decimals };
        let name_7: string;
        export { name_7 as name };
    }
}
