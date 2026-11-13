import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import type { DB, PaymentRecord } from "../src/db.js";

// ── Env vars must be set BEFORE importing server.ts ──────────────────────────
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.API_KEY = "test-api-key";
process.env.CALLBACK_SECRET = "test-callback-secret";
process.env.CHECKOUT_SECRET = "test-callback-secret";
process.env.TELEGRAM_BOT_TOKEN = "123456:TestBotToken";
process.env.WALLET_BASE = "0xTestBaseWallet";
process.env.WALLET_ETH = "0xTestEthWallet";
process.env.WALLET_TON = "EQTestTonWallet";
process.env.WALLET_SOL = "TestSolWallet";
process.env.PORT = "0";

// ── Mock @hono/node-server to prevent actual server start ────────────────────
vi.mock("@hono/node-server", () => ({
  serve: vi.fn(),
}));

vi.mock("@hono/node-server/serve-static", () => ({
  serveStatic: () => async (_c: any, next: any) => next(),
}));

// ── Mock verify to avoid real RPC calls ──────────────────────────────────────
vi.mock("../src/verify.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/verify.js")>();
  return {
    ...actual,
    verifyTransfer: vi.fn(),
  };
});

// ── Mock pg Pool (in-memory) ─────────────────────────────────────────────────
// The db layer issues parameterized SQL against a `pg` Pool; the fake Pool in
// ./mock-pool.js answers those statements from in-memory tables.

import { createMockPool } from "./mock-pool.js";

// ── Import after env + mocks are set ─────────────────────────────────────────
const { createApp } = await import("../src/server.js");
const { verifyTransfer } = await import("../src/verify.js");
const mockedVerifyTransfer = vi.mocked(verifyTransfer);

function signCheckoutIntent(params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  const canonical = [...searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  return createHmac("sha256", "test-callback-secret")
    .update(canonical)
    .digest("hex");
}

function buildSignedCheckoutBody(params: Record<string, string>): Record<string, string> {
  return {
    ...params,
    sig: signCheckoutIntent(params),
  };
}

describe("Server API", () => {
  let app: ReturnType<typeof createApp>;
  let mockDb: DB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockPool();
    app = createApp(mockDb);
  });

  // ── Health ──

  describe("GET /api/health", () => {
    it("returns ok", async () => {
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.chains).toContain("base");
    });
  });

  // ── TonConnect manifest ──

  describe("GET /tonconnect-manifest.json", () => {
    it("returns TonConnect manifest with required fields", async () => {
      const res = await app.request("/tonconnect-manifest.json");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("OpenClaw Crypto Payments");
      expect(body.url).toBeTruthy();
      expect(body.iconUrl).toContain("favicon");
    });
  });

  // ── Config ──

  describe("GET /api/config", () => {
    it("returns wallets and prices", async () => {
      const res = await app.request("/api/config");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.wallets).toBeDefined();
      expect(body.prices.byok).toBe(5);
      expect(body.prices.starter).toBe(5);
      expect(body.prices.pro).toBe(25);
      expect(body.prices.max).toBe(100);
      expect(body.chains).toEqual(["base", "eth", "ton", "sol", "base_sepolia", "eth_sepolia"]);
    });

    it("returns wallet addresses for all chains", async () => {
      const res = await app.request("/api/config");
      const body = await res.json();
      expect(body.wallets.base).toBe("0xTestBaseWallet");
      expect(body.wallets.eth).toBe("0xTestEthWallet");
      expect(body.wallets.ton).toBe("EQTestTonWallet");
      expect(body.wallets.sol).toBe("TestSolWallet");
      // base_sepolia falls back to WALLET_BASE when WALLET_BASE_SEPOLIA is not set
      expect(body.wallets.base_sepolia).toBe("0xTestBaseWallet");
    });

    it("returns TOKEN_ADDRESSES for all chains", async () => {
      const res = await app.request("/api/config");
      const body = await res.json();
      expect(body.tokens).toBeDefined();
      // Verify all 5 chains have usdt + usdc entries
      for (const chain of ["base", "eth", "ton", "sol", "base_sepolia", "eth_sepolia"]) {
        expect(body.tokens[chain]).toBeDefined();
        expect(body.tokens[chain].usdt).toBeDefined();
        expect(body.tokens[chain].usdc).toBeDefined();
      }
      // Spot-check known contract addresses
      expect(body.tokens.base.usdc).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      expect(body.tokens.base_sepolia.usdc).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    });
  });

  // ── Root route (API info — HTML moved to SPA) ──

  describe("GET /", () => {
    it("returns JSON API info", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body.service).toBe("OpenClaw Crypto Payments API");
      expect(body.docs).toBe("/api/config");
    });
  });

  describe("GET /pay", () => {
    it("returns JSON redirect notice", async () => {
      const res = await app.request("/pay?plan=starter&uid=123");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body.message).toContain("SPA");
    });
  });

  // ── POST /api/payment ──

  describe("POST /api/payment", () => {
    it("rejects missing txHash", async () => {
      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "123",
          apiKey: "test-api-key",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("txHash");
    });

    it("rejects invalid chainId", async () => {
      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xabc",
          chainId: "invalid",
          token: "usdc",
          idType: "tg",
          uid: "123",
          apiKey: "test-api-key",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("chainId");
    });

    it("rejects invalid API key", async () => {
      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xabc",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "123",
          apiKey: "wrong-key",
        }),
      });
      expect(res.status).toBe(401);
    });

    it("submits payment and verifies on-chain (success)", async () => {
      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "5000000",
        amountUsd: 5,
        token: "usdc",
        blockNumber: 12345,
        txHash: "0xvalidtx1",
      });

      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xvalidtx1",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          plan: "byok",
          apiKey: "test-api-key",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.payment.status).toBe("verified");
      expect(body.payment.amount_usd).toBe(5);
      expect(body.payment.plan_id).toBe("byok");
      // Payment IDs are now stripe-style pi_... strings
      expect(body.payment.id).toMatch(/^pi_/);
    });

    it("returns 409 for duplicate tx submission", async () => {
      // First, submit a valid payment
      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "10000000",
        amountUsd: 10,
        token: "usdc",
        blockNumber: 12345,
        txHash: "0xduplicatetx",
      });

      await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xduplicatetx",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          apiKey: "test-api-key",
        }),
      });

      // Then submit the same tx again
      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xduplicatetx",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          apiKey: "test-api-key",
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("already submitted");
    });

    it("marks payment failed when verification returns null", async () => {
      mockedVerifyTransfer.mockResolvedValueOnce(null);

      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xnotfound",
          chainId: "eth",
          token: "usdt",
          idType: "tg",
          uid: "42",
          apiKey: "test-api-key",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("not found");
      expect(body.payment.status).toBe("failed");
    });

    it("handles verification error gracefully", async () => {
      mockedVerifyTransfer.mockRejectedValueOnce(new Error("RPC timeout"));

      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xrpcfail",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          apiKey: "test-api-key",
        }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("RPC timeout");
      expect(body.payment.status).toBe("failed");
    });

    it("accepts base_sepolia as valid chainId", async () => {
      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "5000000",
        amountUsd: 5,
        token: "usdc",
        blockNumber: 54321,
        txHash: "0xsepolia_tx",
      });

      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xsepolia_tx",
          chainId: "base_sepolia",
          token: "usdc",
          idType: "tg",
          uid: "42",
          plan: "byok",
          apiKey: "test-api-key",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.payment.status).toBe("verified");
      expect(body.payment.chain_id).toBe("base_sepolia");
    });

    it("resolves plan from amount when not specified", async () => {
      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "25000000",
        amountUsd: 25,
        token: "usdt",
        blockNumber: 99999,
        txHash: "0xpro_plan_tx",
      });

      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xpro_plan_tx",
          chainId: "base",
          token: "usdt",
          idType: "tg",
          uid: "42",
          apiKey: "test-api-key",
          // no plan specified — should be resolved from amount
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.payment.plan_id).toBe("pro");
    });

    it("rejects missing uid", async () => {
      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xabc",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "",
          apiKey: "test-api-key",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("uid");
    });

    it("rejects missing idType", async () => {
      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xabc",
          chainId: "base",
          token: "usdc",
          uid: "123",
          apiKey: "test-api-key",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("idType");
    });

    it("rejects invalid token value", async () => {
      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xabc",
          chainId: "base",
          token: "dai",
          idType: "tg",
          uid: "123",
          apiKey: "test-api-key",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("token");
    });

    it("defaults token to usdt when not specified", async () => {
      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "5000000",
        amountUsd: 5,
        token: "usdt",
        blockNumber: 12345,
        txHash: "0xdefault_token_tx",
      });

      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xdefault_token_tx",
          chainId: "base",
          // no token field
          idType: "tg",
          uid: "42",
          plan: "byok",
          apiKey: "test-api-key",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.payment.status).toBe("verified");
      expect(body.payment.token).toBe("usdt");
    });

    it("rejects payment submission without auth or signed checkout intent", async () => {
      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xnoauth_tx",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          plan: "starter",
          // no apiKey, no initData
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Authentication required");
      expect(mockedVerifyTransfer).not.toHaveBeenCalled();
    });

    it("accepts a valid signed checkout intent without exposing an API key", async () => {
      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "10000000",
        amountUsd: 10,
        token: "usdc",
        blockNumber: 12345,
        txHash: "0xsigned_intent_tx",
      });

      const checkout = buildSignedCheckoutBody({
        plan: "starter",
        uid: "42",
        idtype: "tg",
        amountUsd: "10.00",
        exp: String(Math.floor(Date.now() / 1000) + 600),
      });

      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xsigned_intent_tx",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          plan: "starter",
          amountUsd: checkout.amountUsd,
          exp: checkout.exp,
          sig: checkout.sig,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.payment.status).toBe("verified");
      expect(body.payment.plan_id).toBe("starter");
    });

    it("rejects signed checkout amount mismatches", async () => {
      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "10000000",
        amountUsd: 10,
        token: "usdc",
        blockNumber: 12345,
        txHash: "0xsigned_mismatch_tx",
      });

      const checkout = buildSignedCheckoutBody({
        plan: "max",
        uid: "42",
        idtype: "tg",
        amountUsd: "100.00",
        exp: String(Math.floor(Date.now() / 1000) + 600),
      });

      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xsigned_mismatch_tx",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          plan: "max",
          amountUsd: checkout.amountUsd,
          exp: checkout.exp,
          sig: checkout.sig,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Verified amount does not match requested plan");
      expect(body.payment.status).toBe("failed");
    });

    it("accepts signed VPS/team amounts outside the base plan price table", async () => {
      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "105000000",
        amountUsd: 105,
        token: "usdc",
        blockNumber: 12345,
        txHash: "0xvps_team_tx",
      });

      const checkout = buildSignedCheckoutBody({
        plan: "max",
        uid: "42",
        idtype: "tg",
        amountUsd: "105.00",
        exp: String(Math.floor(Date.now() / 1000) + 600),
        tenantType: "team",
        tenant: "team",
        vmp: "hetzner",
        hostType: "vps",
      });

      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xvps_team_tx",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          plan: "max",
          amountUsd: checkout.amountUsd,
          tenantType: "team",
          vmProvider: "hetzner",
          hostType: "vps",
          exp: checkout.exp,
          sig: checkout.sig,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.payment.status).toBe("verified");
      expect(body.payment.plan_id).toBe("max");
    });
  });

  // ── GET /api/payment/:id ──

  describe("GET /api/payment/:id", () => {
    it("rejects without API key", async () => {
      const res = await app.request("/api/payment/pi_test123");
      expect(res.status).toBe(401);
    });

    it("returns payment by ID with valid API key", async () => {
      // First create a payment
      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "10000000",
        amountUsd: 10,
        token: "usdc",
        blockNumber: 12345,
        txHash: "0xfetchme",
      });

      const createRes = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xfetchme",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "100",
          apiKey: "test-api-key",
        }),
      });
      const created = await createRes.json();
      const paymentId = created.payment.id;

      const res = await app.request(
        `/api/payment/${paymentId}?api_key=test-api-key`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.payment).toBeDefined();
      expect(body.payment.id).toBe(paymentId);
    });

    it("returns 404 for non-existent payment", async () => {
      const res = await app.request(
        "/api/payment/pi_nonexistent?api_key=test-api-key",
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid ID", async () => {
      const res = await app.request("/api/payment/abc?api_key=test-api-key");
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/payments ──

  describe("GET /api/payments", () => {
    it("rejects without API key", async () => {
      const res = await app.request("/api/payments?idtype=tg&uid=42");
      expect(res.status).toBe(401);
    });

    it("requires idtype and uid params", async () => {
      const res = await app.request("/api/payments?api_key=test-api-key");
      expect(res.status).toBe(400);
    });

    it("returns user payments", async () => {
      // Create a payment first
      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "10000000",
        amountUsd: 10,
        token: "usdc",
        blockNumber: 12345,
        txHash: "0xlistme",
      });

      await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xlistme",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          apiKey: "test-api-key",
        }),
      });

      const res = await app.request(
        "/api/payments?idtype=tg&uid=42&api_key=test-api-key",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.payments).toBeDefined();
      expect(Array.isArray(body.payments)).toBe(true);
      expect(body.payments.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── GET /checkout/:id ──

  describe("GET /checkout/:id", () => {
    it("returns 404 for non-existent checkout session", async () => {
      const res = await app.request("/checkout/cs_nonexistent");
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toContain("not found");
    });

    it("returns 410 for expired checkout session", async () => {
      // Seed an expired session directly into the mock DB
      await mockDb.query(
        'INSERT INTO "checkout_sessions" ("stripe_id", "status", "amount", "plan_id", "url", "expires_at", "metadata") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        ["cs_expired_test", "expired", 1000, "starter", "http://test/checkout/cs_expired_test", new Date(Date.now() - 60000).toISOString(), {}],
      );

      const res = await app.request("/checkout/cs_expired_test");
      expect(res.status).toBe(410);
      const text = await res.text();
      expect(text).toContain("expired");
    });

    it("returns 200 with completion text for completed session", async () => {
      await mockDb.query(
        'INSERT INTO "checkout_sessions" ("stripe_id", "status", "amount", "plan_id", "url", "expires_at", "completed_at", "metadata") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        ["cs_complete_test", "complete", 2500, "pro", "http://test/checkout/cs_complete_test", new Date(Date.now() + 60000).toISOString(), new Date().toISOString(), {}],
      );

      const res = await app.request("/checkout/cs_complete_test");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("already been completed");
    });

    it("returns JSON checkout session data for valid open session", async () => {
      await mockDb.query(
        'INSERT INTO "checkout_sessions" ("stripe_id", "status", "amount", "plan_id", "url", "expires_at", "metadata") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        ["cs_open_test", "open", 1000, "starter", "http://test/checkout/cs_open_test", new Date(Date.now() + 1800000).toISOString(), {}],
      );

      const res = await app.request("/checkout/cs_open_test");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body.id).toBe("cs_open_test");
      expect(body.amount).toBe(1000);
      expect(body.plan_id).toBe("starter");
      expect(body.status).toBe("open");
    });
  });

  // ── Callback webhook ──

  describe("Callback webhook", () => {
    it("sends POST with HMAC signature when callbackUrl is provided", async () => {
      // Capture the global fetch calls
      const originalFetch = globalThis.fetch;
      const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
      globalThis.fetch = vi.fn(async (url: any, init?: any) => {
        fetchCalls.push({ url: String(url), init });
        return new Response("OK", { status: 200 });
      }) as any;

      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "10000000",
        amountUsd: 10,
        token: "usdc",
        blockNumber: 12345,
        txHash: "0xcallback_tx",
      });

      const res = await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xcallback_tx",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          plan: "starter",
          apiKey: "test-api-key",
          callbackUrl: "https://bot.example.com/webhook",
          topup: "medium",
          tenantType: "team",
          vmProvider: "hetzner",
          hostType: "vps",
        }),
      });

      expect(res.status).toBe(200);

      // The callback is fired async (sendCallback().catch()), give it a tick
      await new Promise((r) => setTimeout(r, 100));

      // Find the callback fetch (not the /api/payment request itself)
      const callbackCall = fetchCalls.find(
        (c) => c.url === "https://bot.example.com/webhook",
      );
      expect(callbackCall).toBeDefined();
      expect(callbackCall!.init.method).toBe("POST");

      // Verify headers
      const headers = callbackCall!.init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-Signature"]).toBeDefined();
      expect(headers["X-Signature"]).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
      expect(headers["X-Timestamp"]).toBeDefined();
      expect(Number(headers["X-Timestamp"])).toBeGreaterThan(0);

      // Verify body
      const body = JSON.parse(callbackCall!.init.body as string);
      expect(body.event).toBe("payment.verified");
      expect(body.payment).toBeDefined();
      expect(body.payment.txHash).toBe("0xcallback_tx");
      expect(body.payment.chain).toBe("base");
      expect(body.payment.token).toBe("usdc");
      expect(body.payment.amountUsd).toBe(10);
      expect(body.payment.plan).toBe("starter");
      expect(body.payment.topup).toBe("medium");
      expect(body.payment.tenantType).toBe("team");
      expect(body.payment.vmProvider).toBe("hetzner");
      expect(body.payment.hostType).toBe("vps");
      expect(body.payment.uid).toBe("42");
      expect(body.payment.idType).toBe("tg");
      expect(body.timestamp).toBeDefined();

      // Restore original fetch
      globalThis.fetch = originalFetch;
    });

    it("does NOT send callback when callbackUrl is not provided", async () => {
      const originalFetch = globalThis.fetch;
      const fetchCalls: Array<{ url: string }> = [];
      globalThis.fetch = vi.fn(async (url: any, init?: any) => {
        fetchCalls.push({ url: String(url) });
        return new Response("OK", { status: 200 });
      }) as any;

      mockedVerifyTransfer.mockResolvedValueOnce({
        from: "0xSender",
        to: "0xTestBaseWallet",
        amountRaw: "10000000",
        amountUsd: 10,
        token: "usdc",
        blockNumber: 12345,
        txHash: "0xno_callback_tx",
      });

      await app.request("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: "0xno_callback_tx",
          chainId: "base",
          token: "usdc",
          idType: "tg",
          uid: "42",
          plan: "starter",
          apiKey: "test-api-key",
          // no callbackUrl
        }),
      });

      await new Promise((r) => setTimeout(r, 100));

      // The db layer no longer uses fetch (pg Pool, #6101), so every recorded
      // fetch would be a webhook callback attempt — there must be none.
      expect(fetchCalls.length).toBe(0);

      globalThis.fetch = originalFetch;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E FLOW: Link generation → Page load → Wallet UI verification
  // ═══════════════════════════════════════════════════════════════════════════

  describe("E2E: payment link → wallet connect flow", () => {
    // HTML rendering moved to separate SPA. These tests verify the API
    // endpoints that the SPA consumes.

    it("GET /pay returns JSON (HTML moved to SPA)", async () => {
      const url = "/pay?plan=pro&uid=12345678&callback=https%3A%2F%2Fbot.example.com%2Fwebhook";
      const res = await app.request(url);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body.message).toContain("SPA");
    });

    it("config endpoint returns token addresses used by wallet connect", async () => {
      const res = await app.request("/api/config");
      expect(res.status).toBe(200);
      const body = await res.json();

      // Wallet addresses for each chain
      expect(body.wallets.base).toBe("0xTestBaseWallet");
      expect(body.wallets.eth).toBe("0xTestEthWallet");
      expect(body.wallets.ton).toBe("EQTestTonWallet");
      expect(body.wallets.sol).toBe("TestSolWallet");

      // Token contract addresses the JS uses for ERC-20 transfer()
      expect(body.tokens.base.usdc).toBeTruthy();
      expect(body.tokens.base.usdt).toBeTruthy();
      expect(body.tokens.eth.usdc).toBeTruthy();
      expect(body.tokens.sol.usdc).toBeTruthy();
      expect(body.tokens.ton.usdc).toBeTruthy();
      expect(body.tokens.base_sepolia.usdc).toBeTruthy();

      // Prices for plan matching
      expect(body.prices.byok).toBe(5);
      expect(body.prices.starter).toBe(5);
      expect(body.prices.pro).toBe(25);
      expect(body.prices.max).toBe(100);
    });

    it("checkout endpoint returns JSON session data when session is open", async () => {
      // Create a checkout session first (amount in cents)
      const createRes = await app.request("/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-api-key",
        },
        body: JSON.stringify({
          amount: 1000,
          plan_id: "starter",
        }),
      });
      expect(createRes.status).toBe(200);
      const session = await createRes.json();
      // The session object has stripe_id (cs_...) which is the public-facing ID
      expect(session.stripe_id).toMatch(/^cs_/);

      // Load the checkout endpoint using the stripe_id (public URL format)
      const checkoutRes = await app.request(`/checkout/${session.stripe_id}`);
      expect(checkoutRes.status).toBe(200);
      expect(checkoutRes.headers.get("content-type")).toContain("application/json");
      const body = await checkoutRes.json();
      expect(body.id).toBe(session.stripe_id);
      expect(body.amount).toBe(1000);
      expect(body.plan_id).toBe("starter");
      expect(body.status).toBe("open");
    });
  });
});
