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

import { Options } from '@layerzerolabs/lz-v2-utilities'

import { ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS, getAddressLookupTableDecoder } from '@solana-program/address-lookup-table'
import { MAX_COMPUTE_UNIT_LIMIT, getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget'
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system'
import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses'
import {
  Endian,
  addEncoderSizePrefix,
  fixEncoderSize,
  getBase16Encoder,
  getBase58Encoder,
  getBase64Encoder,
  getBooleanEncoder,
  getBytesEncoder,
  getOptionEncoder,
  getStructDecoder,
  getStructEncoder,
  getU32Encoder,
  getU64Decoder,
  getU64Encoder
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

import { FEE_TOLERANCE, SOURCE_CHAIN, SOLANA_OFT_DEPLOYMENTS, BLOCKCHAINS, TOKENS, LAYERZERO_ULN_PROGRAM } from './config.js'
import {
  dvnConfigDecoder,
  executorConfigDecoder,
  getCreditsAddress,
  getPeerAddress,
  parseOftStore,
  parsePeerConfig,
  sendLibraryConfigDecoder,
  ulnSendConfigDecoder
} from './layerzero.js'

/** @typedef {import('@tetherto/wdk-wallet/protocols').BridgeProtocolConfig} BridgeProtocolConfig */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BridgeResult} BridgeResult */

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */

/** @typedef {import('@solana/addresses').Address} SolanaAddress */

// Anchor instruction discriminator: the first 8 bytes of sha256('global:quote_send').
const QUOTE_SEND_DISCRIMINATOR = 'cf0031d6a0d34cd3'

// Legacy Mesh 'quote_send' arguments, borsh-encoded.
const QUOTE_SEND_ENCODER = getStructEncoder([
  ['discriminator', fixEncoderSize(getBytesEncoder(), 8)],
  ['dstEid', getU32Encoder()],
  ['to', fixEncoderSize(getBytesEncoder(), 32)],
  ['amountLD', getU64Encoder()],
  ['minAmountLD', getU64Encoder()],
  ['extraOptions', addEncoderSizePrefix(getBytesEncoder(), getU32Encoder())],
  ['composeMsg', getOptionEncoder(addEncoderSizePrefix(getBytesEncoder(), getU32Encoder()))],
  ['payInLzToken', getBooleanEncoder()]
])

const MESSAGING_FEE_DECODER = getStructDecoder([
  ['nativeFee', getU64Decoder()],
  ['lzTokenFee', getU64Decoder()]
])

/**
 * A chain supported by the protocol, in the canonical WDK swidge shape.
 *
 * Mirrors `SwidgeSupportedChain` from `@tetherto/wdk-wallet/protocols`; declared locally until the swidge migration.
 *
 * @typedef {Object} SwidgeSupportedChain
 * @property {string | number} id - The provider-specific chain identifier.
 * @property {string} name - The human-readable chain name.
 * @property {string} type - The chain or virtual machine type (e.g., 'evm', 'svm', 'ton', 'tvm').
 * @property {string} nativeToken - The symbol of the chain's native token.
 */

/**
 * A token supported by the protocol, in the canonical WDK swidge shape.
 *
 * Mirrors `SwidgeSupportedToken` from `@tetherto/wdk-wallet/protocols`; declared locally until the swidge migration.
 *
 * @typedef {Object} SwidgeSupportedToken
 * @property {string} token - The provider-specific token identifier to use in operations.
 * @property {string | number} chain - The chain on which the token is available.
 * @property {string} symbol - The token symbol.
 * @property {number} decimals - The number of decimal places for the token's base unit.
 * @property {string} [address] - The token contract address, if applicable.
 * @property {string} [name] - The token's full name.
 */

/**
 * Optional filters for chain- or route-scoped token discovery.
 *
 * Mirrors `SwidgeSupportedTokensOptions` from `@tetherto/wdk-wallet/protocols`; declared locally until the swidge migration.
 *
 * @typedef {Object} SwidgeSupportedTokensOptions
 * @property {string | number} [fromChain] - The optional source chain for route-scoped discovery.
 * @property {string} [fromToken] - The optional source token for route-scoped discovery.
 * @property {string | number} [toChain] - The optional destination chain for route-scoped discovery.
 */

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
 * @property {Uint8Array} to - The recipient address, encoded as 32 bytes.
 * @property {bigint} amountLD - The amount to send, in local decimals.
 * @property {bigint} minAmountLD - The minimum amount to receive, in local decimals.
 * @property {Uint8Array} extraOptions - The LayerZero executor options.
 * @property {Uint8Array} composeMsg - The compose message.
 * @property {Uint8Array} oftCmd - The oft command.
 */

export default class Usdt0ProtocolSolana extends BridgeProtocol {
  /**
   * Creates a new read-only interface to the usdt0 protocol for the solana blockchain.
   *
   * @overload
   * @param {IWalletAccountReadOnly} account - The wallet account to use to interact with the protocol.
   * @param {BridgeProtocolConfig} [config] - The bridge protocol configuration.
   */

  /**
   * Creates a new interface to the usdt0 protocol for the solana blockchain.
   *
   * @overload
   * @param {IWalletAccount} account - The wallet account to use to interact with the protocol.
   * @param {BridgeProtocolConfig} [config] - The bridge protocol configuration.
   */
  constructor (account, config = {}) {
    super(account, config)
  }

  /**
   * Bridges a token from solana to a different blockchain.
   *
   * @param {BridgeOptions} options - The bridge's options. Optionally pass 'dstEid' to override the destination endpoint id.
   * @returns {Promise<BridgeResult>} The bridge's result.
   */
  async bridge (options) {
    if (typeof this._account.sendTransaction !== 'function') {
      throw new Error("The 'bridge(options)' method requires the protocol to be initialized with a non read-only account.")
    }

    if (!this._account._rpc) {
      throw new Error('The wallet must be connected to a provider in order to perform bridge operations.')
    }

    const { tx, bridgeFee } = await this._getBridgeTransaction({ ...options, amount: BigInt(options.amount) })

    const { fee } = await this._account.quoteSendTransaction(tx)

    if (this._config.bridgeMaxFee !== undefined && fee + bridgeFee >= this._config.bridgeMaxFee) {
      throw new Error('Exceeded maximum fee cost for bridge operation.')
    }

    const { hash } = await this._account.sendTransaction(tx)

    return { hash, fee, bridgeFee }
  }

  /**
   * Quotes the costs of a bridge operation.
   *
   * @param {BridgeOptions} options - The bridge's options. Optionally pass 'dstEid' to override the destination endpoint id.
   * @returns {Promise<Omit<BridgeResult, 'hash'>>} The bridge's quotes.
   */
  async quoteBridge (options) {
    if (!this._account._rpc) {
      throw new Error('The wallet must be connected to a provider in order to quote bridge operations.')
    }

    const { tx, bridgeFee } = await this._getBridgeTransaction({ ...options, amount: BigInt(options.amount) })

    const { fee } = await this._account.quoteSendTransaction(tx)

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
  async _getBridgeTransaction ({ targetChain, recipient, token, amount, dstEid }) {
    if (!BLOCKCHAINS[targetChain]) {
      throw new Error(`Target chain '${targetChain}' not supported.`)
    }

    if (targetChain === SOURCE_CHAIN) {
      throw new Error('The target chain cannot be equal to the source chain.')
    }

    const deployment = this._getOftDeployment(token)

    if (!deployment) {
      throw new Error(`Token '${token}' not supported on this chain.`)
    }

    const to = this._encodeRecipient(targetChain, recipient)

    if (to.every((byte) => byte === 0)) {
      throw new Error(`Invalid recipient address for target chain '${targetChain}': ZERO_ADDRESS.`)
    }

    /** @type {OftSendParam} */
    const sendParam = {
      dstEid: dstEid ?? BLOCKCHAINS[targetChain].eid,
      to,
      amountLD: amount,
      minAmountLD: amount * FEE_TOLERANCE / 1_000n,
      extraOptions: Options.newOptions().toBytes(),
      composeMsg: new Uint8Array(),
      oftCmd: new Uint8Array()
    }

    const { nativeFee: bridgeFee } = await this._quoteOftSend(deployment, sendParam)

    const sender = await this._account.getAddress()

    const instructions = await this._buildOftSendInstructions(deployment, sendParam, bridgeFee, sender)

    const tx = appendTransactionMessageInstructions(instructions, createTransactionMessage({ version: 0 }))

    return { tx, bridgeFee }
  }

  /** @private */
  _getOftDeployment (token) {
    for (const deployment of Object.values(SOLANA_OFT_DEPLOYMENTS)) {
      if (deployment.mint && deployment.mint === token) {
        return deployment
      }
    }

    return null
  }

  /**
   * Quotes the layerzero messaging fee of an oft send by simulating the oft program's 'quote_send' instruction.
   *
   * @private
   * @param {typeof SOLANA_OFT_DEPLOYMENTS[keyof typeof SOLANA_OFT_DEPLOYMENTS]} deployment - The oft deployment.
   * @param {OftSendParam} sendParam - The send parameters.
   * @returns {Promise<{ nativeFee: bigint, lzTokenFee: bigint }>} The messaging fee, in lamports.
   * @throws {Error} If the deployment, route, or simulation result is invalid.
   * @see https://github.com/LayerZero-Labs/usdt-native-mesh/blob/main/programs/oft/src/instructions/quote_send.rs
   */
  async _quoteOftSend (deployment, sendParam) {
    if (sendParam.to.length !== 32 || sendParam.oftCmd.length !== 0) {
      throw new Error('Invalid OFT recipient or unsupported OFT command.')
    }

    const programAddress = address(deployment.programId)

    const oftStore = address(deployment.oftStore)

    const [peer, credits] = await Promise.all([getPeerAddress(programAddress, sendParam.dstEid), getCreditsAddress(programAddress)])

    const { value: [storeAccount, peerAccount] } = await this._account._rpc
      .getMultipleAccounts([oftStore, peer], { encoding: 'base64', commitment: this._account._commitment })
      .send()

    const store = parseOftStore(storeAccount, programAddress)

    if (!store || store.tokenMint !== deployment.mint) {
      throw new Error('Invalid OFT store account.')
    }

    const peerConfig = parsePeerConfig(peerAccount, programAddress)

    if (!peerConfig) {
      throw new Error(`OFT peer not configured for destination ${sendParam.dstEid}.`)
    }

    const remainingAccounts = await this._getQuoteSendAccounts(store.endpointProgram, oftStore, sendParam.dstEid, peerConfig.peerAddress)

    const instruction = {
      programAddress,
      accounts: [oftStore, credits, peer].map((account) => ({ address: account, role: AccountRole.READONLY })).concat(remainingAccounts),
      data: QUOTE_SEND_ENCODER.encode({
        discriminator: getBase16Encoder().encode(QUOTE_SEND_DISCRIMINATOR),
        dstEid: sendParam.dstEid,
        to: sendParam.to,
        amountLD: sendParam.amountLD,
        minAmountLD: sendParam.minAmountLD,
        extraOptions: sendParam.extraOptions,
        composeMsg: sendParam.composeMsg.length ? sendParam.composeMsg : null,
        payInLzToken: false
      })
    }

    const lookupTables = {}

    if (store.alt) {
      const { value: [table] } = await this._account._rpc
        .getMultipleAccounts([store.alt], { encoding: 'base64', commitment: this._account._commitment })
        .send()

      if (!table || table.owner !== ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS) {
        throw new Error('Invalid OFT address lookup table account.')
      }

      lookupTables[store.alt] = getAddressLookupTableDecoder().decode(getBase64Encoder().encode(table.data[0])).addresses
    }

    // No lifetime is set: the message compiles with an empty blockhash, which the rpc replaces during the simulation.
    const message = compressTransactionMessageUsingAddressLookupTables(
      appendTransactionMessageInstructions(
        [getSetComputeUnitLimitInstruction({ units: MAX_COMPUTE_UNIT_LIMIT }), instruction],
        setTransactionMessageFeePayer(address(await this._account.getAddress()), createTransactionMessage({ version: 0 }))
      ),
      lookupTables
    )

    const { value } = await this._account._rpc.simulateTransaction(getBase64EncodedWireTransaction(compileTransaction(message)), {
      encoding: 'base64', commitment: this._account._commitment, sigVerify: false, replaceRecentBlockhash: true
    }).send()

    // The simulation needs an existing fee payer, so an unfunded wallet cannot be quoted.
    if (value.err === 'AccountNotFound') {
      throw new Error('Cannot quote from an unfunded account: fund it with SOL first.')
    }

    if (value.err) {
      const error = JSON.stringify(value.err, (_, value) => typeof value === 'bigint' ? value.toString() : value)
      throw new Error(`OFT quote simulation failed: ${error}. ${(value.logs ?? []).join('\n')}`)
    }

    const returned = value.returnData

    const fee = returned?.data?.[1] === 'base64' ? getBase64Encoder().encode(returned.data[0]) : undefined

    if (returned?.programId !== deployment.programId || fee?.length !== 16) {
      throw new Error('Invalid OFT quote return data.')
    }

    return MESSAGING_FEE_DECODER.decode(fee)
  }

  /**
   * Resolves the endpoint and message library accounts an oapp forwards to the layerzero endpoint's 'quote' instruction.
   *
   * Port of `SendHelper.getQuoteAccounts` from `@layerzerolabs/lz-solana-sdk-v2`, restricted to the ULN message library.
   *
   * @private
   * @param {SolanaAddress} endpoint - The layerzero endpoint program.
   * @param {SolanaAddress} sender - The oapp sending the message (the oft store).
   * @param {number} dstEid - The destination endpoint id.
   * @param {Uint8Array} receiver - The remote peer, encoded as 32 bytes.
   * @returns {Promise<import('@solana/instructions').AccountMeta[]>} The accounts, all read-only.
   * @throws {Error} If the route is not configured or uses a message library other than the ULN.
   */
  async _getQuoteSendAccounts (endpoint, sender, dstEid, receiver) {
    const eid = getU32Encoder({ endian: Endian.Big }).encode(dstEid)

    const senderSeed = getAddressEncoder().encode(sender)

    const [[sendLibraryConfig], [defaultSendLibraryConfig], [uln], [sendConfig], [defaultSendConfig]] = await Promise.all([
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['SendLibraryConfig', senderSeed, eid] }),
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['SendLibraryConfig', eid] }),
      getProgramDerivedAddress({ programAddress: LAYERZERO_ULN_PROGRAM, seeds: ['MessageLib'] }),
      getProgramDerivedAddress({ programAddress: LAYERZERO_ULN_PROGRAM, seeds: ['SendConfig', eid, senderSeed] }),
      getProgramDerivedAddress({ programAddress: LAYERZERO_ULN_PROGRAM, seeds: ['SendConfig', eid] })
    ])

    const { value: [sendLibraryConfigInfo, defaultSendLibraryConfigInfo, sendConfigInfo, defaultSendConfigInfo] } = await this._account._rpc
      .getMultipleAccounts([sendLibraryConfig, defaultSendLibraryConfig, sendConfig, defaultSendConfig], { encoding: 'base64', commitment: this._account._commitment })
      .send()

    if (!sendLibraryConfigInfo || !defaultSendLibraryConfigInfo) {
      throw new Error('LayerZero send library not initialized.')
    }

    let { messageLib } = sendLibraryConfigDecoder.decode(getBase64Encoder().encode(sendLibraryConfigInfo.data[0]))

    // LayerZero marks unset addresses with the all-zero key (PublicKey.default), which is the system program address.
    if (messageLib === SYSTEM_PROGRAM_ADDRESS) {
      messageLib = sendLibraryConfigDecoder.decode(getBase64Encoder().encode(defaultSendLibraryConfigInfo.data[0])).messageLib
    }

    if (messageLib !== uln) {
      throw new Error('Unsupported LayerZero message library.')
    }

    if (!defaultSendConfigInfo) {
      throw new Error('LayerZero ULN send config not initialized.')
    }

    // An oapp send config overrides the default executor when set, and the default dvn sets when non-empty.
    const defaults = ulnSendConfigDecoder.decode(getBase64Encoder().encode(defaultSendConfigInfo.data[0]))

    const custom = sendConfigInfo && ulnSendConfigDecoder.decode(getBase64Encoder().encode(sendConfigInfo.data[0]))

    const executor = custom && custom.executor !== SYSTEM_PROGRAM_ADDRESS ? custom.executor : defaults.executor

    const [requiredDvns, optionalDvns] = ['requiredDvns', 'optionalDvns'].map((key) =>
      custom?.[key].length ? custom[key].filter((dvn) => dvn !== SYSTEM_PROGRAM_ADDRESS) : defaults[key]
    )

    const workers = [executor, ...requiredDvns, ...optionalDvns]

    const { value: workerInfos } = await this._account._rpc.getMultipleAccounts(workers, { encoding: 'base64', commitment: this._account._commitment }).send()

    const priceFeeds = workerInfos.map((info, i) => {
      if (!info) {
        throw new Error(`LayerZero worker ${workers[i]} not initialized.`)
      }

      return (i === 0 ? executorConfigDecoder : dvnConfigDecoder).decode(getBase64Encoder().encode(info.data[0])).priceFeed
    })

    const { value: priceFeedInfos } = await this._account._rpc.getMultipleAccounts(priceFeeds, { encoding: 'base64', commitment: this._account._commitment }).send()

    const [[sendLibraryInfo], [endpointSettings], [nonce]] = await Promise.all([
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['MessageLib', getAddressEncoder().encode(uln)] }),
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['Endpoint'] }),
      getProgramDerivedAddress({ programAddress: endpoint, seeds: ['Nonce', senderSeed, eid, receiver] })
    ])

    // Each worker contributes its program, its config, and its price feed's program and config.
    const workerAccounts = workers.flatMap((worker, i) => {
      if (!priceFeedInfos[i]) {
        throw new Error(`LayerZero price feed ${priceFeeds[i]} not initialized.`)
      }

      return [workerInfos[i].owner, worker, priceFeedInfos[i].owner, priceFeeds[i]]
    })

    return [
      endpoint,
      LAYERZERO_ULN_PROGRAM,
      sendLibraryConfig,
      defaultSendLibraryConfig,
      sendLibraryInfo,
      endpointSettings,
      nonce,
      uln,
      sendConfig,
      defaultSendConfig,
      ...workerAccounts
    ].map((address) => ({ address, role: AccountRole.READONLY }))
  }

  /**
   * Builds the oft program's 'send' instruction(s).
   *
   * @private
   * @param {typeof SOLANA_OFT_DEPLOYMENTS[keyof typeof SOLANA_OFT_DEPLOYMENTS]} deployment - The oft deployment.
   * @param {OftSendParam} sendParam - The send parameters.
   * @param {bigint} nativeFee - The layerzero native fee to pay, in lamports.
   * @param {string} sender - The sender's address.
   * @returns {Promise<import('@solana/instructions').Instruction[]>} The instructions.
   */
  async _buildOftSendInstructions (deployment, sendParam, nativeFee, sender) {
    // TODO: build the 'send' instruction (sender token account, mint, oft store, peer, endpoint and messagelib
    // remaining accounts), prepending a compute budget instruction if needed.
    throw new Error('Not implemented: _buildOftSendInstructions.')
  }

  /**
   * Encodes a recipient address of the target chain as 32 bytes, left-padded with zeros.
   *
   * @private
   * @param {string} targetChain - The target chain.
   * @param {string} recipient - The recipient's address.
   * @returns {Uint8Array} The encoded address.
   */
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

      return this._padBytes32(bytes)
    }

    if (type === 'evm') {
      this._assertValidRecipient(validateEVMAddress(recipient), targetChain)

      return this._padBytes32(getBase16Encoder().encode(recipient.slice(2).toLowerCase()))
    }

    throw new Error(`Target chain '${targetChain}' not supported.`)
  }

  /** @private */
  _padBytes32 (bytes) {
    const result = new Uint8Array(32)

    result.set(bytes, 32 - bytes.length)

    return result
  }

  /** @private */
  _assertValidRecipient (result, targetChain) {
    if (!result.success) {
      throw new Error(`Invalid recipient address for target chain '${targetChain}': ${result.reason}.`)
    }
  }
}
