# Pay by AgentLabs — MCP server

An [MCP](https://modelcontextprotocol.io) server that lets AI agents pay
services which onboard the **Pay by AgentLabs** SDK. It is a thin wrapper
over the live `/v1` REST API of this repo's payments backend — every tool
maps to a route the API actually exposes.

## Tools

| Tool | API route |
| --- | --- |
| `create_checkout_session` | `POST /v1/checkout/sessions` |
| `get_checkout_session` | `GET /v1/checkout/sessions/:id` |
| `create_payment_intent` | `POST /v1/payment_intents` |
| `get_payment_intent` | `GET /v1/payment_intents/:id` |
| `list_payment_intents` | `GET /v1/payment_intents` |
| `confirm_payment_intent` | `POST /v1/payment_intents/:id/confirm` |
| `create_customer` | `POST /v1/customers` |
| `get_customer` | `GET /v1/customers/:id` |
| `list_customers` | `GET /v1/customers` |
| `create_invoice` | `POST /v1/invoices` |
| `get_invoice` | `GET /v1/invoices/:id` |
| `list_invoices` | `GET /v1/invoices` |
| `add_invoice_line_item` | `POST /v1/invoices/:id/line_items` |
| `finalize_invoice` | `POST /v1/invoices/:id/finalize` |
| `void_invoice` | `POST /v1/invoices/:id/void` |
| `list_events` | `GET /v1/events` |

Typical agent flow: `create_payment_intent` (or `create_invoice` →
`add_invoice_line_item` → `finalize_invoice`) → `create_checkout_session`
→ send the payer the session's hosted checkout `url` → confirm the result
with `get_checkout_session` / `get_payment_intent` / `list_events`.

## Install & run

```bash
git clone https://github.com/dzianisv/CryptoPayments.git
cd CryptoPayments
pnpm install          # from the repo root (workspace)
pnpm --filter agentlabs-pay-mcp build

AGENTLABS_PAY_API_KEY=<your key> node mcp/dist/index.js
```

The server speaks MCP over stdio — in normal use your MCP client launches
the process (see the client config below); running it directly is only
useful to check that it starts.

Environment:

- `AGENTLABS_PAY_API_KEY` — required. API keys are issued on request today;
  self-serve onboarding is tracked in
  [AgentPod #6440](https://github.com/VibeTechnologies/AgentPod/issues/6440).
- `AGENTLABS_PAY_API_BASE` — optional API base URL
  (default `https://crypto-payments.agentpod.agentlabs.cc`;
  `https://pay.agentlabs.cc` also works — it proxies `/v1` to the same
  backend).

## MCP client config

For Claude Desktop, Claude Code, or any MCP client that takes a
`mcpServers` map — point `args` at the built file:

```json
{
  "mcpServers": {
    "agentlabs-pay": {
      "command": "node",
      "args": ["<path to CryptoPayments>/mcp/dist/index.js"],
      "env": { "AGENTLABS_PAY_API_KEY": "<your key>" }
    }
  }
}
```

## Example — create a checkout session

Tool call (`create_checkout_session`, a $25 Pro checkout):

```json
{
  "name": "create_checkout_session",
  "arguments": {
    "amount": 25,
    "plan_id": "pro",
    "success_url": "https://pay.agentlabs.cc/sdk",
    "cancel_url": "https://pay.agentlabs.cc/sdk"
  }
}
```

Result (a real session created against the production API; fields
trimmed) — send the payer the hosted checkout `url`, then poll
`get_checkout_session` until `status` flips from `open` to `complete`:

```json
{
  "id": "f639d441-26a4-41e1-a4f8-f603b6548d35",
  "stripe_id": "cs_d7a1ab9e1d71413f8421eeb684a8ecf9",
  "status": "open",
  "plan_id": "pro",
  "amount": 25,
  "currency": "usd",
  "url": "https://pay.openclaw.ai/checkout/cs_d7a1ab9e1d71413f8421eeb684a8ecf9",
  "expires_at": "2026-11-27T07:19:39.252Z"
}
```

A bad or missing key surfaces the API's real error as a tool error
(`HTTP 401: Unauthorized`) — the server invents no responses of its own.

## Develop

```bash
pnpm --filter agentlabs-pay-mcp test    # vitest: client, tool mapping, MCP protocol
pnpm --filter agentlabs-pay-mcp build   # tsc → dist/
```
