# CryptoPayments — Pay by AgentLabs

Crypto payment processor - accepts USDT/USDC on Base, Ethereum, TON, and Solana. Records payments linked to Telegram user IDs or email.

**Pay by AgentLabs** is the free, open-source crypto payments SDK built on this processor
(MIT License — see [LICENSE](LICENSE)):

- **Product + SDK docs:** https://pay.agentlabs.cc/sdk
- **Hosted checkout:** https://pay.agentlabs.cc/pay
- **Machine-readable summary (for agents):** https://pay.agentlabs.cc/llms.txt
- **Product page:** https://agentlabs.cc/pay/

Accept crypto payments for services and subscriptions with no platform fees — payments
settle directly to your own wallet. Server integration is a REST API (`/v1/customers`,
`/v1/invoices`, `/v1/payment_intents`, `/v1/checkout/sessions`, `/v1/events`, API-key auth);
browser integration is one script tag (`agentlabs-pay.js`, served from the checkout host).

**For AI agents:** the [`mcp/`](mcp/) package is an MCP server
(`agentlabs-pay-mcp`, stdio transport) that exposes the API as 16 native
tools — checkout sessions, payment intents, customers, invoices, events —
for any MCP client. Build with `pnpm --filter agentlabs-pay-mcp build`,
run `node mcp/dist/index.js` with `AGENTLABS_PAY_API_KEY` set; see
[mcp/README.md](mcp/README.md) for the client config and a worked example,
and the [SDK page's MCP section](https://pay.agentlabs.cc/sdk#mcp) for the
full tool reference.

## x402 payments

Pay by AgentLabs speaks [x402](https://www.x402.org) (v2), the HTTP-native
payment protocol: a route answers `402 Payment Required` with machine-readable
payment requirements, the payer signs an EIP-3009 authorization, and the same
request retried with the payment proof succeeds. Scheme: `exact`
(`transferWithAuthorization`), asset: USDC. The payer signs only — no
transaction, no gas; the facilitator broadcasts settlement.

**Charge for a checkout session** — `POST /x402/checkout` on the API server
sells the creation of a hosted checkout session at a fixed price (default
0.01 USDC, env `X402_PRICE_ATOMIC`). No API key: the payment is the
authorization. The route ships in the API server behind `X402_ENABLED`
(default off); production enablement is in progress.

```bash
# 1. Unpaid request → 402 + payment requirements
curl -i -X POST https://crypto-payments.agentpod.agentlabs.cc/x402/checkout
# HTTP/2 402
# payment-required: eyJ4NDAyVmVyc2lvbiI6Mi4uLg==
# {"x402Version":2,"error":"PAYMENT-SIGNATURE header is required",
#  "resource":{"url":"https://crypto-payments.agentpod.agentlabs.cc/x402/checkout","description":"Create a Pay by AgentLabs hosted checkout session","mimeType":"application/json"},
#  "accepts":[{"scheme":"exact","network":"eip155:84532","amount":"10000",
#    "asset":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","payTo":"0x64cd33D639Cbb0b461c64ec989a7d9789d701a30",
#    "maxTimeoutSeconds":300,"extra":{"name":"USDC","version":"2","assetTransferMethod":"eip3009"}}]}

# 2. Sign the EIP-3009 authorization, retry with the proof → 200
curl -X POST https://crypto-payments.agentpod.agentlabs.cc/x402/checkout \
  -H "PAYMENT-SIGNATURE: <base64 payment payload>"
# 200 + checkout session JSON (hosted `url`), PAYMENT-RESPONSE header with the settlement receipt
```

The v1 `X-PAYMENT` header is accepted alongside the v2 `PAYMENT-SIGNATURE`
header. The server verifies and settles through the facilitator **before**
creating anything; on settlement it records a payment intent (marked paid,
with the settlement tx hash and payer), creates the checkout session, and
logs an `x402.payment.settled` event (visible in `GET /v1/events`).

**Agents pay with the MCP server** — the `mcp/` package adds three x402 tools:

| Tool | What it does |
|---|---|
| `get_x402_payment_requirements` | Requests a URL without paying; returns the parsed 402 requirements |
| `pay_x402_resource` | Full cycle: fetch → parse 402 → sign EIP-3009 → retry with `PAYMENT-SIGNATURE` → returns the resource + settlement |
| `x402_wallet_info` | Payer address + USDC balance (never returns key material) |

Config (environment only — the key is never logged or returned):

| Env | Meaning |
|---|---|
| `AGENTLABS_PAY_X402_PRIVATE_KEY` | Payer wallet private key (MCP payer tools) |
| `AGENTLABS_PAY_X402_MAX_AMOUNT_ATOMIC` | Per-payment cap, default `1000000` (1 USDC); a requirement above the cap is refused, never signed |
| `X402_ENABLED` / `X402_FACILITATOR_URL` / `X402_NETWORK` / `X402_PRICE_ATOMIC` | Server side: enable the route, facilitator base (default `https://x402.org/facilitator`), network, price |

**Networks:** Base Sepolia (`eip155:84532`) — proven end-to-end on
2026-11-27 against the live x402.org facilitator: unpaid → 402 → sign →
settle → retry → 200 (`paid: true`); settlement tx
[0x3efc6bf1663ce884800d8654b851e18c13f49f981734bccf5bee30440e9e47c0](https://sepolia.basescan.org/tx/0x3efc6bf1663ce884800d8654b851e18c13f49f981734bccf5bee30440e9e47c0) (block 64223092, status 0x1), payment intent
`pi_71b256eb5802438ea2ed9b92d18232f7`, checkout session
`cs_6dbe1fc8f894434488cae294d271000f`. Base mainnet is config-only and
fail-closed (it requires a CDP facilitator key, not provisioned) — not
enabled, not claimed.
