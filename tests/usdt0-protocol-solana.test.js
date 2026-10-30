import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'

import { getBase16Decoder } from '@solana/codecs'

import { AccountRequiredError, MaximumFeeExceededError, ProviderRequiredError, ValueError } from '@tetherto/wdk-wallet/protocols'
import { WalletAccountReadOnlySolana, WalletAccountSolana } from '@tetherto/wdk-wallet-solana'

import { Address } from '@ton/core'

import Usdt0ProtocolSolana from '../index.js'

import { DEPLOYMENT, NATIVE_FEE, NETWORK_FEE, SIGNATURE, createProgramRpc, createRpc, decodeMessage, decodeOftSend, decodeTransaction, simulatedFeePayer } from './fixture-rpc.js'

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const SOLANA_ADDRESS = 'HyXJcgYpURfDhgzuyRL7zxP4FhLg7LZQMeDrR4MXZcMN'

const MINT = DEPLOYMENT.mint

const EVM_ADDRESS = '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd'

const TON_ADDRESS = 'EQAd31gAUhdO0d0NZsNb_cGl_Maa9PSuNhVLE9z8bBSjX6Gq'

const TRON_ADDRESS = 'TFG4wBaDQ8sHWWP1ACeSGnoNR6RRzevLPt'

const toHex = (bytes) => getBase16Decoder().decode(bytes)

describe('Usdt0ProtocolSolana with a solana wallet account', () => {
  let rpc, account, sender, protocol

  beforeEach(async () => {
    rpc = createRpc()

    account = new WalletAccountSolana(SEED_PHRASE, "0'/0'", { provider: rpc })

    sender = await account.getAddress()

    protocol = new Usdt0ProtocolSolana(account)
  })

  afterEach(() => {
    account.dispose()
  })

  describe('bridge', () => {
    test('should successfully perform a bridge operation', async () => {
      const result = await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 1_000_000 })

      expect(result).toEqual({ hash: SIGNATURE, fee: NETWORK_FEE, bridgeFee: NATIVE_FEE })
      expect(simulatedFeePayer(rpc)).toBe(sender)

      const { feePayer, signatures, oftData } = decodeTransaction(rpc.sendTransaction.mock.calls[0][0])
      const oftSend = decodeOftSend(oftData)
      expect(feePayer).toBe(sender)
      expect(Object.keys(signatures)).toEqual([sender])
      expect(signatures[sender]).toHaveLength(64)
      expect(oftSend).toMatchObject({ dstEid: 30_110, amountLD: 1_000_000n, minAmountLD: 999_700n, nativeFee: NATIVE_FEE, lzTokenFee: 0n })
      expect(toHex(oftSend.to)).toBe('000000000000000000000000a460aebce0d3a4becad8ccf9d6d4861296c503bd')
    })

    test('should throw if the bridge cost exceeds the bridge max fee', async () => {
      protocol = new Usdt0ProtocolSolana(account, { bridgeMaxFee: 1_000_000n })

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new MaximumFeeExceededError('Exceeded maximum fee cost for bridge operation.'))
      expect(rpc.sendTransaction).not.toHaveBeenCalled()
    })

    test('should apply a bridgeMaxFee override', async () => {
      protocol = new Usdt0ProtocolSolana(account, { bridgeMaxFee: 10_000_000n })

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }, { bridgeMaxFee: 1_004_999n }))
        .rejects.toStrictEqual(new MaximumFeeExceededError('Exceeded maximum fee cost for bridge operation.'))
      expect(rpc.sendTransaction).not.toHaveBeenCalled()
    })

    test('should allow a bridge cost equal to the bridge max fee', async () => {
      protocol = new Usdt0ProtocolSolana(account, { bridgeMaxFee: 1_005_000n })

      const result = await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 })

      expect(result).toEqual({ hash: SIGNATURE, fee: NETWORK_FEE, bridgeFee: NATIVE_FEE })
    })

    test('should throw if the account is read-only', async () => {
      protocol = new Usdt0ProtocolSolana(new WalletAccountReadOnlySolana(sender, { provider: rpc }))

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new AccountRequiredError("The 'bridge(options)' method requires the protocol to be initialized with a non read-only account."))
    })

    test('should throw if the account is not connected to a provider', async () => {
      const disconnected = new WalletAccountSolana(SEED_PHRASE, "0'/0'")
      protocol = new Usdt0ProtocolSolana(disconnected)

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new ProviderRequiredError('The wallet must be connected to a provider in order to perform bridge operations.'))

      disconnected.dispose()
    })

    test('should throw if the target chain is not supported', async () => {
      await expect(protocol.bridge({ targetChain: 'unknown', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new ValueError("Target chain 'unknown' not supported."))
    })

    test('should reject an object prototype key as the target chain before validating the other options', async () => {
      await expect(protocol.bridge({ targetChain: 'toString', recipient: EVM_ADDRESS, token: MINT, amount: 0 }))
        .rejects.toStrictEqual(new ValueError("Target chain 'toString' not supported."))
    })

    test('should throw if the target chain is solana', async () => {
      await expect(protocol.bridge({ targetChain: 'solana', recipient: SOLANA_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new ValueError('The target chain cannot be equal to the source chain.'))
    })

    test('should throw if the token is not supported', async () => {
      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: SOLANA_ADDRESS, amount: 100 }))
        .rejects.toStrictEqual(new ValueError(`Token '${SOLANA_ADDRESS}' not supported on this chain.`))
    })

    test.each([0, -1, 1.5, 2 ** 53, 0n, 2n ** 64n, '100'])('should throw for the invalid amount %p before any rpc call', async (amount) => {
      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount }))
        .rejects.toStrictEqual(new ValueError('The bridge amount must be a positive integer in base units that fits in 64 bits.'))

      expect(rpc.getMultipleAccounts).not.toHaveBeenCalled()
    })
  })

  describe('quoteBridge', () => {
    test('should successfully quote a bridge operation', async () => {
      const result = await protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 })

      expect(result).toEqual({ fee: NETWORK_FEE, bridgeFee: NATIVE_FEE })
      expect(simulatedFeePayer(rpc)).toBe(sender)
      expect(rpc.sendTransaction).not.toHaveBeenCalled()
    })

    test('should quote from a read-only account', async () => {
      protocol = new Usdt0ProtocolSolana(new WalletAccountReadOnlySolana(sender, { provider: rpc }))

      const result = await protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 })

      expect(result).toEqual({ fee: NETWORK_FEE, bridgeFee: NATIVE_FEE })
      expect(decodeMessage(rpc.getFeeForMessage.mock.calls[0][0]).feePayer).toBe(sender)
    })

    test('should accept the largest u64 amount as a bigint', async () => {
      await protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 2n ** 64n - 1n })

      expect(decodeOftSend(decodeMessage(rpc.getFeeForMessage.mock.calls[0][0]).oftData).amountLD).toBe(2n ** 64n - 1n)
    })

    test('should throw if the amount after fees exceeds the remaining credits of the route', async () => {
      protocol = new Usdt0ProtocolSolana(new WalletAccountReadOnlySolana(sender, { provider: createProgramRpc(sender, 1_999_399n) }))

      await expect(protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 2_000_000 }))
        .rejects.toStrictEqual(new ValueError('The amount after fees exceeds the remaining capacity of the route to the target chain.'))
    })

    test('should pass the credits check if the remaining credits of the route cover the amount after fees', async () => {
      protocol = new Usdt0ProtocolSolana(new WalletAccountReadOnlySolana(sender, { provider: createProgramRpc(sender, 1_999_400n) }))

      await expect(protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 2_000_000 }))
        .rejects.toThrow('failed: Unsupported program id')
    })

    test('should throw if the account is not connected to a provider', async () => {
      const disconnected = new WalletAccountSolana(SEED_PHRASE, "0'/0'")
      protocol = new Usdt0ProtocolSolana(disconnected)

      await expect(protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new ProviderRequiredError('The wallet must be connected to a provider in order to quote bridge operations.'))

      disconnected.dispose()
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
      expect(() => encode('arbitrum', 'not-an-address')).toThrow(ValueError)
      expect(() => encode('arbitrum', 'not-an-address')).toThrow("Invalid recipient address for target chain 'arbitrum': INVALID_FORMAT.")
    })

    test('should throw for the zero address', async () => {
      await expect(protocol.quoteBridge({ targetChain: 'arbitrum', recipient: '0x0000000000000000000000000000000000000000', token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new ValueError("Invalid recipient address for target chain 'arbitrum': ZERO_ADDRESS."))
    })

    test('should throw for ton addresses outside the base workchain', () => {
      const masterchainAddress = new Address(-1, Buffer.alloc(32, 7)).toString()

      expect(() => encode('ton', masterchainAddress)).toThrow(ValueError)
      expect(() => encode('ton', masterchainAddress)).toThrow("Invalid recipient address for target chain 'ton': UNSUPPORTED_WORKCHAIN.")
    })

    test('should throw for the tron zero address', () => {
      expect(() => encode('tron', 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb')).toThrow(ValueError)
      expect(() => encode('tron', 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb')).toThrow("Invalid recipient address for target chain 'tron': ZERO_ADDRESS.")
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
      expect(await protocol.getSupportedTokens({ toChain: 'unknown' })).toEqual([])
    })

    test('should return an empty list for routes that do not start on solana', async () => {
      expect(await protocol.getSupportedTokens({ fromChain: 'tron' })).toEqual([])
      expect(await protocol.getSupportedTokens({ toChain: 'solana' })).toEqual([])
      expect(await protocol.getSupportedTokens({ fromChain: 'solana', toChain: 'solana' })).toEqual([])
    })

    test('should return the solana tokens for a route from solana', async () => {
      const tokens = await protocol.getSupportedTokens({ fromChain: 'solana', toChain: 'arbitrum' })

      expect(tokens).toEqual([{ token: 'USDT0', chain: 'solana', symbol: 'USDT0', decimals: 6, name: 'USDT0', address: MINT }])
    })

    test('should resolve chains by key, ignoring case', async () => {
      const tokens = await protocol.getSupportedTokens({ toChain: 'ARBITRUM' })

      expect(tokens).toEqual([{ token: 'USDT0', chain: 'arbitrum', symbol: 'USDT0', decimals: 6, name: 'USDT0' }])
    })

    test('should filter tokens by symbol, ignoring case', async () => {
      expect(await protocol.getSupportedTokens({ fromToken: 'usdt0' })).toEqual([{ token: 'USDT0', chain: 'solana', symbol: 'USDT0', decimals: 6, name: 'USDT0', address: MINT }])
      expect(await protocol.getSupportedTokens({ fromToken: 'XAUT0' })).toEqual([])
    })
  })
})
