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

export const FEE_TOLERANCE = 999n

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
  berachain: {
    name: 'Berachain',
    type: 'evm',
    nativeToken: 'BERA',
    eid: 30_362,
    chainId: 80_094
  },
  conflux: {
    name: 'Conflux eSpace',
    type: 'evm',
    nativeToken: 'CFX',
    eid: 30_212,
    chainId: 1_030
  },
  corn: {
    name: 'Corn',
    type: 'evm',
    nativeToken: 'BTCN',
    eid: 30_331,
    chainId: 21_000_000
  },
  flare: {
    name: 'Flare',
    type: 'evm',
    nativeToken: 'FLR',
    eid: 30_295,
    chainId: 14
  },
  hyperevm: {
    name: 'HyperEVM',
    type: 'evm',
    nativeToken: 'HYPE',
    eid: 30_367,
    chainId: 999
  },
  ink: {
    name: 'Ink',
    type: 'evm',
    nativeToken: 'ETH',
    eid: 30_339,
    chainId: 57_073
  },
  mantle: {
    name: 'Mantle',
    type: 'evm',
    nativeToken: 'MNT',
    eid: 30_181,
    chainId: 5_000
  },
  megaeth: {
    name: 'MegaETH',
    type: 'evm',
    nativeToken: 'ETH',
    eid: 30_398,
    chainId: 4_326
  },
  monad: {
    name: 'Monad',
    type: 'evm',
    nativeToken: 'MON',
    eid: 30_390,
    chainId: 143
  },
  morph: {
    name: 'Morph',
    type: 'evm',
    nativeToken: 'ETH',
    eid: 30_322,
    chainId: 2_818
  },
  optimism: {
    name: 'Optimism',
    type: 'evm',
    nativeToken: 'ETH',
    eid: 30_111,
    chainId: 10
  },
  plasma: {
    name: 'Plasma',
    type: 'evm',
    nativeToken: 'XPL',
    eid: 30_383,
    chainId: 9_745
  },
  polygon: {
    name: 'Polygon',
    type: 'evm',
    nativeToken: 'POL',
    eid: 30_109,
    chainId: 137
  },
  rootstock: {
    name: 'Rootstock',
    type: 'evm',
    nativeToken: 'RBTC',
    eid: 30_333,
    chainId: 30
  },
  sei: {
    name: 'Sei',
    type: 'evm',
    nativeToken: 'SEI',
    eid: 30_280,
    chainId: 1_329
  },
  stable: {
    name: 'Stable',
    type: 'evm',
    nativeToken: 'USDT0',
    eid: 30_396,
    chainId: 988
  },
  unichain: {
    name: 'Unichain',
    type: 'evm',
    nativeToken: 'ETH',
    eid: 30_320,
    chainId: 130
  },
  xlayer: {
    name: 'X Layer',
    type: 'evm',
    nativeToken: 'OKB',
    eid: 30_274,
    chainId: 196
  },
  avalanche: {
    name: 'Avalanche',
    type: 'evm',
    nativeToken: 'AVAX',
    eid: 30_106,
    chainId: 43_114
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
