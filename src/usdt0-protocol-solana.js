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

import { getBase16Encoder, getBase58Encoder } from '@solana/codecs'
import { appendTransactionMessageInstructions, createTransactionMessage } from '@solana/transaction-messages'
import { Address } from '@ton/core'

import { FEE_TOLERANCE, SOURCE_CHAIN, SOLANA_OFT_DEPLOYMENTS, BLOCKCHAINS, TOKENS } from './config.js'

/** @typedef {import('@tetherto/wdk-wallet/protocols').BridgeProtocolConfig} BridgeProtocolConfig */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BridgeResult} BridgeResult */

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */

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

    const sendParam = this._buildOftSendParam(targetChain, recipient, amount, dstEid)

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
   */
  async _quoteOftSend (deployment, sendParam) {
    // TODO: build the 'quote_send' instruction (oft store, peer, endpoint and messagelib remaining accounts),
    // simulate it via this._account._rpc and decode the returned MessagingFee.
    throw new Error('Not implemented: _quoteOftSend.')
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
   * @private
   * @returns {OftSendParam}
   */
  _buildOftSendParam (targetChain, recipient, amount, dstEidOverride) {
    const to = this._encodeRecipient(targetChain, recipient)

    if (to.every((byte) => byte === 0)) {
      throw new Error(`Invalid recipient address for target chain '${targetChain}': ZERO_ADDRESS.`)
    }

    return {
      dstEid: dstEidOverride ?? BLOCKCHAINS[targetChain].eid,
      to,
      amountLD: amount,
      minAmountLD: amount * FEE_TOLERANCE / 1_000n,
      extraOptions: new Uint8Array([0, 3]),
      composeMsg: new Uint8Array(),
      oftCmd: new Uint8Array()
    }
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
