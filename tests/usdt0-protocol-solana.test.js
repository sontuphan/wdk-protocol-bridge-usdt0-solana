import { readFileSync } from 'node:fs'

import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { findAssociatedTokenPda, getTransferInstruction, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { address } from '@solana/addresses'
import {
  addDecoderSizePrefix,
  fixDecoderSize,
  getBase16Decoder,
  getBase64Encoder,
  getBytesDecoder,
  getOptionDecoder,
  getStructDecoder,
  getU32Decoder,
  getU64Decoder
} from '@solana/codecs'
import { AccountRole } from '@solana/instructions'
import { getCompiledTransactionMessageDecoder } from '@solana/transaction-messages'
import { getTransactionDecoder } from '@solana/transactions'

import { AccountRequiredError, MaximumFeeExceededError, ProviderRequiredError, ValueError } from '@tetherto/wdk-wallet/protocols'
import { WalletAccountReadOnlySolanaGasless, WalletAccountSolanaGasless } from '@tetherto/wdk-wallet-solana-gasless'

import { Address } from '@ton/core'

import Usdt0ProtocolSolana from '../index.js'
import { SOLANA_OFT_DEPLOYMENTS } from '../src/config.js'

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/mainnet-arbitrum-route.json', import.meta.url), 'utf8'))

const DEPLOYMENT = SOLANA_OFT_DEPLOYMENTS.USDT0

const SOLANA_ADDRESS = 'HyXJcgYpURfDhgzuyRL7zxP4FhLg7LZQMeDrR4MXZcMN'

const MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

const EVM_ADDRESS = '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd'

const TON_ADDRESS = 'EQAd31gAUhdO0d0NZsNb_cGl_Maa9PSuNhVLE9z8bBSjX6Gq'

const TRON_ADDRESS = 'TFG4wBaDQ8sHWWP1ACeSGnoNR6RRzevLPt'

const NATIVE_FEE = 1_000_000n

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const PAYMASTER = 'LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY'

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const toHex = (bytes) => getBase16Decoder().decode(bytes)

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

const createRpc = () => {
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
    getLatestBlockhash: () => ({ send: async () => ({ value: { blockhash: SOLANA_ADDRESS, lastValidBlockHeight: 1n } }) })
  }
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
  const message = getCompiledTransactionMessageDecoder().decode(messageBytes)
  return { feePayer: message.staticAccounts[0], programs: message.instructions.map(({ programAddressIndex }) => message.staticAccounts[programAddressIndex]), signatures }
}

const simulatedFeePayer = (rpc) => decodeWireTransaction(rpc.simulateTransaction.mock.calls[0][0]).feePayer

const oftSend = (tx) => {
  const instruction = tx.instructions.find(({ programAddress }) => programAddress === DEPLOYMENT.programId)
  return { instruction, data: sendDataDecoder.decode(instruction.data) }
}

const signerOf = (instruction, role) => instruction.accounts.filter((account) => account.role === role).map((account) => account.address)

describe('Usdt0ProtocolSolana', () => {
  let rpc, account, protocol

  beforeEach(() => {
    rpc = createRpc()

    account = {
      _rpc: rpc,
      getAddress: jest.fn().mockResolvedValue(SOLANA_ADDRESS),
      quoteSendTransaction: jest.fn().mockResolvedValue({ fee: 5_000n }),
      sendTransaction: jest.fn().mockResolvedValue({ hash: 'dummy-signature', fee: 5_000n })
    }

    protocol = new Usdt0ProtocolSolana(account)
  })

  describe('bridge', () => {
    test('should successfully perform a bridge operation', async () => {
      const result = await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 1_000_000 })

      expect(result).toEqual({ hash: 'dummy-signature', fee: 5_000n, bridgeFee: NATIVE_FEE })
      expect(simulatedFeePayer(rpc)).toBe(SOLANA_ADDRESS)

      const [tx] = account.sendTransaction.mock.calls[0]
      const { instruction, data } = oftSend(tx)
      expect(instruction.accounts[0]).toEqual({ address: SOLANA_ADDRESS, role: AccountRole.READONLY_SIGNER })
      expect(signerOf(instruction, AccountRole.WRITABLE_SIGNER)).toEqual([SOLANA_ADDRESS])
      expect(data).toMatchObject({ dstEid: 30_110, amountLD: 1_000_000n, minAmountLD: 999_700n, nativeFee: NATIVE_FEE, lzTokenFee: 0n })
      expect(toHex(data.to)).toBe('000000000000000000000000a460aebce0d3a4becad8ccf9d6d4861296c503bd')
    })

    test('should throw if the bridge cost exceeds the bridge max fee', async () => {
      protocol = new Usdt0ProtocolSolana(account, { bridgeMaxFee: 1_000_000n })

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new MaximumFeeExceededError('Exceeded maximum fee cost for bridge operation.'))
    })

    test('should apply a bridgeMaxFee override', async () => {
      protocol = new Usdt0ProtocolSolana(account, { bridgeMaxFee: 10_000_000n })

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }, { bridgeMaxFee: 1_004_999n }))
        .rejects.toStrictEqual(new MaximumFeeExceededError('Exceeded maximum fee cost for bridge operation.'))
      expect(account.sendTransaction).not.toHaveBeenCalled()
    })

    test('should allow a bridge cost equal to the bridge max fee', async () => {
      protocol = new Usdt0ProtocolSolana(account, { bridgeMaxFee: 1_005_000n })

      const result = await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 })

      expect(result).toEqual({ hash: 'dummy-signature', fee: 5_000n, bridgeFee: NATIVE_FEE })
    })

    test('should throw if the account is read-only', async () => {
      delete account.sendTransaction

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new AccountRequiredError("The 'bridge(options)' method requires the protocol to be initialized with a non read-only account."))
    })

    test('should throw if the account is not connected to a provider', async () => {
      delete account._rpc

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new ProviderRequiredError('The wallet must be connected to a provider in order to perform bridge operations.'))
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

    test('should accept the largest u64 amount as a bigint', async () => {
      await protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 2n ** 64n - 1n })

      const [tx] = account.quoteSendTransaction.mock.calls[0]
      expect(oftSend(tx).data.amountLD).toBe(2n ** 64n - 1n)
    })
  })

  describe('gasless accounts', () => {
    let kora

    const createGaslessConfig = () => ({ provider: rpc, paymasterUrl: kora, paymasterAddress: PAYMASTER, paymasterToken: { address: MINT } })

    beforeEach(() => {
      kora = createKora(250_000n)
    })

    test('should bridge through the kora paymaster, which pays the layerzero fee, with the paymaster overrides', async () => {
      const gaslessAccount = new WalletAccountSolanaGasless(SEED_PHRASE, "0'/0'", createGaslessConfig())
      const gaslessProtocol = new Usdt0ProtocolSolana(gaslessAccount, { bridgeMaxFee: 1n })

      const result = await gaslessProtocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 1_000_000 },
        { paymasterToken: { address: USDC_MINT }, transactionMaxFee: 250_000n, bridgeMaxFee: 1_000_000n })

      expect(result).toEqual({ hash: 'gasless-signature', fee: 250_000n, bridgeFee: NATIVE_FEE })
      expect(simulatedFeePayer(rpc)).toBe(PAYMASTER)

      const sender = await gaslessAccount.getAddress()

      expect(kora.getPaymentInstruction).toHaveBeenCalledTimes(1)
      expect(kora.getPaymentInstruction.mock.calls[0][0]).toMatchObject({ fee_token: USDC_MINT, source_wallet: sender, signer_key: PAYMASTER })

      const [{ transaction, signer_key: signerKey }] = kora.signAndSendTransaction.mock.calls[0]
      expect(signerKey).toBe(PAYMASTER)

      const { feePayer, programs, signatures } = decodeWireTransaction(transaction)
      expect(feePayer).toBe(PAYMASTER)
      expect(programs.slice(-2)).toEqual([DEPLOYMENT.programId, TOKEN_PROGRAM_ADDRESS])
      expect(signatures[PAYMASTER]).toBeNull()
      expect(signatures[sender]).toHaveLength(64)
    })

    test('should cap the bridge fee alone with bridgeMaxFee before contacting the paymaster', async () => {
      const gaslessAccount = new WalletAccountSolanaGasless(SEED_PHRASE, "0'/0'", createGaslessConfig())
      const gaslessProtocol = new Usdt0ProtocolSolana(gaslessAccount)

      await expect(gaslessProtocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }, { bridgeMaxFee: 999_999n }))
        .rejects.toStrictEqual(new MaximumFeeExceededError('Exceeded maximum fee cost for bridge operation.'))
      expect(kora.getPaymentInstruction).not.toHaveBeenCalled()
    })

    test('should cap the paymaster fee with the transactionMaxFee override', async () => {
      const gaslessAccount = new WalletAccountSolanaGasless(SEED_PHRASE, "0'/0'", createGaslessConfig())
      const gaslessProtocol = new Usdt0ProtocolSolana(gaslessAccount)

      await expect(gaslessProtocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }, { transactionMaxFee: 249_999n }))
        .rejects.toThrow('Exceeded maximum fee cost for transaction operation.')
      expect(kora.signAndSendTransaction).not.toHaveBeenCalled()
    })

    test('should recognise a gasless account from another copy of the gasless package by its paymaster address', async () => {
      account._config = { paymasterAddress: PAYMASTER }

      await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 })

      expect(simulatedFeePayer(rpc)).toBe(PAYMASTER)

      const [tx] = account.sendTransaction.mock.calls[0]
      expect(signerOf(oftSend(tx).instruction, AccountRole.WRITABLE_SIGNER)).toEqual([PAYMASTER])
      expect(account.quoteSendTransaction).not.toHaveBeenCalled()
    })

    test('should quote from a read-only gasless account with the paymaster as the payer', async () => {
      const readOnlyAccount = new WalletAccountReadOnlySolanaGasless(SOLANA_ADDRESS, createGaslessConfig())
      const gaslessProtocol = new Usdt0ProtocolSolana(readOnlyAccount)

      expect(await gaslessProtocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }, { paymasterToken: { address: USDC_MINT } }))
        .toEqual({ fee: 250_000n, bridgeFee: NATIVE_FEE })
      expect(simulatedFeePayer(rpc)).toBe(PAYMASTER)

      const [{ transaction, fee_token: feeToken }] = kora.getPaymentInstruction.mock.calls[0]
      expect(feeToken).toBe(USDC_MINT)
      expect(decodeWireTransaction(transaction).feePayer).toBe(PAYMASTER)
    })
  })

  describe('quoteBridge', () => {
    test('should successfully quote a bridge operation', async () => {
      const result = await protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 })

      expect(result).toEqual({ fee: 5_000n, bridgeFee: NATIVE_FEE })
      expect(simulatedFeePayer(rpc)).toBe(SOLANA_ADDRESS)
    })

    test('should throw if the account is not connected to a provider', async () => {
      delete account._rpc

      await expect(protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }))
        .rejects.toStrictEqual(new ProviderRequiredError('The wallet must be connected to a provider in order to quote bridge operations.'))
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
