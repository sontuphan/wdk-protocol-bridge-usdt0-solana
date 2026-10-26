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

import { readFileSync } from 'node:fs'

import { jest } from '@jest/globals'

import {
  addDecoderSizePrefix,
  fixDecoderSize,
  getBase64Encoder,
  getBytesDecoder,
  getOptionDecoder,
  getStructDecoder,
  getU32Decoder,
  getU64Decoder
} from '@solana/codecs'
import { getCompiledTransactionMessageDecoder } from '@solana/transaction-messages'
import { getTransactionDecoder } from '@solana/transactions'

import { SOLANA_OFT_DEPLOYMENTS } from '../src/config.js'

export const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/mainnet-arbitrum-route.json', import.meta.url), 'utf8'))

export const DEPLOYMENT = SOLANA_OFT_DEPLOYMENTS.USDT0

export const NATIVE_FEE = 1_000_000n

export const NETWORK_FEE = 5_000n

export const SIGNATURE = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW'

const BLOCKHASH = 'HyXJcgYpURfDhgzuyRL7zxP4FhLg7LZQMeDrR4MXZcMN'

const bytesDecoder = addDecoderSizePrefix(getBytesDecoder(), getU32Decoder())

const sendDataDecoder = getStructDecoder([
  ['discriminator', fixDecoderSize(getBytesDecoder(), 8)],
  ['dstEid', getU32Decoder()],
  ['to', fixDecoderSize(getBytesDecoder(), 32)],
  ['amountLD', getU64Decoder()],
  ['minAmountLD', getU64Decoder()],
  ['extraOptions', bytesDecoder],
  ['composeMsg', getOptionDecoder(bytesDecoder)],
  ['nativeFee', getU64Decoder()],
  ['lzTokenFee', getU64Decoder()]
])

/**
 * Creates a fake solana rpc that serves the recorded mainnet arbitrum route.
 *
 * @returns {Object} The fake rpc, with each method a jest mock.
 */
export function createRpc () {
  const messagingFee = Buffer.alloc(16)
  messagingFee.writeBigUInt64LE(NATIVE_FEE)

  return {
    getMultipleAccounts: jest.fn(keys => ({
      send: async () => ({
        value: keys.map(key => FIXTURE.accounts[key]
          ? { ...FIXTURE.accounts[key], data: [FIXTURE.accounts[key].data, 'base64'], lamports: 1n, executable: false }
          : null)
      })
    })),
    simulateTransaction: jest.fn(() => ({
      send: async () => ({ value: { err: null, returnData: { programId: DEPLOYMENT.programId, data: [messagingFee.toString('base64'), 'base64'] } } })
    })),
    getLatestBlockhash: jest.fn(() => ({ send: async () => ({ value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1n } }) })),
    getFeeForMessage: jest.fn(() => ({ send: async () => ({ value: NETWORK_FEE }) })),
    sendTransaction: jest.fn(() => ({ send: async () => SIGNATURE }))
  }
}

/**
 * Decodes a base64 compiled transaction message.
 *
 * @param {string} message - The base64 compiled message.
 * @returns {{ feePayer: string, programs: string[], oftData: Uint8Array }} The fee payer, the programs called and
 *   the oft instruction's data, if the message has one.
 */
export function decodeMessage (message) {
  const compiled = getCompiledTransactionMessageDecoder().decode(getBase64Encoder().encode(message))
  const programs = compiled.instructions.map(({ programAddressIndex }) => compiled.staticAccounts[programAddressIndex])
  const oft = compiled.instructions.find(({ programAddressIndex }) => compiled.staticAccounts[programAddressIndex] === DEPLOYMENT.programId)

  return { feePayer: compiled.staticAccounts[0], programs, oftData: oft?.data }
}

/**
 * Decodes the data of an oft send instruction.
 *
 * @param {Uint8Array} data - The instruction data.
 * @returns {Object} The send parameters and fees.
 */
export function decodeOftSend (data) {
  return sendDataDecoder.decode(data)
}

/**
 * Decodes a base64 wire transaction.
 *
 * @param {string} transaction - The base64 wire transaction.
 * @returns {{ feePayer: string, programs: string[], oftData: Uint8Array, signatures: Object }} The decoded message and
 *   the transaction's signatures, by address.
 */
export function decodeTransaction (transaction) {
  const { messageBytes, signatures } = getTransactionDecoder().decode(getBase64Encoder().encode(transaction))

  return { ...decodeMessage(Buffer.from(messageBytes).toString('base64')), signatures }
}

/**
 * Returns the fee payer of the quote the protocol simulated.
 *
 * @param {Object} rpc - The fake rpc.
 * @returns {string} The fee payer.
 */
export function simulatedFeePayer (rpc) {
  return decodeTransaction(rpc.simulateTransaction.mock.calls[0][0]).feePayer
}
