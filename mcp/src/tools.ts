import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PayApiError, type PayClient } from "./client.js";
import type { X402Payer } from "./x402.js";

/**
 * MCP tool definitions for Pay by AgentLabs.
 *
 * Every tool maps 1:1 to a route the /v1 API actually exposes (see
 * src/server.ts in this repo). Tools are declared as data (name, zod input
 * schema, handler against PayClient) so they can be unit-tested without a
 * transport; `registerTools` binds them onto an McpServer.
 */

const metadata = z
  .record(z.unknown())
  .describe("Arbitrary key/value metadata stored with the object.");

const pagination = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size (API default 10)."),
  offset: z.number().int().min(0).optional().describe("Pagination offset."),
};

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  schema: z.ZodRawShape;
  run: (client: PayClient, args: Record<string, unknown>) => Promise<unknown>;
}

export const TOOLS: ToolDef[] = [
  // ── Checkout sessions ────────────────────────────────────────────────────
  {
    name: "create_checkout_session",
    title: "Create checkout session",
    description:
      "Create a hosted checkout session for an amount (USD). Returns the session, including the hosted checkout `url` to send the payer to. POST /v1/checkout/sessions.",
    schema: {
      amount: z.number().positive().describe("Amount in USD, e.g. 25."),
      customer_id: z.string().optional(),
      invoice_id: z.string().optional(),
      payment_intent_id: z.string().optional(),
      plan_id: z
        .string()
        .optional()
        .describe("Plan id (byok $5 / pro $25 / max $100)."),
      success_url: z.string().url().optional(),
      cancel_url: z.string().url().optional(),
      callback_url: z
        .string()
        .url()
        .optional()
        .describe("Server-to-server payment notification URL."),
      metadata: metadata.optional(),
      expires_in_minutes: z.number().int().positive().optional(),
    },
    run: (client, args) =>
      client.createCheckoutSession(
        args as Parameters<PayClient["createCheckoutSession"]>[0],
      ),
  },
  {
    name: "get_checkout_session",
    title: "Get checkout session",
    description:
      "Retrieve a checkout session by id to check its status (open / complete / expired). GET /v1/checkout/sessions/:id.",
    schema: { id: z.string().describe("Checkout session id.") },
    run: (client, args) => client.getCheckoutSession(String(args.id)),
  },

  // ── Payment intents ──────────────────────────────────────────────────────
  {
    name: "create_payment_intent",
    title: "Create payment intent",
    description:
      "Create a payment intent for an amount (USD), optionally tied to a customer or invoice and a specific chain/token. POST /v1/payment_intents.",
    schema: {
      amount: z.number().positive().describe("Amount in USD, e.g. 25."),
      customer_id: z.string().optional(),
      invoice_id: z.string().optional(),
      chain_id: z
        .string()
        .optional()
        .describe("Chain identifier, e.g. base, ethereum, solana, ton."),
      token: z.string().optional().describe("Token symbol, e.g. USDC, USDT."),
      plan_id: z.string().optional(),
      description: z.string().optional(),
      metadata: metadata.optional(),
    },
    run: (client, args) =>
      client.createPaymentIntent(
        args as Parameters<PayClient["createPaymentIntent"]>[0],
      ),
  },
  {
    name: "get_payment_intent",
    title: "Get payment intent",
    description:
      "Retrieve a payment intent by id to confirm its payment status. GET /v1/payment_intents/:id.",
    schema: { id: z.string().describe("Payment intent id.") },
    run: (client, args) => client.getPaymentIntent(String(args.id)),
  },
  {
    name: "list_payment_intents",
    title: "List payment intents",
    description:
      "List payment intents, optionally filtered by customer or status. GET /v1/payment_intents.",
    schema: {
      customer_id: z.string().optional(),
      status: z.string().optional(),
      ...pagination,
    },
    run: (client, args) =>
      client.listPaymentIntents(
        args as Parameters<PayClient["listPaymentIntents"]>[0],
      ),
  },
  {
    name: "confirm_payment_intent",
    title: "Confirm payment intent",
    description:
      "Mark a payment intent as processing after a payment transaction was submitted, recording its tx hash / chain / token. POST /v1/payment_intents/:id/confirm.",
    schema: {
      id: z.string().describe("Payment intent id."),
      tx_hash: z.string().optional().describe("On-chain transaction hash."),
      chain_id: z.string().optional(),
      token: z.string().optional(),
    },
    run: (client, args) => {
      const { id, ...rest } = args;
      return client.confirmPaymentIntent(String(id), rest);
    },
  },

  // ── Customers ────────────────────────────────────────────────────────────
  {
    name: "create_customer",
    title: "Create customer",
    description:
      "Get-or-create a customer by identity: id_type is `tg` (Telegram) or `email`, uid is the Telegram user id or email address. POST /v1/customers.",
    schema: {
      id_type: z.enum(["tg", "email"]),
      uid: z.string().describe("Telegram user id or email address."),
      name: z.string().optional(),
      email: z.string().optional(),
      metadata: metadata.optional(),
    },
    run: (client, args) =>
      client.createCustomer(args as Parameters<PayClient["createCustomer"]>[0]),
  },
  {
    name: "get_customer",
    title: "Get customer",
    description: "Retrieve a customer by id. GET /v1/customers/:id.",
    schema: { id: z.string().describe("Customer id.") },
    run: (client, args) => client.getCustomer(String(args.id)),
  },
  {
    name: "list_customers",
    title: "List customers",
    description: "List customers (paginated). GET /v1/customers.",
    schema: { ...pagination },
    run: (client, args) =>
      client.listCustomers(args as Parameters<PayClient["listCustomers"]>[0]),
  },

  // ── Invoices ─────────────────────────────────────────────────────────────
  {
    name: "create_invoice",
    title: "Create invoice",
    description:
      "Create a draft invoice for a customer. Add line items with add_invoice_line_item, then finalize_invoice. POST /v1/invoices.",
    schema: {
      customer_id: z.string(),
      plan_id: z.string().optional(),
      description: z.string().optional(),
      footer: z.string().optional(),
      due_date: z.string().optional().describe("ISO date string."),
      metadata: metadata.optional(),
    },
    run: (client, args) =>
      client.createInvoice(args as Parameters<PayClient["createInvoice"]>[0]),
  },
  {
    name: "get_invoice",
    title: "Get invoice",
    description:
      "Retrieve an invoice by id; pass expand_line_items to include its line items. GET /v1/invoices/:id.",
    schema: {
      id: z.string().describe("Invoice id."),
      expand_line_items: z.boolean().optional(),
    },
    run: (client, args) =>
      client.getInvoice(String(args.id), Boolean(args.expand_line_items)),
  },
  {
    name: "list_invoices",
    title: "List invoices",
    description:
      "List invoices, optionally filtered by customer or status. GET /v1/invoices.",
    schema: {
      customer_id: z.string().optional(),
      status: z.string().optional(),
      ...pagination,
    },
    run: (client, args) =>
      client.listInvoices(args as Parameters<PayClient["listInvoices"]>[0]),
  },
  {
    name: "add_invoice_line_item",
    title: "Add invoice line item",
    description:
      "Add a line item (description + amount in USD) to a draft invoice. POST /v1/invoices/:id/line_items.",
    schema: {
      invoice_id: z.string(),
      description: z.string(),
      amount: z.number().describe("Amount in USD."),
      quantity: z.number().int().positive().optional(),
      metadata: metadata.optional(),
    },
    run: (client, args) => {
      const { invoice_id, ...rest } = args;
      return client.addInvoiceLineItem(
        String(invoice_id),
        rest as Parameters<PayClient["addInvoiceLineItem"]>[1],
      );
    },
  },
  {
    name: "finalize_invoice",
    title: "Finalize invoice",
    description:
      "Finalize a draft invoice so it can be paid. POST /v1/invoices/:id/finalize.",
    schema: { id: z.string().describe("Invoice id.") },
    run: (client, args) => client.finalizeInvoice(String(args.id)),
  },
  {
    name: "void_invoice",
    title: "Void invoice",
    description: "Void an invoice. POST /v1/invoices/:id/void.",
    schema: { id: z.string().describe("Invoice id.") },
    run: (client, args) => client.voidInvoice(String(args.id)),
  },

  // ── Events ───────────────────────────────────────────────────────────────
  {
    name: "list_events",
    title: "List events",
    description:
      "List webhook events emitted by the payments backend (e.g. payment completions), optionally filtered by event type. GET /v1/events.",
    schema: {
      type: z.string().optional().describe("Event type filter."),
      ...pagination,
    },
    run: (client, args) =>
      client.listEvents(args as Parameters<PayClient["listEvents"]>[0]),
  },
];

/** Bind every tool onto an MCP server, backed by the given API client. */
export function registerTools(server: McpServer, client: PayClient): void {
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.schema },
      async (args: Record<string, unknown>) => {
        try {
          const result = await tool.run(client, args);
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(result, null, 2) },
            ],
          };
        } catch (err) {
          const message =
            err instanceof PayApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err);
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    );
  }
}

// ── x402 payer tools (AgentPod #6451) ────────────────────────────────────────
// These pay ARBITRARY x402-priced URLs with the env-configured wallet, so
// they run against X402Payer, not the /v1 PayClient (no API key involved).

export interface X402ToolDef {
  name: string;
  title: string;
  description: string;
  schema: z.ZodRawShape;
  run: (payer: X402Payer, args: Record<string, unknown>) => Promise<unknown>;
}

const x402RequestShape = {
  url: z.string().url().describe("The x402-priced resource URL."),
  method: z
    .string()
    .optional()
    .describe("HTTP method (default POST)."),
  body: z
    .record(z.unknown())
    .optional()
    .describe("Optional JSON request body, forwarded verbatim."),
};

export const X402_TOOLS: X402ToolDef[] = [
  {
    name: "get_x402_payment_requirements",
    title: "Get x402 payment requirements",
    description:
      "Fetch a resource WITHOUT paying. If it answers 402, returns the parsed x402 payment requirements (accepts[]) from the PAYMENT-REQUIRED header or body; otherwise returns the response as-is. Signs nothing.",
    schema: { ...x402RequestShape },
    run: (payer, args) =>
      payer.getRequirements(String(args.url), {
        method: args.method as string | undefined,
        body: args.body,
      }),
  },
  {
    name: "pay_x402_resource",
    title: "Pay an x402-priced resource",
    description:
      "Fetch a resource; on 402, select its exact/EIP-3009 USDC requirement (Base Sepolia preferred; Base mainnet only when `network` names it explicitly), sign a transferWithAuthorization with the env wallet key, and retry with the payment header. Enforces the per-payment cap (AGENTLABS_PAY_X402_MAX_AMOUNT_ATOMIC, default 1 USDC; `max_amount_atomic` can only lower it). Returns the response plus the decoded settlement receipt.",
    schema: {
      ...x402RequestShape,
      max_amount_atomic: z
        .string()
        .optional()
        .describe("Per-call cap in atomic units (can only lower the env cap)."),
      network: z
        .string()
        .optional()
        .describe(
          "CAIP-2 network to pay on (eip155:84532 / eip155:8453). Mainnet is never auto-selected.",
        ),
    },
    run: (payer, args) =>
      payer.pay(String(args.url), {
        method: args.method as string | undefined,
        body: args.body,
        maxAmountAtomic: args.max_amount_atomic as string | undefined,
        network: args.network as string | undefined,
      }),
  },
  {
    name: "x402_wallet_info",
    title: "x402 wallet info",
    description:
      "Return the x402 payer wallet's address and its Base Sepolia USDC balance (atomic units) — use it to confirm faucet funds landed before paying. Never returns key material.",
    schema: {},
    run: (payer) => payer.walletInfo(),
  },
];

/** Bind the x402 payer tools onto an MCP server. */
export function registerX402Tools(server: McpServer, payer: X402Payer): void {
  for (const tool of X402_TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.schema },
      async (args: Record<string, unknown>) => {
        try {
          const result = await tool.run(payer, args);
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(result, null, 2) },
            ],
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: err instanceof Error ? err.message : String(err),
              },
            ],
          };
        }
      },
    );
  }
}
