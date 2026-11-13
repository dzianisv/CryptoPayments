import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchConfig, submitPayment, checkPaymentStatus } from "@/lib/api";
import { API_BASE } from "@/lib/config";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchConfig", () => {
    it("fetches config from the API", async () => {
      const mockConfig = {
        wallets: { base: "0xWallet" },
        prices: { starter: 10 },
        tokens: { base: { usdc: "0xUSDC" } },
        chains: ["base"],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      const config = await fetchConfig();
      // #6072 (b): fetchConfig now bounds the request with AbortSignal.timeout
      // (10s) — the signal is part of the call shape, asserted here so the
      // bound cannot silently regress to an unbounded fetch.
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE}/api/config`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(config).toEqual(mockConfig);
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(fetchConfig()).rejects.toThrow("Failed to load config: 500");
    });
  });

  describe("submitPayment", () => {
    const paymentReq = {
      txHash: "0xabc",
      chainId: "base" as const,
      token: "usdc" as const,
      idType: "tg" as const,
      uid: "123",
    };

    it("posts payment and returns result", async () => {
      const mockResult = {
        payment: {
          id: "pay_123",
          status: "verified",
          amount_usd: 10,
          token: "usdc",
          chain_id: "base",
          tx_hash: "0xabc",
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResult),
      });

      const result = await submitPayment(paymentReq);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/api/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentReq),
      });
      expect(result).toEqual(mockResult);
    });

    it("throws on 409 duplicate", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: "duplicate" }),
      });

      await expect(submitPayment(paymentReq)).rejects.toThrow(
        "This transaction was already submitted.",
      );
    });

    it("throws with server error message on failure", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Invalid tx hash" }),
      });

      await expect(submitPayment(paymentReq)).rejects.toThrow("Invalid tx hash");
    });

    it("throws generic message when no error in response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await expect(submitPayment(paymentReq)).rejects.toThrow(
        "Verification failed (500)",
      );
    });
  });

  describe("checkPaymentStatus", () => {
    it("fetches payment status by id", async () => {
      const mockResult = {
        payment: {
          id: "pay_123",
          status: "verified",
          amount_usd: 10,
          token: "usdc",
          chain_id: "base",
          tx_hash: "0xabc",
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await checkPaymentStatus("pay_123");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/api/payment/pay_123`);
      expect(result).toEqual(mockResult);
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      await expect(checkPaymentStatus("pay_xxx")).rejects.toThrow(
        "Payment not found: 404",
      );
    });
  });
});
