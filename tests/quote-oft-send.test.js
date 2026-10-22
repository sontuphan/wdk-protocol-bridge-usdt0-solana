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

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import { Options } from '@layerzerolabs/lz-v2-utilities'
import { getAddressLookupTableDecoder } from '@solana-program/address-lookup-table'
import { parseBase64RpcAccount } from '@solana/accounts'
import { getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses'
import { getBase64Encoder } from '@solana/codecs'
import { AccountRole } from '@solana/instructions'
import { appendTransactionMessageInstructions, createTransactionMessage, decompileTransactionMessage, getCompiledTransactionMessageDecoder, setTransactionMessageFeePayer } from '@solana/transaction-messages'
import { compileTransaction, getBase64EncodedWireTransaction, getTransactionDecoder } from '@solana/transactions'

import Usdt0ProtocolSolana from '../index.js'
import { SOLANA_OFT_DEPLOYMENTS } from '../src/config.js'
import { parseOftStore, parsePeerConfig } from '../src/layerzero.js'

// Accounts read by a quote and a send to arbitrum, recorded from mainnet, and the endpoint accounts that
// '@layerzerolabs/lz-solana-sdk-v2' SendHelper.getQuoteAccounts and getSendAccounts resolved for them (send: [address, role]).
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/mainnet-arbitrum-route.json', import.meta.url), 'utf8'))

const DEPLOYMENT = SOLANA_OFT_DEPLOYMENTS.USDT0
const PAYER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const ARBITRUM_PEER = '5FEMXXjueR7y6Z1uVDxTm4ZZXFp6XnxR1Xu1WmvwjxBF'
const LOOKUP_TABLE = '6zcTrmdkiQp6dZHYUxVr6A2XVDSYi44X1rcPtvwNcrXi'
const [, , SEND_LIBRARY_CONFIG] = FIXTURE.quoteAccounts
const PRICE_FEED = FIXTURE.quoteAccounts[13]

// Anchor discriminators are the first 8 bytes of sha256('<namespace>:<name>').
const discriminator = name => createHash('sha256').update(name).digest().subarray(0, 8)

describe('_quoteOftSend', () => {
  let rpc, protocol, accounts, result

  const sendParam = (amount = 1_000_000n) => ({
    dstEid: 30_110,
    to: protocol._encodeRecipient('arbitrum', '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd'),
    amountLD: amount,
    minAmountLD: amount * 999n / 1_000n,
    extraOptions: Options.newOptions().toBytes(),
    composeMsg: new Uint8Array(),
    oftCmd: new Uint8Array()
  })

  const quote = async (params = sendParam()) => protocol._quoteOftSend(await protocol._getOftRoute(DEPLOYMENT, params.dstEid), params)

  const simulated = () => {
    const [wire] = rpc.simulateTransaction.mock.calls[0]
    const { messageBytes } = getTransactionDecoder().decode(getBase64Encoder().encode(wire))
    const compiled = getCompiledTransactionMessageDecoder().decode(messageBytes)
    const { addresses } = getAddressLookupTableDecoder().decode(getBase64Encoder().encode(FIXTURE.accounts[LOOKUP_TABLE].data))
    const message = decompileTransactionMessage(compiled, { addressesByLookupTableAddress: { [LOOKUP_TABLE]: addresses } })
    return { compiled, message, ix: message.instructions[1] }
  }

  const withData = (key, edit) => {
    const data = Buffer.from(accounts[key].data, 'base64')
    edit(data)
    accounts[key] = { ...accounts[key], data: data.toString('base64') }
  }

  beforeEach(() => {
    accounts = { ...FIXTURE.accounts }
    const fees = Buffer.alloc(16)
    fees.writeBigUInt64LE(9_007_199_254_740_993n)
    fees.writeBigUInt64LE(42n, 8)
    result = { err: null, returnData: { programId: DEPLOYMENT.programId, data: [fees.toString('base64'), 'base64'] } }
    rpc = {
      getMultipleAccounts: jest.fn(keys => ({
        send: async () => ({
          value: keys.map(key => accounts[key] ? { ...accounts[key], data: [accounts[key].data, 'base64'], lamports: 1n, executable: false } : null)
        })
      })),
      simulateTransaction: jest.fn(() => ({ send: async () => ({ value: result }) }))
    }
    protocol = new Usdt0ProtocolSolana({ _rpc: rpc, _commitment: 'finalized', getAddress: async () => PAYER })
  })

  test('resolves the mainnet route like the layerzero sdk, encodes the params, and decodes u64 fees exactly', async () => {
    expect(await quote()).toEqual({ nativeFee: 9_007_199_254_740_993n, lzTokenFee: 42n })

    expect(rpc.getMultipleAccounts).toHaveBeenNthCalledWith(1, [DEPLOYMENT.oftStore, ARBITRUM_PEER], { encoding: 'base64', commitment: 'finalized' })

    const [credits] = await getProgramDerivedAddress({ programAddress: DEPLOYMENT.programId, seeds: ['Credits'] })
    const { compiled, message, ix } = simulated()
    expect(message.feePayer.address).toBe(PAYER)
    expect(ix.programAddress).toBe(DEPLOYMENT.programId)
    expect(ix.accounts.map(account => account.address)).toEqual([DEPLOYMENT.oftStore, credits, ARBITRUM_PEER, ...FIXTURE.quoteAccounts])
    expect(ix.accounts.every(account => account.role === AccountRole.READONLY)).toBe(true)
    expect(compiled.addressTableLookups.map(lookup => lookup.lookupTableAddress)).toEqual([LOOKUP_TABLE])
    expect(Buffer.from(ix.data).toString('hex')).toBe(
      discriminator('global:quote_send').toString('hex') + '9e750000' +
      '000000000000000000000000a460aebce0d3a4becad8ccf9d6d4861296c503bd' +
      '40420f0000000000583e0f00000000000200000000030000'
    )
    expect(rpc.simulateTransaction.mock.calls[0][1]).toEqual({
      encoding: 'base64', commitment: 'finalized', sigVerify: false, replaceRecentBlockhash: true
    })
  })

  test('checks the recorded accounts against the anchor discriminators', () => {
    const data = key => Buffer.from(FIXTURE.accounts[key].data, 'base64').subarray(0, 8)
    expect(data(DEPLOYMENT.oftStore)).toEqual(discriminator('account:OFTStore'))
    expect(data(ARBITRUM_PEER)).toEqual(discriminator('account:PeerConfig'))
  })

  test('encodes a compose message as Some(Vec<u8>)', async () => {
    const params = sendParam(1n)
    params.composeMsg = new Uint8Array([0xab, 0xcd])
    await quote(params)
    expect(Buffer.from(simulated().ix.data).subarray(66).toString('hex')).toBe('0102000000abcd00')
  })

  test('compiles without a lookup table when the store has none', async () => {
    withData(DEPLOYMENT.oftStore, data => { data[243] = 0 })
    await quote()
    expect(simulated().compiled.addressTableLookups ?? []).toEqual([])
    expect(rpc.getMultipleAccounts.mock.calls.flat().flat()).not.toContain(LOOKUP_TABLE)
  })

  test('rejects a lookup table not owned by the lookup table program', async () => {
    accounts[LOOKUP_TABLE] = { ...accounts[LOOKUP_TABLE], owner: PAYER }
    await expect(quote()).rejects.toThrow('Invalid OFT address lookup table account.')
  })

  test('rejects a route whose send library is not the ULN', async () => {
    withData(SEND_LIBRARY_CONFIG, data => getAddressEncoder().encode(PAYER).forEach((byte, i) => { data[8 + i] = byte }))
    await expect(quote()).rejects.toThrow('Unsupported LayerZero message library.')
  })

  test('rejects a send library config owned by another program', async () => {
    accounts[SEND_LIBRARY_CONFIG] = { ...accounts[SEND_LIBRARY_CONFIG], owner: PAYER }
    await expect(quote()).rejects.toThrow('LayerZero send library not initialized.')
  })

  test('rejects a worker config with another discriminator', async () => {
    withData(FIXTURE.quoteAccounts[11], data => { data[0] ^= 0xff })
    await expect(quote()).rejects.toThrow(`Failed to decode account data at address: ${FIXTURE.quoteAccounts[11]}`)
    expect(rpc.simulateTransaction).not.toHaveBeenCalled()
  })

  test('rejects a route with a missing price feed', async () => {
    delete accounts[PRICE_FEED]
    await expect(quote()).rejects.toThrow(`LayerZero price feed ${PRICE_FEED} not initialized.`)
  })

  test('reports simulation errors and logs, including bigint RPC error codes', async () => {
    result.err = { InstructionError: [1n, { Custom: 6001n }] }
    result.logs = ['Program log: InsufficientCredits']
    await expect(quote()).rejects.toThrow('OFT quote simulation failed: {"InstructionError":["1",{"Custom":"6001"}]}. Program log: InsufficientCredits')
  })

  test('reports an unfunded payer clearly', async () => {
    result.err = 'AccountNotFound'
    await expect(quote()).rejects.toThrow('Cannot quote from an unfunded account: fund it with SOL first.')
  })

  test.each(['missing', 'wrong program', 'truncated', 'wrong encoding'])(
    'rejects %s return data', async reason => {
      if (reason === 'missing') delete result.returnData
      if (reason === 'wrong program') result.returnData.programId = PAYER
      if (reason === 'truncated') result.returnData.data[0] = 'AA=='
      if (reason === 'wrong encoding') result.returnData.data[1] = 'base58'
      await expect(quote()).rejects.toThrow('Invalid OFT quote return data.')
    }
  )

  test('rejects an unconfigured destination before simulation', async () => {
    delete accounts[ARBITRUM_PEER]
    await expect(quote()).rejects.toThrow('OFT peer not configured for destination 30110.')
    expect(rpc.simulateTransaction).not.toHaveBeenCalled()
  })

  test('rejects a store for another mint', async () => {
    withData(DEPLOYMENT.oftStore, data => getAddressEncoder().encode(PAYER).forEach((byte, i) => { data[8 + i] = byte }))
    await expect(quote()).rejects.toThrow('Invalid OFT store account.')
  })

  test('propagates RPC failures', async () => {
    rpc.simulateTransaction.mockReturnValue({ send: async () => { throw new Error('RPC unavailable') } })
    await expect(quote()).rejects.toThrow('RPC unavailable')
  })
})

describe('_buildOftSendInstructions', () => {
  const ULN_SETTINGS = FIXTURE.quoteAccounts[7]
  const TOKEN_SOURCE = 'TB5FCqbNsnuLQgEjUuPaT9qtVPTT4U1A8rvi7qzEj2M'
  const NATIVE_FEE = 795_116n

  let accounts, protocol

  const build = async () => protocol._buildOftSendInstructions(await protocol._getOftRoute(DEPLOYMENT, 30_110), {
    dstEid: 30_110,
    to: protocol._encodeRecipient('arbitrum', '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd'),
    amountLD: 1_000_000n,
    minAmountLD: 999_000n,
    extraOptions: Options.newOptions().toBytes(),
    composeMsg: new Uint8Array(),
    oftCmd: new Uint8Array()
  }, NATIVE_FEE, PAYER)

  beforeEach(() => {
    accounts = { ...FIXTURE.accounts }
    const rpc = {
      getMultipleAccounts: jest.fn(keys => ({
        send: async () => ({ value: keys.map(key => accounts[key] ? { ...accounts[key], data: [accounts[key].data, 'base64'] } : null) })
      }))
    }
    protocol = new Usdt0ProtocolSolana({ _rpc: rpc, _commitment: 'confirmed', getAddress: async () => PAYER })
  })

  test('builds the Legacy Mesh send with the layerzero sdk endpoint accounts', async () => {
    const [computeBudget, send] = await build()

    expect(computeBudget.programAddress).toBe('ComputeBudget111111111111111111111111111111')
    expect(Buffer.from(computeBudget.data).toString('hex')).toBe('02801a0600')

    const [credits] = await getProgramDerivedAddress({ programAddress: DEPLOYMENT.programId, seeds: ['Credits'] })
    const [eventAuthority] = await getProgramDerivedAddress({ programAddress: DEPLOYMENT.programId, seeds: ['__event_authority'] })
    const { tokenEscrow } = parseOftStore(parseBase64RpcAccount(DEPLOYMENT.oftStore, { ...accounts[DEPLOYMENT.oftStore], data: [accounts[DEPLOYMENT.oftStore].data, 'base64'] }), DEPLOYMENT.programId)
    expect(send.programAddress).toBe(DEPLOYMENT.programId)
    expect(send.accounts.map(account => [account.address, account.role])).toEqual([
      [PAYER, AccountRole.READONLY_SIGNER],
      [ARBITRUM_PEER, AccountRole.READONLY],
      [DEPLOYMENT.oftStore, AccountRole.WRITABLE],
      [credits, AccountRole.WRITABLE],
      [TOKEN_SOURCE, AccountRole.WRITABLE],
      [tokenEscrow, AccountRole.WRITABLE],
      [DEPLOYMENT.mint, AccountRole.READONLY],
      ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', AccountRole.READONLY],
      [eventAuthority, AccountRole.READONLY],
      [DEPLOYMENT.programId, AccountRole.READONLY],
      ...FIXTURE.sendAccounts
    ])
    expect(Buffer.from(send.data).toString('hex')).toBe(
      discriminator('global:send').toString('hex') + '9e750000' +
      '000000000000000000000000a460aebce0d3a4becad8ccf9d6d4861296c503bd' +
      '40420f0000000000583e0f000000000002000000000300' + 'ec210c0000000000' + '0000000000000000'
    )
  })

  test('loads the non-signer accounts through the store lookup table so the send fits in a transaction', async () => {
    const instructions = await build()
    const [, send] = instructions

    expect(send.accounts.filter(account => account.lookupTableAddress === LOOKUP_TABLE).length).toBeGreaterThan(20)
    expect(send.accounts.filter(account => account.address === PAYER).every(account => !account.lookupTableAddress)).toBe(true)

    const message = setTransactionMessageFeePayer(PAYER, appendTransactionMessageInstructions(instructions, createTransactionMessage({ version: 0 })))
    expect(getBase64Encoder().encode(getBase64EncodedWireTransaction(compileTransaction(message))).length).toBeLessThanOrEqual(1_232)
  })

  test('pays the ULN treasury when one is set', async () => {
    // UlnSettings: discriminator, eid, endpoint, endpoint program, bump and admin take 109 bytes, then Option<Treasury>.
    const data = Buffer.from(accounts[ULN_SETTINGS].data, 'base64')
    const treasury = Buffer.from(getAddressEncoder().encode(ARBITRUM_PEER))
    accounts[ULN_SETTINGS] = {
      ...accounts[ULN_SETTINGS],
      data: Buffer.concat([data.subarray(0, 109), Buffer.from([1, 0]), treasury, Buffer.alloc(8), Buffer.from([0])]).toString('base64')
    }

    const [, send] = await build()
    expect(send.accounts.slice(10).map(account => [account.address, account.role])[14]).toEqual([ARBITRUM_PEER, AccountRole.WRITABLE])
  })

  test('rejects an unconfigured destination', async () => {
    delete accounts[ARBITRUM_PEER]
    await expect(build()).rejects.toThrow('OFT peer not configured for destination 30110.')
  })
})

describe('Legacy Mesh account parsers', () => {
  const account = (key, data = FIXTURE.accounts[key].data) => parseBase64RpcAccount(key, { ...FIXTURE.accounts[key], data: [data, 'base64'] })

  test('parses the mainnet oft store', () => {
    expect(parseOftStore(account(DEPLOYMENT.oftStore), DEPLOYMENT.programId)).toMatchObject({
      tokenMint: DEPLOYMENT.mint,
      endpointProgram: '76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6',
      feeBps: expect.any(Number),
      alt: LOOKUP_TABLE
    })
  })

  test('parses the mainnet arbitrum peer config', () => {
    const peer = parsePeerConfig(account(ARBITRUM_PEER), DEPLOYMENT.programId)
    expect(Buffer.from(peer.peerAddress).toString('hex')).toBe('00000000000000000000000077652d5aba086137b595875263fc200182919b92')
    expect(peer.enforcedOptions.sendOft.length).toBeGreaterThan(0)
  })

  test('returns null for missing, foreign, mismatched, or truncated accounts', () => {
    const store = account(DEPLOYMENT.oftStore)
    expect(parseOftStore(parseBase64RpcAccount(DEPLOYMENT.oftStore, null), DEPLOYMENT.programId)).toBeNull()
    expect(parseOftStore({ ...store, programAddress: PAYER }, DEPLOYMENT.programId)).toBeNull()
    expect(parseOftStore(account(ARBITRUM_PEER), DEPLOYMENT.programId)).toBeNull()
    const truncated = Buffer.from(FIXTURE.accounts[DEPLOYMENT.oftStore].data, 'base64').subarray(0, 100).toString('base64')
    expect(parseOftStore(account(DEPLOYMENT.oftStore, truncated), DEPLOYMENT.programId)).toBeNull()
    expect(parsePeerConfig(store, DEPLOYMENT.programId)).toBeNull()
  })
})
