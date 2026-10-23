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

import { BridgeProtocol } from '@tetherto/wdk-wallet/protocols'
import { validateEVMAddress, validateTonAddress, validateTronAddress } from '@tetherto/wdk-utils'

import { Options, addressToBytes32 } from '@layerzerolabs/lz-v2-utilities'

import { ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS, getAddressLookupTableDecoder } from '@solana-program/address-lookup-table'
import { MAX_COMPUTE_UNIT_LIMIT, getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget'
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system'
import { TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from '@solana-program/token'
import { decodeAccount, fetchEncodedAccounts } from '@solana/accounts'
import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses'
import {
  Endian,
  getBase58Encoder,
  getBase64Encoder,
  getBytesEncoder,
  getU32Encoder,
  padLeftEncoder
} from '@solana/codecs'
import { AccountRole } from '@solana/instructions'
import {
  appendTransactionMessageInstructions,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  setTransactionMessageFeePayer
} from '@solana/transaction-messages'
import { compileTransaction, getBase64EncodedWireTransaction } from '@solana/transactions'
import { Address } from '@ton/core'

import { SOURCE_CHAIN, SOLANA_OFT_DEPLOYMENTS, BLOCKCHAINS, TOKENS, LAYERZERO_ULN_PROGRAM } from './config.js'
import {
  dvnConfigDecoder,
  executorConfigDecoder,
  getCreditsAddress,
  getPeerAddress,
  parseOftStore,
  parsePeerConfig,
  messagingFeeDecoder,
  quoteSendEncoder,
  sendEncoder,
  sendLibraryConfigDecoder,
  ulnSendConfigDecoder,
  ulnSettingsDecoder
} from './layerzero.js'

/** @typedef {import('@tetherto/wdk-wallet/protocols').BridgeProtocolConfig} BridgeProtocolConfig */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BridgeResult} BridgeResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeSupportedChain} SwidgeSupportedChain */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeSupportedToken} SwidgeSupportedToken */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwidgeSupportedTokensOptions} SwidgeSupportedTokensOptions */

/**
 * The paymaster options a gasless wallet account accepts as overrides.
 *
 * Mirrors `SolanaGaslessWalletPaymasterConfigOverrides` from `@tetherto/wdk-wallet-solana-gasless`; declared locally so the
 * gasless wallet is not a runtime dependency.
 *
 * @typedef {Object} SolanaGaslessWalletPaymasterConfigOverrides
 * @property {{ address: string }} [paymasterToken] - The paymaster token configuration.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 * @property {number | bigint} [transactionMaxFee] - The maximum fee amount for sendTransaction and signTransaction operations.
 */

/** @typedef {import('@solana/addresses').Address} SolanaAddress */
/** @typedef {import('@solana/codecs').ReadonlyUint8Array} ReadonlyUint8Array */

const SEND_COMPUTE_UNIT_LIMIT = 400_000

const U64_MAX = 0xffffffffffffffffn

/**
 * @typedef {object} BridgeOptions
 * @property {string} targetChain - The identifier of the destination blockchain (e.g., "arbitrum").
 * @property {string} recipient - The address of the recipient.
 * @property {string} token - The spl mint address of the token to bridge.
 * @property {number | bigint} amount - The amount of tokens to bridge to the destination chain (in base unit).
 * @property {number} [dstEid] - Custom LayerZero destination endpoint ID to override the default for the target chain.
 */

/**
 * @typedef {object} OftSendParam
 * @property {number} dstEid - The LayerZero destination endpoint id.
 * @property {ReadonlyUint8Array} to - The recipient address, encoded as 32 bytes.
 * @property {bigint} amountLD - The amount to send, in local decimals.
 * @property {bigint} minAmountLD - The minimum amount to receive, in local decimals.
 * @property {Uint8Array} extraOptions - The LayerZero executor options.
 * @property {Uint8Array} composeMsg - The compose message.
 * @property {Uint8Array} oftCmd - The oft command.
 */

/**
 * The oft accounts a quote or a send to a destination reads.
 *
 * @typedef {Object} OftRoute
 * @property {SolanaAddress} programAddress - The oft program.
 * @property {SolanaAddress} oftStore - The oft store.
 * @property {SolanaAddress} peer - The destination's peer config.
 * @property {SolanaAddress} credits - The credits account.
 * @property {import('./layerzero.js').OftStore} store - The parsed oft store.
 * @property {import('./layerzero.js').PeerConfig} peerConfig - The parsed peer config.
 * @property {Record<SolanaAddress, SolanaAddress[]>} lookupTables - The store's address lookup table, by address.
 */

export default class Usdt0ProtocolSolana extends BridgeProtocol {
  /**
   * Bridges a token from solana to a different blockchain.
   *
   * Gasless accounts pay through their kora paymaster, which also fronts the layerzero fee and charges it back in the paymaster token.
   *
   * @param {BridgeOptions} options - The bridge's options. Optionally pass 'dstEid' to override the destination endpoint id.
   * @param {SolanaGaslessWalletPaymasterConfigOverrides & Pick<BridgeProtocolConfig, 'bridgeMaxFee'>} [config] - If the protocol has been
   *   initialized with a gasless wallet account, it can be used to override its paymaster options; 'bridgeMaxFee' overrides the protocol's.
   *   A gasless account ignores 'bridgeMaxFee': its 'transactionMaxFee' caps the paymaster fee, which includes the layerzero fee.
   * @returns {Promise<BridgeResult>} The bridge's result.
   */
  async bridge (options, config) {
    if (typeof this._account.sendTransaction !== 'function') {
      throw new Error("The 'bridge(options)' method requires the protocol to be initialized with a non read-only account.")
    }

    if (!this._account._rpc) {
      throw new Error('The wallet must be connected to a provider in order to perform bridge operations.')
    }

    const { bridgeMaxFee = this._config.bridgeMaxFee, ...accountConfig } = config ?? {}

    const { tx, bridgeFee } = await this._getBridgeTransaction(options)

    if (this._account._config?.paymasterAddress) {
      const { hash, fee } = await this._account.sendTransaction(tx, accountConfig)

      return { hash, fee, bridgeFee }
    }

    const { fee } = await this._account.quoteSendTransaction(tx)

    if (bridgeMaxFee !== undefined && fee + bridgeFee > bridgeMaxFee) {
      throw new Error('Exceeded maximum fee cost for bridge operation.')
    }

    const { hash } = await this._account.sendTransaction(tx)

    return { hash, fee, bridgeFee }
  }

  /**
   * Quotes the costs of a bridge operation.
   *
   * @param {BridgeOptions} options - The bridge's options. Optionally pass 'dstEid' to override the destination endpoint id.
   * @param {SolanaGaslessWalletPaymasterConfigOverrides} [config] - If the protocol has been initialized with a gasless wallet account,
   *   it can be used to override its paymaster options.
   * @returns {Promise<Omit<BridgeResult, 'hash'>>} The bridge's quotes.
   */
  async quoteBridge (options, config) {
    if (!this._account._rpc) {
      throw new Error('The wallet must be connected to a provider in order to quote bridge operations.')
    }

    const { tx, bridgeFee } = await this._getBridgeTransaction(options)

    const { fee } = await this._account.quoteSendTransaction(tx, config)

    return { fee, bridgeFee }
  }

  /**
   * Retrieves the chains supported by the protocol for bridge operations.
   *
   * Derived from the static config, in the canonical WDK swidge shape.
   *
   * @returns {Promise<SwidgeSupportedChain[]>} The supported chains.
   */
  async getSupportedChains () {
    return Object.entries(BLOCKCHAINS).map(([id, { name, type, nativeToken }]) => ({
      id,
      name,
      type,
      nativeToken
    }))
  }

  /**
   * Retrieves the tokens supported by the protocol for bridge operations.
   *
   * Derived from the static config: the tokens with an oft deployment on solana.
   *
   * @param {SwidgeSupportedTokensOptions} [options] - Optional filters for chain- or token-scoped discovery.
   * @returns {Promise<SwidgeSupportedToken[]>} The supported tokens.
   */
  async getSupportedTokens (options) {
    const { fromChain, toChain, fromToken } = options ?? {}

    const scope = fromChain ?? toChain
    const chainKey = scope !== undefined ? this._resolveChainKey(scope) : SOURCE_CHAIN

    if (!chainKey) {
      return []
    }

    const tokenFilter = fromToken ? String(fromToken).toLowerCase() : undefined

    /** @type {SwidgeSupportedToken[]} */
    const tokens = []

    for (const [symbol, deployment] of Object.entries(SOLANA_OFT_DEPLOYMENTS)) {
      const tokenConfig = TOKENS[symbol]

      if (tokenFilter && tokenConfig.symbol.toLowerCase() !== tokenFilter) {
        continue
      }

      /** @type {SwidgeSupportedToken} */
      const token = {
        token: tokenConfig.symbol,
        chain: chainKey,
        symbol: tokenConfig.symbol,
        decimals: tokenConfig.decimals,
        name: tokenConfig.name
      }

      if (chainKey === SOURCE_CHAIN && deployment.mint) {
        token.address = deployment.mint
      }

      tokens.push(token)
    }

    return tokens
  }

  /** @private */
  _resolveChainKey (chain) {
    const asString = String(chain).toLowerCase()

    if (Object.prototype.hasOwnProperty.call(BLOCKCHAINS, asString)) {
      return asString
    }

    for (const [key, entry] of Object.entries(BLOCKCHAINS)) {
      if (String(entry.chainId) === asString || String(entry.eid) === asString) {
        return key
      }
    }

    return undefined
  }

  /** @private */
  async _getBridgeTransaction ({ targetChain, recipient, token, amount: rawAmount, dstEid }) {
    if (!BLOCKCHAINS[targetChain]) {
      throw new Error(`Target chain '${targetChain}' not supported.`)
    }

    if (targetChain === SOURCE_CHAIN) {
      throw new Error('The target chain cannot be equal to the source chain.')
    }

    const deployment = Object.values(SOLANA_OFT_DEPLOYMENTS).find(({ mint }) => mint === token)

    if (!deployment) {
      throw new Error(`Token '${token}' not supported on this chain.`)
    }

    // Numbers above 2^53 cannot hold an exact base-unit amount.
    if (!(typeof rawAmount === 'bigint' || Number.isSafeInteger(rawAmount)) || rawAmount <= 0 || BigInt(rawAmount) > U64_MAX) {
      throw new Error('The bridge amount must be a positive integer in base units that fits in 64 bits.')
    }

    const amount = BigInt(rawAmount)

    const to = this._encodeRecipient(targetChain, recipient)

    if (to.every((byte) => byte === 0)) {
      throw new Error(`Invalid recipient address for target chain '${targetChain}': ZERO_ADDRESS.`)
    }

    const eid = dstEid ?? BLOCKCHAINS[targetChain].eid

    const route = await this._getOftRoute(deployment, eid)

    // Mirrors the program's debit_view: it takes fee_bps out of the amount, rounded down, and the rest must arrive.
    const oftFee = amount * BigInt(route.store.feeBps) / 10_000n

    /** @type {OftSendParam} */
    const sendParam = {
      dstEid: eid,
      to,
      amountLD: amount,
      minAmountLD: amount - oftFee,
      extraOptions: Options.newOptions().toBytes(),
      composeMsg: new Uint8Array(),
      oftCmd: new Uint8Array()
    }

    const sender = address(await this._account.getAddress())

    // A gasless account's kora paymaster pays the transaction and fronts the layerzero fee as its fee payer. Matched by shape, not
    // instanceof, so accounts from another copy of wdk-wallet-solana-gasless are recognised too.
    // TODO: read a public paymasterAddress getter here and in 'bridge' once wdk-wallet-solana-gasless exposes one.
    const payer = this._account._config?.paymasterAddress ? address(this._account._config.paymasterAddress) : sender

    const { nativeFee: bridgeFee } = await this._quoteOftSend(route, sendParam, payer)

    const instructions = await this._buildOftSendInstructions(route, sendParam, bridgeFee, sender, payer)

    const tx = appendTransactionMessageInstructions(instructions, createTransactionMessage({ version: 0 }))

    return { tx, bridgeFee }
  }

  /** @private */
  async _quoteOftSend (route, sendParam, payer) {
    // @see https://github.com/LayerZero-Labs/usdt-native-mesh/blob/main/programs/oft/src/instructions/quote_send.rs

    if (sendParam.to.length !== 32 || sendParam.oftCmd.length !== 0) {
      throw new Error('Invalid OFT recipient or unsupported OFT command.')
    }

    const { programAddress, oftStore, peer, credits, store, peerConfig, lookupTables } = route

    const remainingAccounts = await this._getEndpointAccounts(store.endpointProgram, oftStore, sendParam.dstEid, peerConfig.peerAddress)

    const instruction = {
      programAddress,
      accounts: [oftStore, credits, peer].map((account) => ({ address: account, role: AccountRole.READONLY })).concat(remainingAccounts),
      data: quoteSendEncoder.encode({ ...sendParam, payInLzToken: false })
    }

    // No lifetime is set: the message compiles with an empty blockhash, which the rpc replaces during the simulation.
    const message = compressTransactionMessageUsingAddressLookupTables(
      appendTransactionMessageInstructions(
        [getSetComputeUnitLimitInstruction({ units: MAX_COMPUTE_UNIT_LIMIT }), instruction],
        setTransactionMessageFeePayer(payer, createTransactionMessage({ version: 0 }))
      ),
      lookupTables
    )

    const { value } = await this._account._rpc.simulateTransaction(getBase64EncodedWireTransaction(compileTransaction(message)), {
      encoding: 'base64', commitment: this._account._commitment, sigVerify: false, replaceRecentBlockhash: true
    }).send()

    if (value.err === 'AccountNotFound') {
      throw new Error('Cannot quote from an unfunded account: fund it with SOL first.')
    }

    if (value.err) {
      const error = JSON.stringify(value.err, (_, value) => typeof value === 'bigint' ? value.toString() : value)
      throw new Error(`OFT quote simulation failed: ${error}. ${(value.logs ?? []).join('\n')}`)
    }

    const { programId, data: [fee, encoding] = [] } = value.returnData ?? {}

    const bytes = encoding === 'base64' ? getBase64Encoder().encode(fee) : new Uint8Array()

    if (programId !== programAddress || bytes.length !== messagingFeeDecoder.fixedSize) {
      throw new Error('Invalid OFT quote return data.')
    }

    return messagingFeeDecoder.decode(bytes)
  }

  /** @private */
  async _getOftRoute (deployment, dstEid) {
    const programAddress = address(deployment.programId)

    const oftStore = address(deployment.oftStore)

    const [peer, credits] = await Promise.all([getPeerAddress(programAddress, dstEid), getCreditsAddress(programAddress)])

    const [storeAccount, peerAccount] = await fetchEncodedAccounts(this._account._rpc, [oftStore, peer], { commitment: this._account._commitment })

    const store = parseOftStore(storeAccount, programAddress)

    if (!store || store.tokenMint !== deployment.mint) {
      throw new Error('Invalid OFT store account.')
    }

    const peerConfig = parsePeerConfig(peerAccount, programAddress)

    if (!peerConfig) {
      throw new Error(`OFT peer not configured for destination ${dstEid}.`)
    }

    /** @type {OftRoute['lookupTables']} */
    const lookupTables = {}

    if (store.alt) {
      const [table] = await fetchEncodedAccounts(this._account._rpc, [store.alt], { commitment: this._account._commitment })

      if (!table.exists || table.programAddress !== ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS) {
        throw new Error('Invalid OFT address lookup table account.')
      }

      lookupTables[store.alt] = decodeAccount(table, getAddressLookupTableDecoder()).data.addresses
    }

    return { programAddress, oftStore, peer, credits, store, peerConfig, lookupTables }
  }

  /** @private */
  async _getEndpointAccounts (endpoint, sender, dstEid, receiver, payer) {
    // Port of SendHelper.getQuoteAccounts and SendHelper.getSendAccounts from @layerzerolabs/lz-solana-sdk-v2,
    // restricted to the ULN message library: quote accounts without a payer, send accounts with one.

    const eid = getU32Encoder({ endian: Endian.Big }).encode(dstEid)

    const senderSeed = getAddressEncoder().encode(sender)

    const [[sendLibraryConfig], [defaultSendLibraryConfig], [uln], [sendConfig], [defaultSendConfig]] = await Promise.all([
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['SendLibraryConfig', senderSeed, eid] }),
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['SendLibraryConfig', eid] }),
      getProgramDerivedAddress({ programAddress: LAYERZERO_ULN_PROGRAM, seeds: ['MessageLib'] }),
      getProgramDerivedAddress({ programAddress: LAYERZERO_ULN_PROGRAM, seeds: ['SendConfig', eid, senderSeed] }),
      getProgramDerivedAddress({ programAddress: LAYERZERO_ULN_PROGRAM, seeds: ['SendConfig', eid] })
    ])

    const [sendLibraryConfigAccount, defaultSendLibraryConfigAccount, sendConfigAccount, defaultSendConfigAccount, ulnAccount] =
      await fetchEncodedAccounts(this._account._rpc, [sendLibraryConfig, defaultSendLibraryConfig, sendConfig, defaultSendConfig, uln], { commitment: this._account._commitment })

    // The decoders check each account's anchor discriminator, and decodeAccount names the account that fails; owners are checked here.
    if (!sendLibraryConfigAccount.exists || !defaultSendLibraryConfigAccount.exists ||
        sendLibraryConfigAccount.programAddress !== endpoint || defaultSendLibraryConfigAccount.programAddress !== endpoint) {
      throw new Error('LayerZero send library not initialized.')
    }

    let { messageLib } = decodeAccount(sendLibraryConfigAccount, sendLibraryConfigDecoder).data

    // LayerZero marks unset addresses with the all-zero key (PublicKey.default), which is the system program address.
    if (messageLib === SYSTEM_PROGRAM_ADDRESS) {
      messageLib = decodeAccount(defaultSendLibraryConfigAccount, sendLibraryConfigDecoder).data.messageLib
    }

    if (messageLib !== uln) {
      throw new Error('Unsupported LayerZero message library.')
    }

    if (!defaultSendConfigAccount.exists || !ulnAccount.exists ||
        [defaultSendConfigAccount, ulnAccount, ...(sendConfigAccount.exists ? [sendConfigAccount] : [])].some((account) => account.programAddress !== LAYERZERO_ULN_PROGRAM)) {
      throw new Error('LayerZero ULN send config not initialized.')
    }

    // An oapp send config overrides the default executor when set, and the default dvn sets when non-empty.
    const defaults = decodeAccount(defaultSendConfigAccount, ulnSendConfigDecoder).data

    const custom = sendConfigAccount.exists ? decodeAccount(sendConfigAccount, ulnSendConfigDecoder).data : null

    const executor = custom && custom.executor !== SYSTEM_PROGRAM_ADDRESS ? custom.executor : defaults.executor

    const [requiredDvns, optionalDvns] = ['requiredDvns', 'optionalDvns'].map((key) =>
      custom?.[key].length ? custom[key].filter((dvn) => dvn !== SYSTEM_PROGRAM_ADDRESS) : defaults[key]
    )

    const workers = [executor, ...requiredDvns, ...optionalDvns]

    const workerConfigs = (await fetchEncodedAccounts(this._account._rpc, workers, { commitment: this._account._commitment })).map((config, i) => {
      if (!config.exists) {
        throw new Error(`LayerZero worker ${workers[i]} not initialized.`)
      }

      const { priceFeed } = i === 0
        ? decodeAccount(config, executorConfigDecoder).data
        : decodeAccount(config, dvnConfigDecoder).data

      return { program: config.programAddress, priceFeed }
    })

    const priceFeedAccounts = await fetchEncodedAccounts(this._account._rpc, workerConfigs.map(({ priceFeed }) => priceFeed), { commitment: this._account._commitment })

    const [[sendLibraryInfo], [endpointSettings], [nonce], [endpointEventAuthority], [ulnEventAuthority]] = await Promise.all([
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['MessageLib', getAddressEncoder().encode(uln)] }),
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['Endpoint'] }),
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['Nonce', senderSeed, eid, receiver] }),
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['__event_authority'] }),
      getProgramDerivedAddress({ programAddress: LAYERZERO_ULN_PROGRAM, seeds: ['__event_authority'] })
    ])

    // Each worker contributes its program, its config (written to when charged on a send), and its price feed's program and config.
    /** @type {Array<[SolanaAddress, AccountRole?]>} */
    const workerAccounts = workers.flatMap((worker, i) => {
      const priceFeed = priceFeedAccounts[i]

      if (!priceFeed.exists) {
        throw new Error(`LayerZero price feed ${priceFeed.address} not initialized.`)
      }

      return [[workerConfigs[i].program], [worker, payer ? AccountRole.WRITABLE : AccountRole.READONLY], [priceFeed.programAddress], [priceFeed.address]]
    })

    // The ULN pays its protocol fee to the treasury when one is set, and otherwise takes its own program as a placeholder.
    const treasury = payer && decodeAccount(ulnAccount, ulnSettingsDecoder).data.treasury?.nativeReceiver

    /** @type {Array<[SolanaAddress, AccountRole?]>} */
    const accounts = payer
      ? [
          [endpoint],
          [sender],
          [LAYERZERO_ULN_PROGRAM],
          [sendLibraryConfig],
          [defaultSendLibraryConfig],
          [sendLibraryInfo],
          [endpointSettings],
          [nonce, AccountRole.WRITABLE],
          [endpointEventAuthority],
          [endpoint],
          [uln],
          [sendConfig],
          [defaultSendConfig],
          [payer, AccountRole.WRITABLE_SIGNER],
          treasury ? [treasury, AccountRole.WRITABLE] : [LAYERZERO_ULN_PROGRAM],
          [SYSTEM_PROGRAM_ADDRESS],
          [ulnEventAuthority],
          [LAYERZERO_ULN_PROGRAM],
          ...workerAccounts
        ]
      : [
          [endpoint],
          [LAYERZERO_ULN_PROGRAM],
          [sendLibraryConfig],
          [defaultSendLibraryConfig],
          [sendLibraryInfo],
          [endpointSettings],
          [nonce],
          [uln],
          [sendConfig],
          [defaultSendConfig],
          ...workerAccounts
        ]

    return accounts.map(([account, role = AccountRole.READONLY]) => ({ address: account, role }))
  }

  /** @private */
  async _buildOftSendInstructions (route, sendParam, nativeFee, sender, payer) {
    // @see https://github.com/LayerZero-Labs/usdt-native-mesh/blob/main/programs/oft/src/instructions/send.rs

    const { programAddress, oftStore, peer, credits, store, peerConfig, lookupTables } = route

    const [[tokenSource], [eventAuthority], remainingAccounts] = await Promise.all([
      findAssociatedTokenPda({ mint: store.tokenMint, owner: sender, tokenProgram: TOKEN_PROGRAM_ADDRESS }),
      getProgramDerivedAddress({ programAddress, seeds: ['__event_authority'] }),
      this._getEndpointAccounts(store.endpointProgram, oftStore, sendParam.dstEid, peerConfig.peerAddress, payer)
    ])

    /** @type {Array<[SolanaAddress, AccountRole?]>} */
    const accounts = [
      [sender, AccountRole.READONLY_SIGNER],
      [peer],
      [oftStore, AccountRole.WRITABLE],
      [credits, AccountRole.WRITABLE],
      [tokenSource, AccountRole.WRITABLE],
      [store.tokenEscrow, AccountRole.WRITABLE],
      [store.tokenMint],
      [TOKEN_PROGRAM_ADDRESS],
      [eventAuthority],
      [programAddress]
    ]

    const instruction = {
      programAddress,
      accounts: accounts.map(([account, role = AccountRole.READONLY]) => ({ address: account, role })).concat(remainingAccounts),
      data: sendEncoder.encode({ ...sendParam, nativeFee, lzTokenFee: 0n })
    }

    // A send references more accounts than fit in a transaction, so the non-signers are loaded through the store's lookup table.
    return compressTransactionMessageUsingAddressLookupTables(
      appendTransactionMessageInstructions(
        [getSetComputeUnitLimitInstruction({ units: SEND_COMPUTE_UNIT_LIMIT }), instruction],
        createTransactionMessage({ version: 0 })
      ),
      lookupTables
    ).instructions
  }

  /** @private */
  _encodeRecipient (targetChain, recipient) {
    const { type } = BLOCKCHAINS[targetChain]

    if (type === 'ton') {
      this._assertValidRecipient(validateTonAddress(recipient), targetChain)

      const address = Address.parse(recipient)

      if (address.workChain !== 0) {
        throw new Error(`Invalid recipient address for target chain '${targetChain}': UNSUPPORTED_WORKCHAIN.`)
      }

      return new Uint8Array(address.hash)
    }

    if (type === 'tvm') {
      this._assertValidRecipient(validateTronAddress(recipient), targetChain)

      // Base58check payload: 0x41 prefix, 20-byte address, 4-byte checksum.
      const bytes = getBase58Encoder().encode(recipient).slice(0, 21)

      if (bytes.slice(1).every((byte) => byte === 0)) {
        throw new Error(`Invalid recipient address for target chain '${targetChain}': ZERO_ADDRESS.`)
      }

      return padLeftEncoder(getBytesEncoder(), 32 - bytes.length).encode(bytes)
    }

    if (type === 'evm') {
      this._assertValidRecipient(validateEVMAddress(recipient), targetChain)

      return addressToBytes32(recipient)
    }

    throw new Error(`Target chain '${targetChain}' not supported.`)
  }

  /** @private */
  _assertValidRecipient (result, targetChain) {
    if (!result.success) {
      throw new Error(`Invalid recipient address for target chain '${targetChain}': ${result.reason}.`)
    }
  }
}
