import { describe, it, expect, vi } from "vitest";
import type { DB } from "../src/db.js";

// X402_ENABLED is deliberately NOT set: the route must 404 (AgentPod #6451).
process.env.DATABASE_URL = ["postgres://test", "localhost/test"].join("@");
process.env.API_KEY = "test-api-key";
process.env.CALLBACK_SECRET = "test-callback-secret";
process.env.CHECKOUT_SECRET = "test-checkout-secret";
process.env.WALLET_BASE = "0x1111111111111111111111111111111111111111";
process.env.WALLET_ETH = "0x2222222222222222222222222222222222222222";
process.env.WALLET_TON = "EQTestTonWallet";
process.env.WALLET_SOL = "TestSolWallet";
process.env.PORT = "0";
delete process.env.X402_ENABLED;

vi.mock("@hono/node-server", () => ({
  serve: vi.fn(),
}));

vi.mock("@hono/node-server/serve-static", () => ({
  serveStatic: () => async (_c: any, next: any) => next(),
}));

import { createMockPool } from "./mock-pool.js";

const { createApp } = await import("../src/server.js");

describe("POST /x402/checkout with X402_ENABLED unset", () => {
  it("returns 404", async () => {
    const mockDb: DB = createMockPool();
    const app = createApp(mockDb);
    const res = await app.request("/x402/checkout", { method: "POST" });
    expect(res.status).toBe(404);
  });
});
