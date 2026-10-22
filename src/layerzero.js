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

import { getAddressDecoder, getProgramDerivedAddress } from '@solana/addresses'
import {
  Endian,
  addDecoderSizePrefix,
  fixDecoderSize,
  getArrayDecoder,
  getBase16Decoder,
  getBase64Encoder,
  getBooleanDecoder,
  getBytesDecoder,
  getNullableDecoder,
  getStructDecoder,
  getU16Decoder,
  getU32Decoder,
  getU32Encoder,
  getU64Decoder,
  getU8Decoder
} from '@solana/codecs'

/** @typedef {import('@solana/addresses').Address} Address */

/**
 * An account as returned by the rpc's 'getMultipleAccounts' with base64 encoding.
 *
 * @typedef {Object} AccountInfo
 * @property {Address} owner - The program owning the account.
 * @property {readonly [string, string]} data - The base64-encoded account data and its encoding.
 */

/**
 * A Legacy Mesh oft store account.
 *
 * @typedef {Object} OftStore
 * @property {Uint8Array} discriminator - The anchor account discriminator.
 * @property {Address} tokenMint - The token mint.
 * @property {Address} tokenEscrow - The escrow holding the tvl and fees.
 * @property {Address} endpointProgram - The layerzero endpoint program.
 * @property {number} bump - The pda bump.
 * @property {bigint} feeBalance - The accrued fees.
 * @property {Address} superAdmin - The super admin.
 * @property {Address} planner - The planner.
 * @property {Address} lpAdmin - The lp admin.
 * @property {Address} burnAndNilifyAdmin - The burn and nilify admin.
 * @property {number} feeBps - The fee, in basis points.
 * @property {Address | null} alt - The address lookup table, if any.
 */

/**
 * A Legacy Mesh oft peer config account.
 *
 * @typedef {Object} PeerConfig
 * @property {Uint8Array} discriminator - The anchor account discriminator.
 * @property {Uint8Array} peerAddress - The remote peer, encoded as 32 bytes.
 * @property {{ withdrawRemote: Uint8Array, sendOft: Uint8Array, sendCredits: Uint8Array, sendOftAndCall: Uint8Array }} enforcedOptions - The enforced options per message type.
 * @property {number} bump - The pda bump.
 */

// Anchor discriminators: the first 8 bytes of sha256('account:<name>').
const OFT_STORE_DISCRIMINATOR = 'c3d76886b9c3f072'

const PEER_CONFIG_DISCRIMINATOR = 'b59d56c621c15ecb'

const addressesDecoder = getArrayDecoder(getAddressDecoder())

const discriminatorDecoder = fixDecoderSize(getBytesDecoder(), 8)

const optionsDecoder = addDecoderSizePrefix(getBytesDecoder(), getU32Decoder())

// Legacy Mesh account layouts.
// @see https://github.com/LayerZero-Labs/usdt-native-mesh/tree/4ce9a592e178a333a451a3d464cee3bd782fbaf1/programs/oft/src/state
const oftStoreDecoder = getStructDecoder([
  ['discriminator', discriminatorDecoder],
  ['tokenMint', getAddressDecoder()],
  ['tokenEscrow', getAddressDecoder()],
  ['endpointProgram', getAddressDecoder()],
  ['bump', getU8Decoder()],
  ['feeBalance', getU64Decoder()],
  ['superAdmin', getAddressDecoder()],
  ['planner', getAddressDecoder()],
  ['lpAdmin', getAddressDecoder()],
  ['burnAndNilifyAdmin', getAddressDecoder()],
  ['feeBps', getU16Decoder()],
  ['alt', getNullableDecoder(getAddressDecoder())]
])

const peerConfigDecoder = getStructDecoder([
  ['discriminator', discriminatorDecoder],
  ['peerAddress', fixDecoderSize(getBytesDecoder(), 32)],
  ['enforcedOptions', getStructDecoder([
    ['withdrawRemote', optionsDecoder],
    ['sendOft', optionsDecoder],
    ['sendCredits', optionsDecoder],
    ['sendOftAndCall', optionsDecoder]
  ])],
  ['bump', getU8Decoder()]
])

// Account layouts from the layerzero idls, decoded up to the last field read; trailing fields are ignored.
export const sendLibraryConfigDecoder = getStructDecoder([
  ['discriminator', discriminatorDecoder],
  ['messageLib', getAddressDecoder()]
])

export const ulnSendConfigDecoder = getStructDecoder([
  ['discriminator', discriminatorDecoder],
  ['bump', getU8Decoder()],
  ['confirmations', getU64Decoder()],
  ['requiredDvnCount', getU8Decoder()],
  ['optionalDvnCount', getU8Decoder()],
  ['optionalDvnThreshold', getU8Decoder()],
  ['requiredDvns', addressesDecoder],
  ['optionalDvns', addressesDecoder],
  ['maxMessageSize', getU32Decoder()],
  ['executor', getAddressDecoder()]
])

export const executorConfigDecoder = getStructDecoder([
  ['discriminator', discriminatorDecoder],
  ['bump', getU8Decoder()],
  ['owner', getAddressDecoder()],
  ['allowList', addressesDecoder],
  ['denyList', addressesDecoder],
  ['admins', addressesDecoder],
  ['executors', addressesDecoder],
  ['msglibs', addressesDecoder],
  ['paused', getBooleanDecoder()],
  ['defaultMultiplierBps', getU16Decoder()],
  ['priceFeed', getAddressDecoder()]
])

export const dvnConfigDecoder = getStructDecoder([
  ['discriminator', discriminatorDecoder],
  ['vid', getU32Decoder()],
  ['bump', getU8Decoder()],
  ['signers', getArrayDecoder(fixDecoderSize(getBytesDecoder(), 64))],
  ['quorum', getU8Decoder()],
  ['allowList', addressesDecoder],
  ['denyList', addressesDecoder],
  ['paused', getBooleanDecoder()],
  ['msglibs', addressesDecoder],
  ['admins', addressesDecoder],
  ['priceFeed', getAddressDecoder()]
])

/**
 * Parses a Legacy Mesh oft store account.
 *
 * @param {AccountInfo | null} account - The account.
 * @param {Address} programAddress - The oft program expected to own it.
 * @returns {OftStore | null} The oft store, or null if the account is missing, has another owner or discriminator, or is truncated.
 */
export function parseOftStore (account, programAddress) {
  if (!account || account.owner !== programAddress) {
    return null
  }

  const data = getBase64Encoder().encode(account.data[0])

  if (getBase16Decoder().decode(data.slice(0, 8)) !== OFT_STORE_DISCRIMINATOR) {
    return null
  }

  try {
    return oftStoreDecoder.decode(data)
  } catch {
    // Truncated account.
    return null
  }
}

/**
 * Parses a Legacy Mesh oft peer config account.
 *
 * @param {AccountInfo | null} account - The account.
 * @param {Address} programAddress - The oft program expected to own it.
 * @returns {PeerConfig | null} The peer config, or null if the account is missing, has another owner or discriminator, or is truncated.
 */
export function parsePeerConfig (account, programAddress) {
  if (!account || account.owner !== programAddress) {
    return null
  }

  const data = getBase64Encoder().encode(account.data[0])

  if (getBase16Decoder().decode(data.slice(0, 8)) !== PEER_CONFIG_DISCRIMINATOR) {
    return null
  }

  try {
    return peerConfigDecoder.decode(data)
  } catch {
    // Truncated account.
    return null
  }
}

/**
 * Derives an oft program's peer config account for a destination.
 *
 * @param {Address} programAddress - The oft program.
 * @param {number} dstEid - The destination endpoint id.
 * @returns {Promise<Address>} The peer config address.
 */
export async function getPeerAddress (programAddress, dstEid) {
  const [peer] = await getProgramDerivedAddress({ programAddress, seeds: ['Peer', getU32Encoder({ endian: Endian.Big }).encode(dstEid)] })

  return peer
}

/**
 * Derives a Legacy Mesh oft program's credits account.
 *
 * @param {Address} programAddress - The oft program.
 * @returns {Promise<Address>} The credits address.
 */
export async function getCreditsAddress (programAddress) {
  const [credits] = await getProgramDerivedAddress({ programAddress, seeds: ['Credits'] })

  return credits
}
