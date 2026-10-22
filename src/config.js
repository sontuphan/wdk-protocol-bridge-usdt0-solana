// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

/**
 * The chain key of the source chain this module bridges from.
 */
export const SOURCE_CHAIN = 'solana'

/**
 * The USDT0 Legacy Mesh mainnet deployment on Solana, using native SPL USDT.
 * @see https://docs.usdt0.to/api/deployments
 */
export const SOLANA_OFT_DEPLOYMENTS = {
  USDT0: {
    programId: 'Fuww9mfc8ntAwxPUzFia7VJFAdvLppyZwhPJoXySZXf7',
    oftStore: 'HyXJcgYpURfDhgzuyRL7zxP4FhLg7LZQMeDrR4MXZcMN',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  }
}

/**
 * The LayerZero V2 ULN (ultra light node) message library program on Solana mainnet.
 * @see https://docs.layerzero.network/v2/deployments/deployed-contracts
 */
export const LAYERZERO_ULN_PROGRAM = '7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH'

/**
 * The source chain and the destinations of the USDT0 Legacy Mesh, which pools native USDT on each chain.
 * The Solana Legacy Mesh program has peers for these destinations only.
 * @see https://github.com/LayerZero-Labs/usdt-native-mesh/blob/main/programs/oft/src/constants.rs
 */
export const BLOCKCHAINS = {
  ethereum: {
    name: 'Ethereum',
    type: 'evm',
    nativeToken: 'ETH',
    eid: 30_101,
    chainId: 1
  },
  arbitrum: {
    name: 'Arbitrum',
    type: 'evm',
    nativeToken: 'ETH',
    eid: 30_110,
    chainId: 42_161
  },
  celo: {
    name: 'Celo',
    type: 'evm',
    nativeToken: 'CELO',
    eid: 30_125,
    chainId: 42_220
  },
  solana: {
    name: 'Solana',
    type: 'svm',
    nativeToken: 'SOL',
    eid: 30_168,
    chainId: 30_168
  },
  ton: {
    name: 'TON',
    type: 'ton',
    nativeToken: 'TON',
    eid: 30_343,
    chainId: 30_343
  },
  tron: {
    name: 'TRON',
    type: 'tvm',
    nativeToken: 'TRX',
    eid: 30_420,
    chainId: 728_126_428
  }
}

export const TOKENS = {
  USDT0: {
    symbol: 'USDT0',
    decimals: 6,
    name: 'USDT0'
  },
  XAUT0: {
    symbol: 'XAUT0',
    decimals: 6,
    name: 'Tether Gold'
  }
}
