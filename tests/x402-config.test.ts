import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

// loadConfig reads process.env at call time; each test sets exactly the
// x402 env it exercises and the rest is restored afterwards.
const KEYS = [
  "X402_ENABLED",
  "X402_NETWORK",
  "X402_FACILITATOR_URL",
  "X402_PRICE_ATOMIC",
  "X402_MAX_TIMEOUT_SECONDS",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("loadConfig x402 (AgentPod #6451)", () => {
  it("defaults: disabled, Base Sepolia, public facilitator, 10000 atomic, 300s", () => {
    const cfg = loadConfig();
    expect(cfg.x402).toEqual({
      enabled: false,
      facilitatorUrl: "https://x402.org/facilitator",
      network: "eip155:84532",
      priceAtomic: "10000",
      maxTimeoutSeconds: 300,
    });
  });

  it("fails closed: mainnet + default facilitator", () => {
    process.env.X402_NETWORK = "eip155:8453";
    expect(() => loadConfig()).toThrow(/requires an explicit X402_FACILITATOR_URL/);
  });

  it("fails closed: mainnet + default facilitator WITH trailing slash", () => {
    process.env.X402_NETWORK = "eip155:8453";
    process.env.X402_FACILITATOR_URL = "https://x402.org/facilitator/";
    expect(() => loadConfig()).toThrow(/requires an explicit X402_FACILITATOR_URL/);
  });

  it("fails closed even when the route is disabled (selection alone is the error)", () => {
    process.env.X402_ENABLED = "false";
    process.env.X402_NETWORK = "eip155:8453";
    expect(() => loadConfig()).toThrow(/requires an explicit X402_FACILITATOR_URL/);
  });

  it("allows mainnet with an explicit non-default facilitator (CDP wiring)", () => {
    process.env.X402_NETWORK = "eip155:8453";
    process.env.X402_FACILITATOR_URL =
      "https://api.cdp.coinbase.com/platform/v2/x402";
    const cfg = loadConfig();
    expect(cfg.x402.network).toBe("eip155:8453");
    expect(cfg.x402.facilitatorUrl).toBe(
      "https://api.cdp.coinbase.com/platform/v2/x402",
    );
  });

  it("normalizes a trailing slash on the facilitator URL", () => {
    process.env.X402_FACILITATOR_URL = "https://x402.org/facilitator///";
    expect(loadConfig().x402.facilitatorUrl).toBe(
      "https://x402.org/facilitator",
    );
  });

  it("rejects an unsupported network", () => {
    process.env.X402_NETWORK = "eip155:1";
    expect(() => loadConfig()).toThrow(/is not supported/);
  });

  it("rejects a non-numeric or zero price", () => {
    process.env.X402_PRICE_ATOMIC = "ten";
    expect(() => loadConfig()).toThrow(/positive integer/);
    process.env.X402_PRICE_ATOMIC = "0";
    expect(() => loadConfig()).toThrow(/positive integer/);
    process.env.X402_PRICE_ATOMIC = "2500";
    expect(loadConfig().x402.priceAtomic).toBe("2500");
  });
});
