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

import { decodeAccount } from '@solana/accounts'
import { getAddressDecoder, getProgramDerivedAddress } from '@solana/addresses'
import {
  Endian,
  addDecoderSizePrefix,
  addEncoderSizePrefix,
  fixDecoderSize,
  fixEncoderSize,
  getArrayDecoder,
  getBase16Encoder,
  getBooleanDecoder,
  getBooleanEncoder,
  getBytesDecoder,
  getBytesEncoder,
  getConstantDecoder,
  getConstantEncoder,
  getNullableDecoder,
  getOptionEncoder,
  getStructDecoder,
  getStructEncoder,
  getU16Decoder,
  getU32Decoder,
  getU32Encoder,
  getU64Decoder,
  getU64Encoder,
  getU8Decoder,
  transformEncoder
} from '@solana/codecs'

/** @typedef {import('@solana/addresses').Address} Address */
/** @typedef {import('@solana/codecs').ReadonlyUint8Array} ReadonlyUint8Array */
/** @typedef {import('@solana/accounts').MaybeEncodedAccount} MaybeEncodedAccount */

/**
 * A Legacy Mesh oft store account.
 *
 * @typedef {Object} OftStore
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
 * @property {ReadonlyUint8Array} peerAddress - The remote peer, encoded as 32 bytes.
 * @property {{
 *   withdrawRemote: ReadonlyUint8Array,
 *   sendOft: ReadonlyUint8Array,
 *   sendCredits: ReadonlyUint8Array,
 *   sendOftAndCall: ReadonlyUint8Array
 * }} enforcedOptions - The enforced options per message type.
 * @property {number} bump - The pda bump.
 */

// Anchor discriminators: the first 8 bytes of sha256('account:<name>') or sha256('global:<instruction>').
const OFT_STORE_DISCRIMINATOR = 'c3d76886b9c3f072'

const PEER_CONFIG_DISCRIMINATOR = 'b59d56c621c15ecb'

const QUOTE_SEND_DISCRIMINATOR = 'cf0031d6a0d34cd3'

const SEND_DISCRIMINATOR = '66fb14bb414b0c45'

const ULN_SETTINGS_DISCRIMINATOR = 'e2c764fd2673a79a'

const SEND_LIBRARY_CONFIG_DISCRIMINATOR = '3dee1f48fb7542b0'

const ULN_SEND_CONFIG_DISCRIMINATOR = '5bdd878983c7ae19'

const EXECUTOR_CONFIG_DISCRIMINATOR = '8611e2180aad9d4e'

const DVN_CONFIG_DISCRIMINATOR = '31512162eaa85d49'

const addressesDecoder = getArrayDecoder(getAddressDecoder())

// Borsh Vec<u8>.
const bytesEncoder = addEncoderSizePrefix(getBytesEncoder(), getU32Encoder())

const bytesDecoder = addDecoderSizePrefix(getBytesDecoder(), getU32Decoder())

const composeMsgEncoder = transformEncoder(getOptionEncoder(bytesEncoder), (composeMsg) => composeMsg.length ? composeMsg : null)

// Legacy Mesh account layouts.
// @see https://github.com/LayerZero-Labs/usdt-native-mesh/tree/4ce9a592e178a333a451a3d464cee3bd782fbaf1/programs/oft/src/state
const oftStoreDecoder = getStructDecoder([
  ['discriminator', getConstantDecoder(getBase16Encoder().encode(OFT_STORE_DISCRIMINATOR))],
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
  ['discriminator', getConstantDecoder(getBase16Encoder().encode(PEER_CONFIG_DISCRIMINATOR))],
  ['peerAddress', fixDecoderSize(getBytesDecoder(), 32)],
  ['enforcedOptions', getStructDecoder([
    ['withdrawRemote', bytesDecoder],
    ['sendOft', bytesDecoder],
    ['sendCredits', bytesDecoder],
    ['sendOftAndCall', bytesDecoder]
  ])],
  ['bump', getU8Decoder()]
])

export const quoteSendEncoder = getStructEncoder([
  ['discriminator', getConstantEncoder(getBase16Encoder().encode(QUOTE_SEND_DISCRIMINATOR))],
  ['dstEid', getU32Encoder()],
  ['to', fixEncoderSize(getBytesEncoder(), 32)],
  ['amountLD', getU64Encoder()],
  ['minAmountLD', getU64Encoder()],
  ['extraOptions', bytesEncoder],
  ['composeMsg', composeMsgEncoder],
  ['payInLzToken', getBooleanEncoder()]
])

export const sendEncoder = getStructEncoder([
  ['discriminator', getConstantEncoder(getBase16Encoder().encode(SEND_DISCRIMINATOR))],
  ['dstEid', getU32Encoder()],
  ['to', fixEncoderSize(getBytesEncoder(), 32)],
  ['amountLD', getU64Encoder()],
  ['minAmountLD', getU64Encoder()],
  ['extraOptions', bytesEncoder],
  ['composeMsg', composeMsgEncoder],
  ['nativeFee', getU64Encoder()],
  ['lzTokenFee', getU64Encoder()]
])

export const messagingFeeDecoder = getStructDecoder([
  ['nativeFee', getU64Decoder()],
  ['lzTokenFee', getU64Decoder()]
])

// Account layouts from the layerzero idls, decoded up to the last field read; trailing fields are ignored.
export const ulnSettingsDecoder = getStructDecoder([
  ['discriminator', getConstantDecoder(getBase16Encoder().encode(ULN_SETTINGS_DISCRIMINATOR))],
  ['eid', getU32Decoder()],
  ['endpoint', getAddressDecoder()],
  ['endpointProgram', getAddressDecoder()],
  ['bump', getU8Decoder()],
  ['admin', getAddressDecoder()],
  ['treasury', getNullableDecoder(getStructDecoder([
    ['admin', getNullableDecoder(getAddressDecoder())],
    ['nativeReceiver', getAddressDecoder()],
    ['nativeFeeBps', getU64Decoder()],
    ['lzToken', getNullableDecoder(getStructDecoder([['receiver', getAddressDecoder()], ['fee', getU64Decoder()]]))]
  ]))]
])

export const sendLibraryConfigDecoder = getStructDecoder([
  ['discriminator', getConstantDecoder(getBase16Encoder().encode(SEND_LIBRARY_CONFIG_DISCRIMINATOR))],
  ['messageLib', getAddressDecoder()]
])

export const ulnSendConfigDecoder = getStructDecoder([
  ['discriminator', getConstantDecoder(getBase16Encoder().encode(ULN_SEND_CONFIG_DISCRIMINATOR))],
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
  ['discriminator', getConstantDecoder(getBase16Encoder().encode(EXECUTOR_CONFIG_DISCRIMINATOR))],
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
  ['discriminator', getConstantDecoder(getBase16Encoder().encode(DVN_CONFIG_DISCRIMINATOR))],
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
 * @param {MaybeEncodedAccount} account - The account.
 * @param {Address} programAddress - The oft program expected to own it.
 * @returns {OftStore | null} The oft store, or null if the account is missing or has another owner.
 * @throws {Error} If the account's data has another discriminator or is truncated.
 */
export function parseOftStore (account, programAddress) {
  if (!account.exists || account.programAddress !== programAddress) {
    return null
  }

  return decodeAccount(account, oftStoreDecoder).data
}

/**
 * Parses a Legacy Mesh oft peer config account.
 *
 * @param {MaybeEncodedAccount} account - The account.
 * @param {Address} programAddress - The oft program expected to own it.
 * @returns {PeerConfig | null} The peer config, or null if the account is missing or has another owner.
 * @throws {Error} If the account's data has another discriminator or is truncated.
 */
export function parsePeerConfig (account, programAddress) {
  if (!account.exists || account.programAddress !== programAddress) {
    return null
  }

  return decodeAccount(account, peerConfigDecoder).data
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
