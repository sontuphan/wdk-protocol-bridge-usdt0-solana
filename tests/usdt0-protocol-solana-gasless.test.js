import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

import { findAssociatedTokenPda, getTransferInstruction, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { address } from '@solana/addresses'

import { MaximumFeeExceededError } from '@tetherto/wdk-wallet/protocols'
import { WalletAccountReadOnlySolanaGasless, WalletAccountSolanaGasless } from '@tetherto/wdk-wallet-solana-gasless'

import Usdt0ProtocolSolana from '../index.js'

import { DEPLOYMENT, NATIVE_FEE, createRpc, decodeOftSend, decodeTransaction, simulatedFeePayer } from './fixture-rpc.js'

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const MINT = DEPLOYMENT.mint

const EVM_ADDRESS = '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd'

const PAYMASTER = 'LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY'

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const PAYMASTER_FEE = 250_000n

const createKora = (fee) => ({
  getPaymentInstruction: jest.fn(async ({ fee_token: feeToken, source_wallet: sourceWallet }) => {
    const [source] = await findAssociatedTokenPda({ mint: address(feeToken), owner: address(sourceWallet), tokenProgram: TOKEN_PROGRAM_ADDRESS })
    const [destination] = await findAssociatedTokenPda({ mint: address(feeToken), owner: address(PAYMASTER), tokenProgram: TOKEN_PROGRAM_ADDRESS })
    return { payment_instruction: getTransferInstruction({ source, destination, authority: address(sourceWallet), amount: fee }) }
  }),
  signAndSendTransaction: jest.fn().mockResolvedValue({ signature: 'gasless-signature' })
})

describe('Usdt0ProtocolSolana with a solana gasless wallet account', () => {
  let rpc, kora, account, sender

  const createConfig = () => ({ provider: rpc, paymasterUrl: kora, paymasterAddress: PAYMASTER, paymasterToken: { address: MINT } })

  beforeEach(async () => {
    rpc = createRpc()

    kora = createKora(PAYMASTER_FEE)

    account = new WalletAccountSolanaGasless(SEED_PHRASE, "0'/0'", createConfig())

    sender = await account.getAddress()
  })

  afterEach(() => {
    account.dispose()
  })

  describe('bridge', () => {
    test('should bridge through the kora paymaster, which pays the layerzero fee, with the paymaster overrides', async () => {
      const protocol = new Usdt0ProtocolSolana(account, { bridgeMaxFee: 1n })

      const result = await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 1_000_000 },
        { paymasterToken: { address: USDC_MINT }, transactionMaxFee: PAYMASTER_FEE, bridgeMaxFee: NATIVE_FEE })

      expect(result).toEqual({ hash: 'gasless-signature', fee: PAYMASTER_FEE, bridgeFee: NATIVE_FEE })
      expect(simulatedFeePayer(rpc)).toBe(PAYMASTER)

      expect(kora.getPaymentInstruction).toHaveBeenCalledTimes(1)
      expect(kora.getPaymentInstruction.mock.calls[0][0]).toMatchObject({ fee_token: USDC_MINT, source_wallet: sender, signer_key: PAYMASTER })

      const [{ transaction, signer_key: signerKey }] = kora.signAndSendTransaction.mock.calls[0]
      expect(signerKey).toBe(PAYMASTER)

      const { feePayer, programs, oftData, signatures } = decodeTransaction(transaction)
      expect(feePayer).toBe(PAYMASTER)
      expect(programs.slice(-2)).toEqual([DEPLOYMENT.programId, TOKEN_PROGRAM_ADDRESS])
      expect(signatures[PAYMASTER]).toBeNull()
      expect(signatures[sender]).toHaveLength(64)
      expect(decodeOftSend(oftData)).toMatchObject({ dstEid: 30_110, amountLD: 1_000_000n, minAmountLD: 999_700n, nativeFee: NATIVE_FEE })
      expect(rpc.sendTransaction).not.toHaveBeenCalled()
    })

    test('should cap the bridge fee alone with bridgeMaxFee before contacting the paymaster', async () => {
      const protocol = new Usdt0ProtocolSolana(account)

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }, { bridgeMaxFee: NATIVE_FEE - 1n }))
        .rejects.toStrictEqual(new MaximumFeeExceededError('Exceeded maximum fee cost for bridge operation.'))
      expect(kora.getPaymentInstruction).not.toHaveBeenCalled()
    })

    test('should cap the paymaster fee with the transactionMaxFee override', async () => {
      const protocol = new Usdt0ProtocolSolana(account)

      await expect(protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }, { transactionMaxFee: PAYMASTER_FEE - 1n }))
        .rejects.toThrow('Exceeded maximum fee cost for transaction operation.')
      expect(kora.signAndSendTransaction).not.toHaveBeenCalled()
    })

    test('should recognise a gasless account from another copy of the gasless package by its paymaster address', async () => {
      const foreignAccount = {
        _rpc: rpc,
        _config: { paymasterAddress: PAYMASTER },
        getAddress: async () => sender,
        quoteSendTransaction: jest.fn(),
        sendTransaction: jest.fn().mockResolvedValue({ hash: 'gasless-signature', fee: PAYMASTER_FEE })
      }
      const protocol = new Usdt0ProtocolSolana(foreignAccount)

      await protocol.bridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 })

      expect(simulatedFeePayer(rpc)).toBe(PAYMASTER)
      expect(foreignAccount.quoteSendTransaction).not.toHaveBeenCalled()
      expect(foreignAccount.sendTransaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('quoteBridge', () => {
    test('should quote from a read-only gasless account with the paymaster as the payer', async () => {
      const protocol = new Usdt0ProtocolSolana(new WalletAccountReadOnlySolanaGasless(sender, createConfig()))

      expect(await protocol.quoteBridge({ targetChain: 'arbitrum', recipient: EVM_ADDRESS, token: MINT, amount: 100 }, { paymasterToken: { address: USDC_MINT } }))
        .toEqual({ fee: PAYMASTER_FEE, bridgeFee: NATIVE_FEE })
      expect(simulatedFeePayer(rpc)).toBe(PAYMASTER)

      const [{ transaction, fee_token: feeToken }] = kora.getPaymentInstruction.mock.calls[0]
      expect(feeToken).toBe(USDC_MINT)
      expect(decodeTransaction(transaction).feePayer).toBe(PAYMASTER)
    })
  })
})
