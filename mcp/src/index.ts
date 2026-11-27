#!/usr/bin/env node
/**
 * Pay by AgentLabs — MCP server (stdio).
 *
 * Lets AI agents pay services that onboard the Pay by AgentLabs SDK:
 * create customers, invoices and payment intents, open hosted checkout
 * sessions, and confirm payment status — all over the live /v1 API.
 *
 * Environment:
 *   AGENTLABS_PAY_API_KEY  API key for the /v1 API (issued on request today).
 *   AGENTLABS_PAY_API_BASE Optional API base URL
 *                          (default https://pay.agentlabs.cc).
 *   AGENTLABS_PAY_X402_PRIVATE_KEY
 *                          Wallet key for the x402 payer tools (env only,
 *                          never logged; tools fail per-call when unset).
 *   AGENTLABS_PAY_X402_MAX_AMOUNT_ATOMIC
 *                          Per-payment cap (default 1000000 = 1 USDC).
 *   AGENTLABS_PAY_X402_RPC Base Sepolia RPC for balance reads
 *                          (default https://sepolia.base.org).
 *
 * Run:  node dist/index.js        (after `pnpm build`)
 *   or: pnpm --filter agentlabs-pay-mcp start
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PayClient } from "./client.js";
import { registerTools, registerX402Tools } from "./tools.js";
import { X402Payer } from "./x402.js";

const client = PayClient.fromEnv(process.env);
const x402Payer = X402Payer.fromEnv(process.env);

const server = new McpServer({
  name: "agentlabs-pay",
  version: "0.1.0",
});

registerTools(server, client);
registerX402Tools(server, x402Payer);

await server.connect(new StdioServerTransport());
