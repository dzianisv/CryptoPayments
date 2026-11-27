# Payment UX Flow

Crypto payment page for OpenClaw subscriptions. Standalone Next.js SPA hosted on Azure Static Web Apps at `pay.oclawbox.com`, separate from the Supabase Edge Function API.

## Architecture

```
User (browser)  ──>  Next.js SPA (Azure SWA)  ──>  Edge Function API (Supabase)
                          │                                    │
                     wallet SDKs                          on-chain verify
                   (ethers, phantom,                       + webhook to
                     tonconnect)                           OpenClawBot
```

- **SPA** (`/web`): Next.js static export app. Handles UI, wallet connection, tx signing.
- **API** (Supabase Edge Function): `/api/config` for chain/token/wallet data, `POST /api/payment` for tx verification.
- **No HTML from Edge Functions** — Supabase rewrites `text/html` to `text/plain`.
- **Hosting**: Azure Static Web Apps, custom domain `pay.oclawbox.com`, TLS via Azure.

## Entry Points

1. **Telegram Mini App**: Bot sends a web_app button with `?plan=starter&uid=123456`. Telegram WebApp JS provides `initData` for auth.
2. **Direct link**: `https://pay.oclawbox.com/pay?plan=starter&uid=123456&idtype=tg`
3. **Checkout session**: `https://pay.oclawbox.com/checkout/<session_id>` — pre-created via `POST /v1/checkout/sessions`.

## User Flow

### Step 1 — Choose Network

User picks a blockchain network:

| Network       | Wallet Type     | Chain ID   | Notes          |
|---------------|-----------------|------------|----------------|
| Base          | Any EVM wallet  | `0x2105`   | Default        |
| Ethereum      | Any EVM wallet  | `0x1`      |                |
| Solana        | Phantom         | —          |                |
| TON           | TonConnect      | —          |                |
| Base Sepolia  | Any EVM wallet  | `0x14a34`  | Testnet only   |

**Testnet visibility**: Base Sepolia is hidden by default. Only shown when URL contains `?test=true`. This prevents end users from accidentally selecting a testnet.

### Step 2 — Choose Token

- **USDC** (default)
- **USDT**

Both are 6 decimals on all chains.

### Step 3 — Connect Wallet & Pay

SPA detects available wallets and shows the appropriate connect button. If no wallet extension is detected, a link to install one is shown below the button.

- **EVM chains** (Base, Ethereum, Base Sepolia): Detects `window.ethereum` -> ethers.js v6 `BrowserProvider`
  - Button labeled **"Connect Wallet"** (works with any EVM wallet — MetaMask, Rabby, Coinbase Wallet, etc.)
  - Auto-switches chain via `wallet_switchEthereumChain`
  - If wallet returns error code `4902` (chain not added), falls back to `wallet_addEthereumChain` with full chain parameters (chainName, rpcUrls, nativeCurrency, blockExplorerUrls)
  - ethers.js v6 wraps the 4902 error three different ways; all are detected
  - **WalletConnect v2** (Telegram WebApp / mobile browsers, where no `window.ethereum` exists): button labeled **"Connect with WalletConnect"**, shown when the build carries a WalletConnect project id (`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, set from the `WALLETCONNECT_PROJECT_ID` repo variable in the deploy workflow's Build step). The session is established via `@walletconnect/ethereum-provider` with the user-selected chain requested at connect time, and the same ethers.js transfer then runs over the WalletConnect provider. A **"WalletConnect docs"** link (https://docs.walletconnect.com/) sits with the EVM connect controls. With no project id configured, the page behaves exactly as the injected-only flow above.
- **Solana**: Detects `window.phantom.solana` -> `connect()`. SPL token transfer via `@solana/spl-token`.
- **TON**: TonConnect UI SDK modal. Jetton transfer via TEP-74 standard (`@ton/core`).

**No raw wallet addresses are shown to users.** The SPA auto-constructs the transaction using wallet addresses from the API config.

### Step 4 — Review & Send

Page shows:
- Plan name + price (fetched from `/api/config` `.prices`)
- Connected wallet address (truncated)
- "Pay $X.XX USDC/USDT" button

User clicks "Pay":
1. SPA constructs ERC-20 `transfer()` (EVM), SPL transfer (Solana), or Jetton transfer (TON)
2. Wallet popup asks user to sign
3. SPA captures the tx hash from the wallet response

### Step 5 — Verify

SPA sends `POST /api/payment`:

```json
{
  "txHash": "0x...",
  "chainId": "base",
  "token": "usdc",
  "idType": "tg",
  "uid": "123456",
  "plan": "starter",
  "callbackUrl": "https://console.oclawbox.com/crypto/webhook",
  "initData": "<telegram_init_data>"
}
```

API verifies on-chain, sends webhook to OpenClawBot, returns `{ payment: { status: "verified", ... } }`.

### Step 6 — Confirmation

Page shows success state. If opened from Telegram, auto-closes after 3 seconds via `tg.close()`.

## API Endpoints (consumed by SPA)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/config` | None | Wallets, prices, tokens, chains |
| `POST` | `/api/payment` | `initData` or `apiKey` | Submit tx hash for verification |
| `GET` | `/api/payment/:id` | None | Check payment status |
| `GET` | `/v1/checkout/sessions/:id` | API key | Get checkout session details |

## Design

Stripe-like minimal dark theme. Mobile-first (Telegram Mini App). Steps shown as collapsible cards with numbered step headers.
