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
 *                          (default https://crypto-payments.agentpod.agentlabs.cc).
 *
 * Run:  node dist/index.js        (after `pnpm build`)
 *   or: pnpm --filter agentlabs-pay-mcp start
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PayClient } from "./client.js";
import { registerTools } from "./tools.js";

const client = PayClient.fromEnv(process.env);

const server = new McpServer({
  name: "agentlabs-pay",
  version: "0.1.0",
});

registerTools(server, client);

await server.connect(new StdioServerTransport());
