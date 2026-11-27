import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DB } from "../src/db.js";

// ── Env vars must be set BEFORE importing server.ts ──────────────────────────
process.env.DATABASE_URL = ["postgres://test", "localhost/test"].join("@");
process.env.API_KEY = "test-api-key";
process.env.CALLBACK_SECRET = "test-callback-secret";
process.env.CHECKOUT_SECRET = "test-checkout-secret";
process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
process.env.WALLET_BASE = "0x1111111111111111111111111111111111111111";
process.env.WALLET_BASE_SEPOLIA = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
process.env.WALLET_ETH = "0x2222222222222222222222222222222222222222";
process.env.WALLET_TON = "EQTestTonWallet";
process.env.WALLET_SOL = "TestSolWallet";
process.env.PORT = "0";
process.env.X402_ENABLED = "true";
// X402_NETWORK / X402_PRICE_ATOMIC left at defaults: eip155:84532 / 10000.

// ── Mock @hono/node-server to prevent actual server start ────────────────────
vi.mock("@hono/node-server", () => ({
  serve: vi.fn(),
}));

vi.mock("@hono/node-server/serve-static", () => ({
  serveStatic: () => async (_c: any, next: any) => next(),
}));

import { createMockPool } from "./mock-pool.js";

const { createApp } = await import("../src/server.js");

const PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const PAYER = "0x1234567890AbcdEF1234567890aBcdef12345678";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const TX_HASH = `0x${"ab".repeat(32)}`;

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function authorization(overrides: Record<string, string> = {}) {
  return {
    from: PAYER,
    to: PAY_TO,
    value: "10000",
    validAfter: "0",
    validBefore: String(Math.floor(Date.now() / 1000) + 300),
    nonce: `0x${"cd".repeat(32)}`,
    ...overrides,
  };
}

function v2Header(overrides: Record<string, string> = {}): string {
  return b64({
    x402Version: 2,
    resource: {
      url: "https://pay.openclaw.ai/x402/checkout",
      description: "Create a Pay by AgentLabs hosted checkout session",
      mimeType: "application/json",
    },
    accepted: {
      scheme: "exact",
      network: "eip155:84532",
      amount: "10000",
      asset: USDC_BASE_SEPOLIA,
      payTo: PAY_TO,
      maxTimeoutSeconds: 300,
      extra: { name: "USDC", version: "2", assetTransferMethod: "eip3009" },
    },
    payload: { signature: "0xsignature", authorization: authorization(overrides) },
    extensions: {},
  });
}

function v1Header(overrides: Record<string, string> = {}): string {
  return b64({
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    payload: { signature: "0xsignature", authorization: authorization(overrides) },
  });
}

// ── Facilitator stub ─────────────────────────────────────────────────────────
// The route's only outbound calls are the facilitator's /verify + /settle.

interface FacilitatorBehavior {
  verify?: Record<string, unknown> | Error | Response;
  settle?: Record<string, unknown> | Error | Response;
}

function stubFacilitator(behavior: FacilitatorBehavior) {
  const calls: { path: string; body: any }[] = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const path = u.endsWith("/verify")
      ? "/verify"
      : u.endsWith("/settle")
        ? "/settle"
        : "";
    if (!path) throw new Error(`Unexpected fetch to ${u}`);
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ path, body });
    const outcome = path === "/verify" ? behavior.verify : behavior.settle;
    if (outcome instanceof Error) throw outcome;
    if (outcome instanceof Response) return outcome;
    return new Response(JSON.stringify(outcome ?? {}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const OK_VERIFY = { isValid: true, payer: PAYER };
const OK_SETTLE = {
  success: true,
  transaction: TX_HASH,
  network: "eip155:84532",
  payer: PAYER,
};

describe("POST /x402/checkout", () => {
  let app: ReturnType<typeof createApp>;
  let mockDb: DB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockPool();
    app = createApp(mockDb);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a spec-shaped 402 when unpaid", async () => {
    const res = await app.request("/x402/checkout", { method: "POST" });
    expect(res.status).toBe(402);

    const body = await res.json();
    expect(body.x402Version).toBe(2);
    expect(body.resource.url).toContain("/x402/checkout");
    expect(body.accepts).toHaveLength(1);
    const req = body.accepts[0];
    expect(req.scheme).toBe("exact");
    expect(req.network).toBe("eip155:84532");
    expect(req.amount).toBe("10000");
    expect(req.asset).toBe(USDC_BASE_SEPOLIA);
    expect(req.payTo).toBe(PAY_TO);
    expect(req.maxTimeoutSeconds).toBe(300);
    expect(req.extra).toMatchObject({ name: "USDC", version: "2" });

    const header = res.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    const decoded = JSON.parse(
      Buffer.from(header!, "base64").toString("utf8"),
    );
    expect(decoded).toEqual(body);
  });

  it("rejects a malformed payment header with a fresh 402", async () => {
    const res = await app.request("/x402/checkout", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": "not-base64-json!!!" },
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toContain("base64");
  });

  it("rejects an authorization whose amount differs from the requirement, without calling the facilitator", async () => {
    const calls = stubFacilitator({ verify: OK_VERIFY, settle: OK_SETTLE });
    const res = await app.request("/x402/checkout", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": v2Header({ value: "9999" }) },
    });
    expect(res.status).toBe(402);
    expect(calls).toHaveLength(0);
  });

  it("settles before creating: valid v2 payment → 200 + session + receipt + audit event", async () => {
    const calls = stubFacilitator({ verify: OK_VERIFY, settle: OK_SETTLE });
    const res = await app.request("/x402/checkout", {
      method: "POST",
      headers: {
        "PAYMENT-SIGNATURE": v2Header(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ plan_id: "pro" }),
    });
    expect(res.status).toBe(200);

    // Facilitator saw verify then settle with the same v2 body.
    expect(calls.map((c) => c.path)).toEqual(["/verify", "/settle"]);
    expect(calls[0].body.x402Version).toBe(2);
    expect(calls[0].body.paymentRequirements.network).toBe("eip155:84532");
    expect(calls[0].body.paymentRequirements.amount).toBe("10000");

    // Settlement receipt header.
    const receipt = JSON.parse(
      Buffer.from(res.headers.get("PAYMENT-RESPONSE")!, "base64").toString(
        "utf8",
      ),
    );
    expect(receipt).toEqual({
      success: true,
      transaction: TX_HASH,
      network: "eip155:84532",
      payer: PAYER,
    });

    // The created checkout session, in the /v1 shape.
    const session = await res.json();
    expect(session.status).toBe("open");
    expect(session.url).toContain(`/checkout/${session.stripe_id}`);
    expect(session.amount).toBeCloseTo(0.01);

    // The payment intent carries the settlement.
    const piRes = await app.request(
      `/v1/payment_intents/${session.payment_intent_id}`,
      { headers: { "x-api-key": "test-api-key" } },
    );
    expect(piRes.status).toBe(200);
    const pi = await piRes.json();
    expect(pi.status).toBe("succeeded");
    expect(pi.tx_hash).toBe(TX_HASH);
    expect(pi.from_address).toBe(PAYER);
    expect(pi.to_address).toBe(PAY_TO);
    expect(pi.chain_id).toBe("base_sepolia");
    expect(pi.metadata.x402).toBe(true);

    // The audit event is in the events log.
    const evRes = await app.request("/v1/events?type=x402.payment.settled", {
      headers: { "x-api-key": "test-api-key" },
    });
    const events = await evRes.json();
    expect(events.data).toHaveLength(1);
    expect(events.data[0].data.transaction).toBe(TX_HASH);
  });

  it("accepts a v1 X-PAYMENT header and answers with X-PAYMENT-RESPONSE", async () => {
    const calls = stubFacilitator({ verify: OK_VERIFY, settle: OK_SETTLE });
    const res = await app.request("/x402/checkout", {
      method: "POST",
      headers: { "X-PAYMENT": v1Header() },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-PAYMENT-RESPONSE")).toBeTruthy();
    expect(calls[0].body.x402Version).toBe(1);
    expect(calls[0].body.paymentRequirements.network).toBe("base-sepolia");
    expect(calls[0].body.paymentRequirements.maxAmountRequired).toBe("10000");
  });

  it("verify failure → fresh 402 with the facilitator's reason, nothing created", async () => {
    stubFacilitator({
      verify: { isValid: false, invalidReason: "insufficient_funds", payer: PAYER },
      settle: OK_SETTLE,
    });
    const res = await app.request("/x402/checkout", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": v2Header() },
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("insufficient_funds");

    const evRes = await app.request("/v1/events?type=x402.payment.settled", {
      headers: { "x-api-key": "test-api-key" },
    });
    const events = await evRes.json();
    expect(events.data).toHaveLength(0);
    const piList = await (
      await app.request("/v1/payment_intents", {
        headers: { "x-api-key": "test-api-key" },
      })
    ).json();
    expect(piList.data).toHaveLength(0);
  });

  it("settle failure (incl. settlement_pending) → 402, nothing created", async () => {
    stubFacilitator({
      verify: OK_VERIFY,
      settle: {
        success: false,
        errorReason: "settlement_pending",
        transaction: TX_HASH,
        network: "eip155:84532",
        payer: PAYER,
      },
    });
    const res = await app.request("/x402/checkout", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": v2Header() },
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("settlement_pending");

    const evRes = await app.request("/v1/events?type=x402.payment.settled", {
      headers: { "x-api-key": "test-api-key" },
    });
    const events = await evRes.json();
    expect(events.data).toHaveLength(0);
    // Settle-before-create: no payment intent (hence no session) exists.
    const piList = await (
      await app.request("/v1/payment_intents", {
        headers: { "x-api-key": "test-api-key" },
      })
    ).json();
    expect(piList.data).toHaveLength(0);
  });

  it("facilitator unreachable → 502 facilitator_unavailable", async () => {
    stubFacilitator({ verify: new Error("ECONNREFUSED"), settle: OK_SETTLE });
    const res = await app.request("/x402/checkout", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": v2Header() },
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("facilitator_unavailable");
  });

  it("settle unreachable → 502 facilitator_unavailable, nothing created", async () => {
    stubFacilitator({ verify: OK_VERIFY, settle: new Error("ETIMEDOUT") });
    const res = await app.request("/x402/checkout", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": v2Header() },
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("facilitator_unavailable");
    const piList = await (
      await app.request("/v1/payment_intents", {
        headers: { "x-api-key": "test-api-key" },
      })
    ).json();
    expect(piList.data).toHaveLength(0);
  });

  it("facilitator HTTP 500 → 502 facilitator_unavailable", async () => {
    stubFacilitator({
      verify: new Response("internal error", { status: 500 }),
      settle: OK_SETTLE,
    });
    const res = await app.request("/x402/checkout", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": v2Header() },
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("facilitator_unavailable");
  });
});
