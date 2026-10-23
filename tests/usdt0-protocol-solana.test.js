import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { findAssociatedTokenPda, getTransferInstruction, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { address } from '@solana/addresses'
import { getBase16Decoder, getBase64Encoder } from '@solana/codecs'
import { decompileTransactionMessage, getCompiledTransactionMessageDecoder } from '@solana/transaction-messages'
import { getTransactionDecoder } from '@solana/transactions'

import { WalletAccountReadOnlySolanaGasless, WalletAccountSolanaGasless } from '@tetherto/wdk-wallet-solana-gasless'

import { Address } from '@ton/core'

import Usdt0ProtocolSolana from '../index.js'

const SOLANA_ADDRESS = 'HyXJcgYpURfDhgzuyRL7zxP4FhLg7LZQMeDrR4MXZcMN'

const MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

const EVM_ADDRESS = '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd'

const TON_ADDRESS = 'EQAd31gAUhdO0d0NZsNb_cGl_Maa9PSuNhVLE9z8bBSjX6Gq'

const TRON_ADDRESS = 'TFG4wBaDQ8sHWWP1ACeSGnoNR6RRzevLPt'

const toHex = (bytes) => getBase16Decoder().decode(bytes)

const INSTRUCTION = { programAddress: SOLANA_ADDRESS, accounts: [], data: new Uint8Array([1]) }

const ROUTE = { store: { feeBps: 3 } }

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const PAYMASTER = 'LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY'

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const RPC = {
  getLatestBlockhash: () => ({ send: async () => ({ value: { blockhash: SOLANA_ADDRESS, lastValidBlockHeight: 1n } }) })
}

const createKora = (fee) => ({
  getPaymentInstruction: jest.fn(async ({ fee_token: feeToken, source_wallet: sourceWallet }) => {
    const [source] = await findAssociatedTokenPda({ mint: address(feeToken), owner: address(sourceWallet), tokenProgram: TOKEN_PROGRAM_ADDRESS })
    const [destination] = await findAssociatedTokenPda({ mint: address(feeToken), owner: address(PAYMASTER), tokenProgram: TOKEN_PROGRAM_ADDRESS })
    return { payment_instruction: getTransferInstruction({ source, destination, authority: address(sourceWallet), amount: fee }) }
  }),
  signAndSendTransaction: jest.fn().mockResolvedValue({ signature: 'gasless-signature' })
})

const decodeWireTransaction = (transaction) => {
  const { messageBytes, signatures } = getTransactionDecoder().decode(getBase64Encoder().encode(transaction))
  return { message: decompileTransactionMessage(getCompiledTransactionMessageDecoder().decode(messageBytes)), signatures }
}

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
      expect(protocol._quoteOftSend).toHaveBeenCalledWith(ROUTE, sendParam, SOLANA_ADDRESS)
      expect(protocol._buildOftSendInstructions.mock.calls[0][4]).toBe(SOLANA_ADDRESS)
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

    test('should apply a bridgeMaxFee override', async () => {
      protocol = new Usdt0ProtocolSolana(account, { bridgeMaxFee: 10_000_000n })
      jest.spyOn(protocol, '_getOftRoute').mockResolvedValue(ROUTE)
      jest.spyOn(protocol, '_quoteOftSend').mockResolvedValue({ nativeFee: 1_000_000n, lzTokenFee: 0n })
      jest.spyOn(protocol, '_buildOftSendInstructions').mockResolvedValue([INSTRUCTION])

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }, { bridgeMaxFee: 1_004_999n }))
        .rejects.toThrow('Exceeded maximum fee cost for bridge operation.')
      expect(account.sendTransaction).not.toHaveBeenCalled()
    })

    test('should allow a bridge cost equal to the bridge max fee', async () => {
      protocol = new Usdt0ProtocolSolana(account, { bridgeMaxFee: 1_005_000n })
      jest.spyOn(protocol, '_getOftRoute').mockResolvedValue(ROUTE)
      jest.spyOn(protocol, '_quoteOftSend').mockResolvedValue({ nativeFee: 1_000_000n, lzTokenFee: 0n })
      jest.spyOn(protocol, '_buildOftSendInstructions').mockResolvedValue([INSTRUCTION])

      const result = await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 })

      expect(result).toEqual({ hash: 'dummy-signature', fee: 5_000n, bridgeFee: 1_000_000n })
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

    test.each([0, -1, 1.5, 2 ** 53, 0n, 2n ** 64n, '100'])('should throw for the invalid amount %p before any rpc call', async (amount) => {
      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount }))
        .rejects.toThrow('The bridge amount must be a positive integer in base units that fits in 64 bits.')

      expect(protocol._getOftRoute).not.toHaveBeenCalled()
    })

    test('should accept the largest u64 amount as a bigint', async () => {
      await protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 2n ** 64n - 1n })

      const [, sendParam] = protocol._buildOftSendInstructions.mock.calls[0]
      expect(sendParam.amountLD).toBe(2n ** 64n - 1n)
    })
  })

  describe('gasless accounts', () => {
    let kora

    const createGaslessConfig = () => ({ provider: RPC, paymasterUrl: kora, paymasterAddress: PAYMASTER, paymasterToken: { address: MINT } })

    const spyOnBridgeSteps = (gaslessProtocol) => {
      jest.spyOn(gaslessProtocol, '_getOftRoute').mockResolvedValue(ROUTE)
      jest.spyOn(gaslessProtocol, '_quoteOftSend').mockResolvedValue({ nativeFee: 1_000_000n, lzTokenFee: 0n })
      jest.spyOn(gaslessProtocol, '_buildOftSendInstructions').mockResolvedValue([INSTRUCTION])
    }

    beforeEach(() => {
      kora = createKora(250_000n)
    })

    test('should bridge through the kora paymaster, which pays the layerzero fee, with the paymaster overrides and without bridgeMaxFee', async () => {
      const gaslessAccount = new WalletAccountSolanaGasless(SEED_PHRASE, "0'/0'", createGaslessConfig())
      const gaslessProtocol = new Usdt0ProtocolSolana(gaslessAccount, { bridgeMaxFee: 1n })
      spyOnBridgeSteps(gaslessProtocol)

      const result = await gaslessProtocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 1_000_000 },
        { paymasterToken: { address: USDC_MINT }, transactionMaxFee: 250_000n, bridgeMaxFee: 1n })

      expect(result).toEqual({ hash: 'gasless-signature', fee: 250_000n, bridgeFee: 1_000_000n })

      const sender = await gaslessAccount.getAddress()
      const [, sendParam, , builtSender, payer] = gaslessProtocol._buildOftSendInstructions.mock.calls[0]
      expect([builtSender, payer]).toEqual([sender, PAYMASTER])
      expect(gaslessProtocol._quoteOftSend).toHaveBeenCalledWith(ROUTE, sendParam, PAYMASTER)

      expect(kora.getPaymentInstruction).toHaveBeenCalledTimes(1)
      expect(kora.getPaymentInstruction.mock.calls[0][0]).toMatchObject({ fee_token: USDC_MINT, source_wallet: sender, signer_key: PAYMASTER })

      const [{ transaction, signer_key: signerKey }] = kora.signAndSendTransaction.mock.calls[0]
      expect(signerKey).toBe(PAYMASTER)

      const { message, signatures } = decodeWireTransaction(transaction)
      expect(message.feePayer.address).toBe(PAYMASTER)
      expect(message.instructions.map(({ programAddress }) => programAddress)).toEqual([SOLANA_ADDRESS, TOKEN_PROGRAM_ADDRESS])
      expect(signatures[PAYMASTER]).toBeNull()
      expect(signatures[sender]).toHaveLength(64)
    })

    test('should leave the fee cap to the transactionMaxFee override', async () => {
      const gaslessAccount = new WalletAccountSolanaGasless(SEED_PHRASE, "0'/0'", createGaslessConfig())
      const gaslessProtocol = new Usdt0ProtocolSolana(gaslessAccount)
      spyOnBridgeSteps(gaslessProtocol)

      await expect(gaslessProtocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }, { transactionMaxFee: 249_999n }))
        .rejects.toThrow('Exceeded maximum fee cost for transaction operation.')
      expect(kora.signAndSendTransaction).not.toHaveBeenCalled()
    })

    test('should recognise a gasless account from another copy of the gasless package by its paymaster address', async () => {
      account._config = { paymasterAddress: PAYMASTER }

      await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 })

      expect(protocol._quoteOftSend.mock.calls[0][2]).toBe(PAYMASTER)
      expect(protocol._buildOftSendInstructions.mock.calls[0][4]).toBe(PAYMASTER)
      expect(account.quoteSendTransaction).not.toHaveBeenCalled()
    })

    test('should quote from a read-only gasless account with the paymaster as the payer', async () => {
      const readOnlyAccount = new WalletAccountReadOnlySolanaGasless(SOLANA_ADDRESS, createGaslessConfig())
      const gaslessProtocol = new Usdt0ProtocolSolana(readOnlyAccount)
      spyOnBridgeSteps(gaslessProtocol)

      expect(await gaslessProtocol.quoteBridge({ targetChain: 'ton', recipient: TON_ADDRESS, token: MINT, amount: 100 }, { paymasterToken: { address: USDC_MINT } }))
        .toEqual({ fee: 250_000n, bridgeFee: 1_000_000n })

      const [, , , sender, payer] = gaslessProtocol._buildOftSendInstructions.mock.calls[0]
      expect([sender, payer]).toEqual([SOLANA_ADDRESS, PAYMASTER])

      const [{ transaction, fee_token: feeToken }] = kora.getPaymentInstruction.mock.calls[0]
      expect(feeToken).toBe(USDC_MINT)
      expect(decodeWireTransaction(transaction).message.feePayer.address).toBe(PAYMASTER)
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

    test('should throw for ton addresses outside the base workchain', () => {
      const masterchainAddress = new Address(-1, Buffer.alloc(32, 7)).toString()

      expect(() => encode('ton', masterchainAddress))
        .toThrow("Invalid recipient address for target chain 'ton': UNSUPPORTED_WORKCHAIN.")
    })

    test('should throw for the tron zero address', () => {
      expect(() => encode('tron', 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'))
        .toThrow("Invalid recipient address for target chain 'tron': ZERO_ADDRESS.")
    })

    test('should throw for chains without a recipient encoding', () => {
      expect(() => encode('solana', SOLANA_ADDRESS))
        .toThrow("Target chain 'solana' not supported.")
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
