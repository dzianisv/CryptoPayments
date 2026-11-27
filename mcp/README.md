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

## Run

```bash
pnpm install          # from the repo root (workspace)
pnpm --filter agentlabs-pay-mcp build

AGENTLABS_PAY_API_KEY=<your key> node mcp/dist/index.js
```

Environment:

- `AGENTLABS_PAY_API_KEY` — required. API keys are issued on request today;
  self-serve onboarding is tracked in
  [AgentPod #6440](https://github.com/VibeTechnologies/AgentPod/issues/6440).
- `AGENTLABS_PAY_API_BASE` — optional API base URL
  (default `https://crypto-payments.agentpod.agentlabs.cc`).

## MCP client config

```json
{
  "mcpServers": {
    "agentlabs-pay": {
      "command": "node",
      "args": ["mcp/dist/index.js"],
      "env": { "AGENTLABS_PAY_API_KEY": "<your key>" }
    }
  }
}
```

## Develop

```bash
pnpm --filter agentlabs-pay-mcp test    # vitest: client, tool mapping, MCP protocol
pnpm --filter agentlabs-pay-mcp build   # tsc → dist/
```
