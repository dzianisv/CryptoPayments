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
