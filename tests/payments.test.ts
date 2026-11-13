import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveplan } from "../src/verify.js";
import type { DB, PaymentRecord, CustomerRecord, PaymentIntentRecord } from "../src/db.js";
import { createMockPool } from "./mock-pool.js";

// ── Mock pg Pool ─────────────────────────────────────────────────────────────
// The db layer issues parameterized SQL against a `pg` Pool; the fake Pool in
// ./mock-pool.js answers those statements from in-memory tables, so the
// legacy compatibility layer is tested in isolation (no live Postgres).

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Database (mocked pg Pool)", () => {
  let db: DB;
  let mod: typeof import("../src/db.js");

  beforeEach(async () => {
    db = createMockPool();
    mod = await import("../src/db.js");
  });

  it("inserts and retrieves a payment", async () => {
    const payment = await mod.insertPayment(db, {
      idType: "tg",
      uid: "123456",
      txHash: "0xabc123",
      chainId: "base",
      token: "usdc",
      amountRaw: "10000000",
      amountUsd: 10,
    });

    expect(payment.id).toBeDefined();
    expect(payment.status).toBe("pending");
    expect(payment.id_type).toBe("tg");
    expect(payment.uid).toBe("123456");
    expect(payment.chain_id).toBe("base");

    const fetched = await mod.getPaymentById(db, payment.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.tx_hash).toBe("0xabc123");
  });

  it("marks payment verified", async () => {
    const payment = await mod.insertPayment(db, {
      idType: "email",
      uid: "test@example.com",
      txHash: "0xdef456",
      chainId: "eth",
      token: "usdt",
      amountRaw: "0",
      amountUsd: 0,
    });

    await mod.markPaymentVerified(db, payment.id, {
      fromAddress: "0xsender",
      toAddress: "0xreceiver",
      amountRaw: "25000000",
      amountUsd: 25,
      blockNumber: 12345678,
      planId: "pro",
    });

    const updated = await mod.getPaymentById(db, payment.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("verified");
    expect(updated!.plan_id).toBe("pro");
    expect(updated!.verified_at).not.toBeNull();
  });

  it("marks payment failed", async () => {
    const payment = await mod.insertPayment(db, {
      idType: "tg",
      uid: "789",
      txHash: "0xfail",
      chainId: "sol",
      token: "usdc",
      amountRaw: "0",
      amountUsd: 0,
    });

    await mod.markPaymentFailed(db, payment.id);

    const updated = await mod.getPaymentById(db, payment.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("failed");
  });

  it("gets payments by user", async () => {
    await mod.insertPayment(db, { idType: "tg", uid: "42", txHash: "0x1", chainId: "base", token: "usdc", amountRaw: "10000000", amountUsd: 10 });
    await mod.insertPayment(db, { idType: "tg", uid: "42", txHash: "0x2", chainId: "eth", token: "usdt", amountRaw: "25000000", amountUsd: 25 });
    await mod.insertPayment(db, { idType: "tg", uid: "99", txHash: "0x3", chainId: "base", token: "usdc", amountRaw: "10000000", amountUsd: 10 });

    const user42 = await mod.getPaymentsByUser(db, "tg", "42");
    expect(user42).toHaveLength(2);

    const user99 = await mod.getPaymentsByUser(db, "tg", "99");
    expect(user99).toHaveLength(1);
  });

  it("gets payment by tx hash", async () => {
    await mod.insertPayment(db, { idType: "tg", uid: "1", txHash: "0xunique", chainId: "base", token: "usdc", amountRaw: "10000000", amountUsd: 10 });

    const found = await mod.getPaymentByTx(db, "0xunique", "base");
    expect(found).not.toBeNull();
    expect(found!.uid).toBe("1");

    const notFound = await mod.getPaymentByTx(db, "0xunique", "eth");
    expect(notFound).toBeNull();
  });
});

describe("resolveplan", () => {
  // byok is the primary $5 key; starter is an alias with the same value.
  // $10 matches no plan any more (#6101 §6).
  const prices = { byok: 5, starter: 5, pro: 25, max: 100 };

  it("resolves exact amounts", () => {
    expect(resolveplan(5, prices)).toBe("byok");
    expect(resolveplan(25, prices)).toBe("pro");
    expect(resolveplan(100, prices)).toBe("max");
  });

  it("resolves $5 to byok, never to the starter alias (check order)", () => {
    expect(resolveplan(5, prices)).toBe("byok");
  });

  it("resolves with small variance (within 1%)", () => {
    expect(resolveplan(4.95, prices)).toBe("byok");
    expect(resolveplan(5.05, prices)).toBe("byok");
    expect(resolveplan(24.8, prices)).toBe("pro");
    expect(resolveplan(100.5, prices)).toBe("max");
  });

  it("returns null for unrecognized amounts", () => {
    expect(resolveplan(10, prices)).toBeNull();
    expect(resolveplan(15, prices)).toBeNull();
    expect(resolveplan(50, prices)).toBeNull();
    expect(resolveplan(0, prices)).toBeNull();
  });
});
