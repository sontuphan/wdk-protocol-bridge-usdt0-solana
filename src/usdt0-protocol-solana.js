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

import {
  AccountRequiredError,
  BridgeProtocol,
  MaximumFeeExceededError,
  ProviderRequiredError,
  ValueError
} from '@tetherto/wdk-wallet/protocols'
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
 * @typedef {Object} PaymasterConfigOverrides
 * @property {{ address: string }} [paymasterToken] - The paymaster token configuration.
 * @property {number | bigint} [transactionMaxFee] - The maximum fee amount for sendTransaction and signTransaction
 *   operations.
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
 * @property {EndpointRoute} endpoint - The layerzero accounts a quote or a send to the destination reads.
 */

/**
 * A worker a send pays, with its price feed.
 *
 * @typedef {Object} EndpointWorker
 * @property {SolanaAddress} program - The worker's program.
 * @property {SolanaAddress} config - The worker's config.
 * @property {SolanaAddress} priceFeedProgram - The price feed's program.
 * @property {SolanaAddress} priceFeed - The price feed's config.
 */

/**
 * The layerzero endpoint and ULN accounts a quote or a send to a destination reads.
 *
 * @typedef {Object} EndpointRoute
 * @property {SolanaAddress} endpoint - The endpoint program.
 * @property {SolanaAddress} sender - The oapp sending the message.
 * @property {SolanaAddress} uln - The ULN message library.
 * @property {SolanaAddress} sendLibraryConfig - The oapp's send library config.
 * @property {SolanaAddress} defaultSendLibraryConfig - The default send library config.
 * @property {SolanaAddress} sendLibraryInfo - The ULN's message library info.
 * @property {SolanaAddress} endpointSettings - The endpoint settings.
 * @property {SolanaAddress} nonce - The oapp's nonce for the destination.
 * @property {SolanaAddress} endpointEventAuthority - The endpoint's event authority.
 * @property {SolanaAddress} sendConfig - The oapp's ULN send config.
 * @property {SolanaAddress} defaultSendConfig - The default ULN send config.
 * @property {SolanaAddress} ulnEventAuthority - The ULN's event authority.
 * @property {SolanaAddress | null} treasury - The ULN's treasury, if one is set.
 * @property {EndpointWorker[]} workers - The executor, then the dvns.
 */

export default class Usdt0ProtocolSolana extends BridgeProtocol {
  /**
   * Bridges a token from solana to a different blockchain.
   *
   * Gasless accounts pay through their paymaster, which also fronts the layerzero fee and charges it back in the
   * paymaster token.
   *
   * @param {BridgeOptions} options - The bridge's options.
   * @param {PaymasterConfigOverrides & Pick<BridgeProtocolConfig, 'bridgeMaxFee'>} [config] - If the protocol has
   *   been initialized with a gasless wallet account, it can be used to override its paymaster options;
   *   'bridgeMaxFee' overrides the protocol's. 'bridgeMaxFee' caps 'fee' plus 'bridgeFee', in lamports; for a
   *   gasless account it caps 'bridgeFee' alone, and 'transactionMaxFee' caps 'fee', the paymaster fee in the
   *   paymaster token, which includes the layerzero fee.
   * @returns {Promise<BridgeResult>} The bridge's result.
   * @throws {AccountRequiredError} If the protocol has been initialized with a read-only account.
   * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
   * @throws {ValueError} If the target chain, token, amount or recipient is not valid.
   * @throws {MaximumFeeExceededError} If the bridge's costs exceed 'bridgeMaxFee', or a gasless account's
   *   paymaster fee exceeds 'transactionMaxFee'.
   */
  async bridge (options, config) {
    if (typeof this._account.sendTransaction !== 'function') {
      throw new AccountRequiredError("The 'bridge(options)' method requires the protocol to be initialized with a non read-only account.")
    }

    if (!this._account._rpc) {
      throw new ProviderRequiredError('The wallet must be connected to a provider in order to perform bridge operations.')
    }

    const { bridgeMaxFee = this._config.bridgeMaxFee, ...accountConfig } = config ?? {}

    const { tx, bridgeFee } = await this._getBridgeTransaction(options)

    if (this._getPaymasterAddress()) {
      if (bridgeMaxFee !== undefined && bridgeFee > bridgeMaxFee) {
        throw new MaximumFeeExceededError('Exceeded maximum fee cost for bridge operation.')
      }

      const { hash, fee } = await this._account.sendTransaction(tx, accountConfig)

      return { hash, fee, bridgeFee }
    }

    const { fee } = await this._account.quoteSendTransaction(tx)

    if (bridgeMaxFee !== undefined && fee + bridgeFee > bridgeMaxFee) {
      throw new MaximumFeeExceededError('Exceeded maximum fee cost for bridge operation.')
    }

    const { hash } = await this._account.sendTransaction(tx)

    return { hash, fee, bridgeFee }
  }

  /**
   * Quotes the costs of a bridge operation.
   *
   * @param {BridgeOptions} options - The bridge's options.
   * @param {Pick<PaymasterConfigOverrides, 'paymasterToken'>} [config] - If the protocol has been
   *   initialized with a gasless wallet account, it can be used to override its paymaster token.
   * @returns {Promise<Omit<BridgeResult, 'hash'>>} The bridge's quotes.
   * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
   * @throws {ValueError} If the target chain, token, amount or recipient is not valid.
   */
  async quoteBridge (options, config) {
    if (!this._account._rpc) {
      throw new ProviderRequiredError('The wallet must be connected to a provider in order to quote bridge operations.')
    }

    const { tx, bridgeFee } = await this._getBridgeTransaction(options)

    const { fee } = await this._account.quoteSendTransaction(tx, config)

    return { fee, bridgeFee }
  }

  /**
   * Retrieves the chains supported by the protocol for bridge operations.
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
   * @param {SwidgeSupportedTokensOptions} [options] - Optional filters for chain- or token-scoped discovery.
   * @returns {Promise<SwidgeSupportedToken[]>} The supported tokens.
   */
  async getSupportedTokens (options) {
    const { fromChain, toChain, fromToken } = options ?? {}

    const toChainKey = toChain !== undefined ? this._resolveChainKey(toChain) : undefined

    if (fromChain !== undefined && this._resolveChainKey(fromChain) !== SOURCE_CHAIN) {
      return []
    }

    if (toChain !== undefined && (!toChainKey || toChainKey === SOURCE_CHAIN)) {
      return []
    }

    const chainKey = fromChain === undefined && toChainKey ? toChainKey : SOURCE_CHAIN

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

      if (chainKey === SOURCE_CHAIN) {
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
  _getPaymasterAddress () {
    const paymasterAddress = this._account._config?.paymasterAddress

    return paymasterAddress ? address(paymasterAddress) : undefined
  }

  /** @private */
  async _fetchAccounts (addresses) {
    return await fetchEncodedAccounts(this._account._rpc, addresses, { commitment: this._account._commitment })
  }

  /** @private */
  async _getBridgeTransaction ({ targetChain, recipient, token, amount: rawAmount }) {
    if (!Object.prototype.hasOwnProperty.call(BLOCKCHAINS, targetChain)) {
      throw new ValueError(`Target chain '${targetChain}' not supported.`)
    }

    if (targetChain === SOURCE_CHAIN) {
      throw new ValueError('The target chain cannot be equal to the source chain.')
    }

    const deployment = Object.values(SOLANA_OFT_DEPLOYMENTS).find(({ mint }) => mint === token)

    if (!deployment) {
      throw new ValueError(`Token '${token}' not supported on this chain.`)
    }

    if (!(typeof rawAmount === 'bigint' || Number.isSafeInteger(rawAmount)) || rawAmount <= 0 || BigInt(rawAmount) > U64_MAX) {
      throw new ValueError('The bridge amount must be a positive integer in base units that fits in 64 bits.')
    }

    const amount = BigInt(rawAmount)

    const to = this._encodeRecipient(targetChain, recipient)

    if (to.every((byte) => byte === 0)) {
      throw new ValueError(`Invalid recipient address for target chain '${targetChain}': ZERO_ADDRESS.`)
    }

    const eid = BLOCKCHAINS[targetChain].eid

    const route = await this._getOftRoute(eid, deployment)

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

    const payer = this._getPaymasterAddress() ?? sender

    const { nativeFee: bridgeFee } = await this._quoteOftSend(payer, route, sendParam)

    const instructions = await this._buildOftSendInstructions(bridgeFee, sender, payer, route, sendParam)

    const tx = appendTransactionMessageInstructions(instructions, createTransactionMessage({ version: 0 }))

    return { tx, bridgeFee }
  }

  /** @private */
  async _quoteOftSend (payer, route, sendParam) {
    const { programAddress, oftStore, peer, credits, lookupTables, endpoint } = route

    const remainingAccounts = this._getQuoteEndpointAccounts(endpoint)

    const instruction = {
      programAddress,
      accounts: [oftStore, credits, peer].map((account) => ({ address: account, role: AccountRole.READONLY })).concat(remainingAccounts),
      data: quoteSendEncoder.encode({ ...sendParam, payInLzToken: false })
    }

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
  async _getOftRoute (dstEid, deployment) {
    const programAddress = address(deployment.programId)

    const oftStore = address(deployment.oftStore)

    const [peer, credits] = await Promise.all([getPeerAddress(programAddress, dstEid), getCreditsAddress(programAddress)])

    const [storeAccount, peerAccount] = await this._fetchAccounts([oftStore, peer])

    const store = parseOftStore(programAddress, storeAccount)

    if (!store || store.tokenMint !== deployment.mint) {
      throw new Error('Invalid OFT store account.')
    }

    const peerConfig = parsePeerConfig(programAddress, peerAccount)

    if (!peerConfig) {
      throw new Error(`OFT peer not configured for destination ${dstEid}.`)
    }

    /** @type {OftRoute['lookupTables']} */
    const lookupTables = {}

    if (store.alt) {
      const [table] = await this._fetchAccounts([store.alt])

      if (!table.exists || table.programAddress !== ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS) {
        throw new Error('Invalid OFT address lookup table account.')
      }

      lookupTables[store.alt] = decodeAccount(table, getAddressLookupTableDecoder()).data.addresses
    }

    const endpoint = await this._getEndpointRoute(store.endpointProgram, oftStore, dstEid, peerConfig.peerAddress)

    return { programAddress, oftStore, peer, credits, store, peerConfig, lookupTables, endpoint }
  }

  /** @private */
  async _getEndpointRoute (endpoint, sender, dstEid, receiver) {
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
      await this._fetchAccounts([sendLibraryConfig, defaultSendLibraryConfig, sendConfig, defaultSendConfig, uln])

    if (!sendLibraryConfigAccount.exists || !defaultSendLibraryConfigAccount.exists) {
      throw new Error('LayerZero send library not initialized.')
    }

    if (sendLibraryConfigAccount.programAddress !== endpoint || defaultSendLibraryConfigAccount.programAddress !== endpoint) {
      throw new Error('LayerZero send library config owned by another program.')
    }

    let { messageLib } = decodeAccount(sendLibraryConfigAccount, sendLibraryConfigDecoder).data

    if (messageLib === SYSTEM_PROGRAM_ADDRESS) {
      messageLib = decodeAccount(defaultSendLibraryConfigAccount, sendLibraryConfigDecoder).data.messageLib
    }

    if (messageLib !== uln) {
      throw new Error('Unsupported LayerZero message library.')
    }

    if (!defaultSendConfigAccount.exists || !ulnAccount.exists) {
      throw new Error('LayerZero ULN send config not initialized.')
    }

    if ([defaultSendConfigAccount, ulnAccount, ...(sendConfigAccount.exists ? [sendConfigAccount] : [])].some((account) => account.programAddress !== LAYERZERO_ULN_PROGRAM)) {
      throw new Error('LayerZero ULN account owned by another program.')
    }

    const defaults = decodeAccount(defaultSendConfigAccount, ulnSendConfigDecoder).data

    const custom = sendConfigAccount.exists ? decodeAccount(sendConfigAccount, ulnSendConfigDecoder).data : null

    const executor = custom && custom.executor !== SYSTEM_PROGRAM_ADDRESS ? custom.executor : defaults.executor

    const [requiredDvns, optionalDvns] = ['requiredDvns', 'optionalDvns'].map((key) =>
      custom?.[key].length ? custom[key].filter((dvn) => dvn !== SYSTEM_PROGRAM_ADDRESS) : defaults[key]
    )

    const workers = [executor, ...requiredDvns, ...optionalDvns]

    const workerConfigs = (await this._fetchAccounts(workers)).map((config, i) => {
      if (!config.exists) {
        throw new Error(`LayerZero worker ${workers[i]} not initialized.`)
      }

      const { priceFeed } = i === 0
        ? decodeAccount(config, executorConfigDecoder).data
        : decodeAccount(config, dvnConfigDecoder).data

      return { program: config.programAddress, priceFeed }
    })

    const priceFeedAccounts = await this._fetchAccounts(workerConfigs.map(({ priceFeed }) => priceFeed))

    const [[sendLibraryInfo], [endpointSettings], [nonce], [endpointEventAuthority], [ulnEventAuthority]] = await Promise.all([
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['MessageLib', getAddressEncoder().encode(uln)] }),
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['Endpoint'] }),
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['Nonce', senderSeed, eid, receiver] }),
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['__event_authority'] }),
      getProgramDerivedAddress({ programAddress: LAYERZERO_ULN_PROGRAM, seeds: ['__event_authority'] })
    ])

    const workerRoutes = workers.map((worker, i) => {
      const priceFeed = priceFeedAccounts[i]

      if (!priceFeed.exists) {
        throw new Error(`LayerZero price feed ${priceFeed.address} not initialized.`)
      }

      return { program: workerConfigs[i].program, config: worker, priceFeedProgram: priceFeed.programAddress, priceFeed: priceFeed.address }
    })

    const treasury = decodeAccount(ulnAccount, ulnSettingsDecoder).data.treasury?.nativeReceiver ?? null

    return {
      endpoint,
      sender,
      uln,
      sendLibraryConfig,
      defaultSendLibraryConfig,
      sendLibraryInfo,
      endpointSettings,
      nonce,
      endpointEventAuthority,
      sendConfig,
      defaultSendConfig,
      ulnEventAuthority,
      treasury,
      workers: workerRoutes
    }
  }

  /** @private */
  _getQuoteEndpointAccounts (endpointRoute) {
    const { endpoint, uln, sendLibraryConfig, defaultSendLibraryConfig, sendLibraryInfo, endpointSettings, nonce, sendConfig, defaultSendConfig, workers } = endpointRoute

    /** @type {Array<[SolanaAddress, AccountRole?]>} */
    const accounts = [
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
      ...workers.flatMap(({ program, config, priceFeedProgram, priceFeed }) => [[program], [config], [priceFeedProgram], [priceFeed]])
    ]

    return accounts.map(([account, role = AccountRole.READONLY]) => ({ address: account, role }))
  }

  /** @private */
  _getSendEndpointAccounts (payer, endpointRoute) {
    const { endpoint, sender, uln, sendLibraryConfig, defaultSendLibraryConfig, sendLibraryInfo, endpointSettings, nonce, endpointEventAuthority, sendConfig, defaultSendConfig, ulnEventAuthority, treasury, workers } = endpointRoute

    /** @type {Array<[SolanaAddress, AccountRole?]>} */
    const accounts = [
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
      ...workers.flatMap(({ program, config, priceFeedProgram, priceFeed }) => [[program], [config, AccountRole.WRITABLE], [priceFeedProgram], [priceFeed]])
    ]

    return accounts.map(([account, role = AccountRole.READONLY]) => ({ address: account, role }))
  }

  /** @private */
  async _buildOftSendInstructions (nativeFee, sender, payer, route, sendParam) {
    const { programAddress, oftStore, peer, credits, store, lookupTables, endpoint } = route

    const [[tokenSource], [eventAuthority]] = await Promise.all([
      findAssociatedTokenPda({ mint: store.tokenMint, owner: sender, tokenProgram: TOKEN_PROGRAM_ADDRESS }),
      getProgramDerivedAddress({ programAddress, seeds: ['__event_authority'] })
    ])

    const remainingAccounts = this._getSendEndpointAccounts(payer, endpoint)

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
      this._assertValidRecipient(targetChain, validateTonAddress(recipient))

      const address = Address.parse(recipient)

      if (address.workChain !== 0) {
        throw new ValueError(`Invalid recipient address for target chain '${targetChain}': UNSUPPORTED_WORKCHAIN.`)
      }

      return new Uint8Array(address.hash)
    }

    if (type === 'tvm') {
      this._assertValidRecipient(targetChain, validateTronAddress(recipient))

      const bytes = getBase58Encoder().encode(recipient).slice(0, 21)

      if (bytes.slice(1).every((byte) => byte === 0)) {
        throw new ValueError(`Invalid recipient address for target chain '${targetChain}': ZERO_ADDRESS.`)
      }

      return padLeftEncoder(getBytesEncoder(), 32 - bytes.length).encode(bytes)
    }

    this._assertValidRecipient(targetChain, validateEVMAddress(recipient))

    return addressToBytes32(recipient)
  }

  /** @private */
  _assertValidRecipient (targetChain, result) {
    if (!result.success) {
      throw new ValueError(`Invalid recipient address for target chain '${targetChain}': ${result.reason}.`)
    }
  }
}
