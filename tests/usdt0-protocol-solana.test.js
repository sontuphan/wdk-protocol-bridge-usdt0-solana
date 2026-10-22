import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { getBase16Decoder } from '@solana/codecs'

import { Address } from '@ton/core'

import Usdt0ProtocolSolana from '../index.js'

const SOLANA_ADDRESS = 'HyXJcgYpURfDhgzuyRL7zxP4FhLg7LZQMeDrR4MXZcMN'

const MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

const EVM_ADDRESS = '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd'

const TON_ADDRESS = 'EQAd31gAUhdO0d0NZsNb_cGl_Maa9PSuNhVLE9z8bBSjX6Gq'

const TRON_ADDRESS = 'TFG4wBaDQ8sHWWP1ACeSGnoNR6RRzevLPt'

const toHex = (bytes) => getBase16Decoder().decode(bytes)

const INSTRUCTION = { programAddress: SOLANA_ADDRESS, accounts: [], data: new Uint8Array([1]) }

// A 3 bps store fee, as on mainnet.
const ROUTE = { store: { feeBps: 3 } }

describe('Usdt0ProtocolSolana', () => {
  let account, protocol

  beforeEach(() => {
    account = {
      _rpc: {},
      getAddress: jest.fn().mockResolvedValue(SOLANA_ADDRESS),
      quoteSendTransaction: jest.fn().mockResolvedValue({ fee: 5_000n }),
      sendTransaction: jest.fn().mockResolvedValue({ hash: 'dummy-signature', fee: 5_000n })
    }

    protocol = new Usdt0ProtocolSolana(account)

    jest.spyOn(protocol, '_getOftRoute').mockResolvedValue(ROUTE)
    jest.spyOn(protocol, '_quoteOftSend').mockResolvedValue({ nativeFee: 1_000_000n, lzTokenFee: 0n })
    jest.spyOn(protocol, '_buildOftSendInstructions').mockResolvedValue([INSTRUCTION])
  })

  describe('bridge', () => {
    test('should successfully perform a bridge operation', async () => {
      const result = await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 1_000_000 })

      expect(result).toEqual({ hash: 'dummy-signature', fee: 5_000n, bridgeFee: 1_000_000n })

      const [tx] = account.sendTransaction.mock.calls[0]
      expect(tx.instructions).toEqual([INSTRUCTION])

      const [route, sendParam, nativeFee, sender] = protocol._buildOftSendInstructions.mock.calls[0]
      expect(route).toBe(ROUTE)
      expect(protocol._quoteOftSend).toHaveBeenCalledWith(ROUTE, sendParam)
      expect(sendParam.dstEid).toBe(30_110)
      expect(sendParam.amountLD).toBe(1_000_000n)
      // The 3 bps store fee is 300, so exactly the rest must arrive.
      expect(sendParam.minAmountLD).toBe(999_700n)
      expect(nativeFee).toBe(1_000_000n)
      expect(sender).toBe(SOLANA_ADDRESS)
    })

    test('should use the custom dstEid when provided', async () => {
      await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100, dstEid: 40_231 })

      const [, sendParam] = protocol._buildOftSendInstructions.mock.calls[0]
      expect(sendParam.dstEid).toBe(40_231)
    })

    test('should throw if the bridge cost exceeds the bridge max fee', async () => {
      protocol = new Usdt0ProtocolSolana(account, { bridgeMaxFee: 1_000_000n })
      jest.spyOn(protocol, '_getOftRoute').mockResolvedValue(ROUTE)
    jest.spyOn(protocol, '_quoteOftSend').mockResolvedValue({ nativeFee: 1_000_000n, lzTokenFee: 0n })
      jest.spyOn(protocol, '_buildOftSendInstructions').mockResolvedValue([INSTRUCTION])

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toThrow('Exceeded maximum fee cost for bridge operation.')
    })

    test('should throw if the account is read-only', async () => {
      delete account.sendTransaction

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toThrow("The 'bridge(options)' method requires the protocol to be initialized with a non read-only account.")
    })

    test('should throw if the account is not connected to a provider', async () => {
      delete account._rpc

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toThrow('The wallet must be connected to a provider in order to perform bridge operations.')
    })

    test('should throw if the target chain is not supported', async () => {
      await expect(protocol.bridge({ targetChain: 'unknown', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toThrow("Target chain 'unknown' not supported.")
    })

    test('should throw if the target chain is solana', async () => {
      await expect(protocol.bridge({ targetChain: 'solana', recipient: SOLANA_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toThrow('The target chain cannot be equal to the source chain.')
    })

    test('should throw if the token is not supported', async () => {
      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: SOLANA_ADDRESS, amount: 100 }))
        .rejects.toThrow(`Token '${SOLANA_ADDRESS}' not supported on this chain.`)
    })
  })

  describe('quoteBridge', () => {
    test('should successfully quote a bridge operation', async () => {
      const result = await protocol.quoteBridge({ targetChain: 'ton', recipient: TON_ADDRESS, token: MINT, amount: 100 })

      expect(result).toEqual({ fee: 5_000n, bridgeFee: 1_000_000n })
    })

    test('should throw if the account is not connected to a provider', async () => {
      delete account._rpc

      await expect(protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toThrow('The wallet must be connected to a provider in order to quote bridge operations.')
    })
  })

  describe('recipient encoding', () => {
    const encode = (targetChain, recipient) => toHex(protocol._encodeRecipient(targetChain, recipient))

    test('should encode evm addresses', () => {
      expect(encode('arbitrum', EVM_ADDRESS)).toBe('000000000000000000000000a460aebce0d3a4becad8ccf9d6d4861296c503bd')
    })

    test('should encode ton addresses', () => {
      expect(encode('ton', TON_ADDRESS)).toBe(Address.parse(TON_ADDRESS).toRawString().slice(2))
    })

    test('should encode tron addresses', () => {
      expect(encode('tron', TRON_ADDRESS)).toBe('0000000000000000000000413a08f76772e200653bb55c2a92998daca62e0e97')
    })

    test('should throw for invalid recipients', () => {
      expect(() => encode('arbitrum', 'not-an-address'))
        .toThrow("Invalid recipient address for target chain 'arbitrum': INVALID_FORMAT.")
    })

    test('should throw for the zero address', async () => {
      await expect(protocol.quoteBridge({ targetChain: 'arbitrum', recipient: '0x0000000000000000000000000000000000000000', token: MINT, amount: 100 }))
        .rejects.toThrow("Invalid recipient address for target chain 'arbitrum': ZERO_ADDRESS.")
    })
  })

  describe('getSupportedChains', () => {
    test('should return the source chain and the legacy mesh destinations', async () => {
      const chains = await protocol.getSupportedChains()

      expect(chains.map(({ id }) => id)).toEqual(['ethereum', 'arbitrum', 'celo', 'solana', 'ton', 'tron'])
      expect(chains).toContainEqual({ id: 'arbitrum', name: 'Arbitrum', type: 'evm', nativeToken: 'ETH' })
      expect(chains).toContainEqual({ id: 'solana', name: 'Solana', type: 'svm', nativeToken: 'SOL' })
    })
  })

  describe('getSupportedTokens', () => {
    test('should return the solana tokens by default', async () => {
      const tokens = await protocol.getSupportedTokens()

      expect(tokens).toEqual([{ token: 'USDT0', chain: 'solana', symbol: 'USDT0', decimals: 6, name: 'USDT0', address: MINT }])
    })

    test('should resolve chains by chain id', async () => {
      const tokens = await protocol.getSupportedTokens({ toChain: 42_161 })

      expect(tokens).toEqual([{ token: 'USDT0', chain: 'arbitrum', symbol: 'USDT0', decimals: 6, name: 'USDT0' }])
    })

    test('should return an empty list for unknown chains', async () => {
      expect(await protocol.getSupportedTokens({ fromChain: 'unknown' })).toEqual([])
    })
  })
})
