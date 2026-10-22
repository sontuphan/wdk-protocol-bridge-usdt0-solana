# @tetherto/wdk-protocol-bridge-usdt0-solana

**Note**: This package is a work in progress. The OFT program integration is not implemented yet.

A bridge module for WDK (Wallet Development Kit) by Tether that lets Solana wallet accounts move [USD₮0](https://usdt0.to/) tokens to other blockchains through LayerZero. It is the Solana counterpart of [`@tetherto/wdk-protocol-bridge-usdt0-evm`](https://github.com/tetherto/wdk-protocol-bridge-usdt0-evm).

## ⬇️ Installation

```bash
npm install @tetherto/wdk-protocol-bridge-usdt0-solana
```

## 🚀 Quick Start

```javascript
import WDK from '@tetherto/wdk'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'
import Usdt0ProtocolSolana from '@tetherto/wdk-protocol-bridge-usdt0-solana'

const wdk = new WDK(seedPhrase)
  .registerWallet('solana', WalletManagerSolana, {
    provider: 'https://api.mainnet-beta.solana.com'
  })
  .registerProtocol('solana', 'usdt0', Usdt0ProtocolSolana, {
    bridgeMaxFee: 10_000_000n // 0.01 SOL in lamports
  })

const account = await wdk.getAccount('solana', 0)
const usdt0Bridge = account.getBridgeProtocol('usdt0')

const quote = await usdt0Bridge.quoteBridge({
  targetChain: 'arbitrum',
  recipient: '0x...',
  token: 'USDT0_SPL_MINT_ADDRESS',
  amount: 1_000_000n // 1 USDT0 (6 decimals)
})

const { hash, fee, bridgeFee } = await usdt0Bridge.bridge({
  targetChain: 'arbitrum',
  recipient: '0x...',
  token: 'USDT0_SPL_MINT_ADDRESS',
  amount: 1_000_000n
})
```

Supported destinations are EVM chains, TON and TRON. `fee` is the Solana transaction fee and `bridgeFee` the LayerZero messaging fee, both in lamports.

## 📚 API

### `new Usdt0ProtocolSolana(account, config?)`

- `account`: a `WalletAccountSolana` (or `WalletAccountReadOnlySolana` for quotes only).
- `config.bridgeMaxFee`: optional upper bound on `fee + bridgeFee`, in lamports.

### Methods

| Method | Description |
| --- | --- |
| `bridge(options)` | Sends the bridge transaction. Returns `{ hash, fee, bridgeFee }`. |
| `quoteBridge(options)` | Quotes the bridge. Returns `{ fee, bridgeFee }`. |
| `getSupportedChains()` | Lists the supported chains. |
| `getSupportedTokens(options?)` | Lists the supported tokens, optionally scoped by `fromChain`, `toChain` or `fromToken`. |

`options` is `{ targetChain, recipient, token, amount, dstEid? }`, where `token` is the SPL mint address and `dstEid` overrides the LayerZero endpoint id of the target chain.

## 🛠️ Development

```bash
npm install
npm run lint
npm test
npm run build:types
```

`SOLANA_OFT_DEPLOYMENTS` in `src/config.js` contains the mainnet Legacy Mesh OFT program, OFT store, and native SPL USDT mint.

Quotes and sends are built with the `@solana/*` v3 packages, not `@layerzerolabs/lz-solana-sdk-v2`, which does not load on Bare. `_getEndpointAccounts` ports the ULN path of its `SendHelper.getQuoteAccounts` and `getSendAccounts`, and `src/layerzero.js` holds the account layouts. A send loads its accounts through the OFT store's address lookup table.

## 📜 License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
