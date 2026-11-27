import { describe, expect, it } from "vitest";
import type { PayClient } from "../src/client.js";
import { TOOLS } from "../src/tools.js";

const EXPECTED_TOOLS = [
  "create_checkout_session",
  "get_checkout_session",
  "create_payment_intent",
  "get_payment_intent",
  "list_payment_intents",
  "confirm_payment_intent",
  "create_customer",
  "get_customer",
  "list_customers",
  "create_invoice",
  "get_invoice",
  "list_invoices",
  "add_invoice_line_item",
  "finalize_invoice",
  "void_invoice",
  "list_events",
];

/** A PayClient double that records which method each tool invoked. */
function recordingClient() {
  const calls: { method: string; args: unknown[] }[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve({ recorded: method });
    };
  const client = {
    createCheckoutSession: record("createCheckoutSession"),
    getCheckoutSession: record("getCheckoutSession"),
    createPaymentIntent: record("createPaymentIntent"),
    getPaymentIntent: record("getPaymentIntent"),
    listPaymentIntents: record("listPaymentIntents"),
    confirmPaymentIntent: record("confirmPaymentIntent"),
    createCustomer: record("createCustomer"),
    getCustomer: record("getCustomer"),
    listCustomers: record("listCustomers"),
    createInvoice: record("createInvoice"),
    getInvoice: record("getInvoice"),
    listInvoices: record("listInvoices"),
    addInvoiceLineItem: record("addInvoiceLineItem"),
    finalizeInvoice: record("finalizeInvoice"),
    voidInvoice: record("voidInvoice"),
    listEvents: record("listEvents"),
  } as unknown as PayClient;
  return { client, calls };
}

function tool(name: string) {
  const found = TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`tool ${name} missing`);
  return found;
}

describe("TOOLS", () => {
  it("exposes exactly the tools backed by live /v1 endpoints", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("create_checkout_session forwards its arguments to the client", async () => {
    const { client, calls } = recordingClient();
    const input = { amount: 25, plan_id: "pro", success_url: "https://x.test/ok" };
    await tool("create_checkout_session").run(client, input);
    expect(calls).toEqual([{ method: "createCheckoutSession", args: [input] }]);
  });

  it("confirm_payment_intent splits id from the confirm body", async () => {
    const { client, calls } = recordingClient();
    await tool("confirm_payment_intent").run(client, {
      id: "pi_1",
      tx_hash: "0xabc",
      chain_id: "base",
    });
    expect(calls).toEqual([
      {
        method: "confirmPaymentIntent",
        args: ["pi_1", { tx_hash: "0xabc", chain_id: "base" }],
      },
    ]);
  });

  it("add_invoice_line_item splits invoice_id from the item body", async () => {
    const { client, calls } = recordingClient();
    await tool("add_invoice_line_item").run(client, {
      invoice_id: "in_1",
      description: "Pro plan",
      amount: 25,
      quantity: 1,
    });
    expect(calls).toEqual([
      {
        method: "addInvoiceLineItem",
        args: ["in_1", { description: "Pro plan", amount: 25, quantity: 1 }],
      },
    ]);
  });

  it("get_invoice maps expand_line_items to the expand flag", async () => {
    const { client, calls } = recordingClient();
    await tool("get_invoice").run(client, { id: "in_9", expand_line_items: true });
    expect(calls).toEqual([{ method: "getInvoice", args: ["in_9", true] }]);
  });

  it("every tool has a description naming its API route", () => {
    for (const t of TOOLS) {
      expect(t.description).toMatch(/\/v1\//);
    }
  });
});
