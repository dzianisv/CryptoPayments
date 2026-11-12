import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveplan } from "../src/verify.js";

// ── resolveplan tests are in payments.test.ts already, but let's add
//    chain-specific verification tests with mocked fetch/viem ──

// vi.hoisted runs before vi.mock hoisting, so the ref is available in the factory
const { mockGetTransactionReceipt } = vi.hoisted(() => ({
  mockGetTransactionReceipt: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({
      getTransactionReceipt: mockGetTransactionReceipt,
    }),
  };
});

describe("verifyEvmTransfer", () => {
  afterEach(() => {
    mockGetTransactionReceipt.mockReset();
  });

  it("returns null for reverted transaction", async () => {
    mockGetTransactionReceipt.mockResolvedValue({
      status: "reverted",
      logs: [],
    });

    const { verifyEvmTransfer } = await import("../src/verify.js");
    const config = makeConfig();
    const result = await verifyEvmTransfer("0xabc", "base", config);
    expect(result).toBeNull();
  });

  it("returns null when no matching Transfer log", async () => {
    mockGetTransactionReceipt.mockResolvedValue({
      status: "success",
      blockNumber: 12345n,
      logs: [
        {
          address: "0x0000000000000000000000000000000000000000",
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x0000000000000000000000001111111111111111111111111111111111111111",
            "0x0000000000000000000000002222222222222222222222222222222222222222",
          ],
          data: "0x0000000000000000000000000000000000000000000000000000000000989680",
        },
      ],
    });

    const { verifyEvmTransfer } = await import("../src/verify.js");
    const config = makeConfig();
    const result = await verifyEvmTransfer("0xabc", "base", config);
    expect(result).toBeNull();
  });

  it("returns verified transfer for matching USDC Transfer to our wallet", async () => {
    const ourWallet = "0xOurWalletAddress000000000000000000000001";
    const ourWalletPadded =
      "0x000000000000000000000000" +
      ourWallet.slice(2).toLowerCase();

    mockGetTransactionReceipt.mockResolvedValue({
      status: "success",
      blockNumber: 99999n,
      logs: [
        {
          // USDC on Base
          address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x0000000000000000000000001111111111111111111111111111111111111111",
            ourWalletPadded,
          ],
          data: "0x0000000000000000000000000000000000000000000000000000000000989680", // 10_000_000 = 10 USDC
        },
      ],
    });

    const { verifyEvmTransfer } = await import("../src/verify.js");
    const config = makeConfig({ base: ourWallet });
    const result = await verifyEvmTransfer("0xtxhash", "base", config);

    expect(result).not.toBeNull();
    expect(result!.token).toBe("usdc");
    expect(result!.amountUsd).toBe(10);
    expect(result!.blockNumber).toBe(99999);
    expect(result!.to.toLowerCase()).toBe(ourWallet.toLowerCase());
  });
  it("returns verified transfer for matching USDC Transfer on base_sepolia", async () => {
    const ourWallet = "0xOurWalletAddress000000000000000000000001";
    const ourWalletPadded =
      "0x000000000000000000000000" +
      ourWallet.slice(2).toLowerCase();

    mockGetTransactionReceipt.mockResolvedValue({
      status: "success",
      blockNumber: 11111n,
      logs: [
        {
          // USDC on Base Sepolia (Circle testnet)
          address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x0000000000000000000000001111111111111111111111111111111111111111",
            ourWalletPadded,
          ],
          data: "0x0000000000000000000000000000000000000000000000000000000000989680", // 10_000_000 = 10 USDC
        },
      ],
    });

    const { verifyEvmTransfer } = await import("../src/verify.js");
    const config = makeConfig({ base_sepolia: ourWallet });
    const result = await verifyEvmTransfer("0xsepoliatx", "base_sepolia", config);

    expect(result).not.toBeNull();
    expect(result!.token).toBe("usdc");
    expect(result!.amountUsd).toBe(10);
    expect(result!.blockNumber).toBe(11111);
    expect(result!.to.toLowerCase()).toBe(ourWallet.toLowerCase());
  });
});

describe("verifyTonTransfer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when transaction not found", async () => {
    const mockFetch = vi.mocked(fetch);
    // First call: /transactions
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ transactions: [] }), { status: 200 }),
    );
    // Second call: /jetton/transfers
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ jetton_transfers: [] }), { status: 200 }),
    );

    const { verifyTonTransfer } = await import("../src/verify.js");
    const config = makeConfig();
    const result = await verifyTonTransfer("tonhash123", config);
    expect(result).toBeNull();
  });

  it("returns verified transfer for matching USDT jetton transfer", async () => {
    const mockFetch = vi.mocked(fetch);
    const ourWallet = "EQTestWalletAddress";

    // First call: /transactions
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          transactions: [{ hash: "tonhash", lt: "12345", account: "sender" }],
        }),
        { status: 200 },
      ),
    );

    // Second call: /jetton/transfers
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jetton_transfers: [
            {
              query_id: "1",
              source: "EQSenderAddress",
              destination: ourWallet,
              amount: "25000000", // 25 USDT
              jetton_master: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
              transaction_hash: "tonhash",
              transaction_lt: "12345",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const { verifyTonTransfer } = await import("../src/verify.js");
    const config = makeConfig({ ton: ourWallet });
    const result = await verifyTonTransfer("tonhash", config);

    expect(result).not.toBeNull();
    expect(result!.token).toBe("usdt");
    expect(result!.amountUsd).toBe(25);
    expect(result!.to).toBe(ourWallet);
  });

  it("returns null when jetton API fails", async () => {
    const mockFetch = vi.mocked(fetch);

    // First call: /transactions
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          transactions: [{ hash: "tonhash", lt: "1", account: "x" }],
        }),
        { status: 200 },
      ),
    );

    // Second call: /jetton/transfers fails
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    const { verifyTonTransfer } = await import("../src/verify.js");
    const config = makeConfig();
    const result = await verifyTonTransfer("tonhash", config);
    expect(result).toBeNull();
  });
});

describe("verifySolTransfer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for failed transaction", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: { slot: 100, meta: { err: { InstructionError: [0, "Custom"] } } },
        }),
        { status: 200 },
      ),
    );

    const { verifySolTransfer } = await import("../src/verify.js");
    const config = makeConfig();
    const result = await verifySolTransfer("solhash", config);
    expect(result).toBeNull();
  });

  it("returns null when no matching SPL token transfer", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: {
            slot: 100,
            meta: { err: null, preTokenBalances: [], postTokenBalances: [], innerInstructions: [] },
            transaction: {
              message: {
                accountKeys: [{ pubkey: "SomeKey" }],
                instructions: [],
              },
            },
          },
        }),
        { status: 200 },
      ),
    );

    const { verifySolTransfer } = await import("../src/verify.js");
    const config = makeConfig();
    const result = await verifySolTransfer("solhash", config);
    expect(result).toBeNull();
  });

  it("returns verified transfer for matching USDC SPL transfer", async () => {
    const ourWallet = "SolWalletPubkey123";
    const destAta = "DestAtaAddress";
    const mockFetch = vi.mocked(fetch);

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: {
            slot: 200,
            meta: {
              err: null,
              preTokenBalances: [],
              postTokenBalances: [
                {
                  accountIndex: 1,
                  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
                  owner: ourWallet,
                  uiTokenAmount: { amount: "10000000", decimals: 6, uiAmount: 10 },
                },
              ],
              innerInstructions: [],
            },
            transaction: {
              message: {
                accountKeys: [
                  { pubkey: "SenderAta" },
                  { pubkey: destAta },
                ],
                instructions: [
                  {
                    program: "spl-token",
                    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                    parsed: {
                      type: "transferChecked",
                      info: {
                        authority: "SenderWallet",
                        source: "SenderAta",
                        destination: destAta,
                        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                        tokenAmount: { amount: "10000000", decimals: 6, uiAmount: 10 },
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
        { status: 200 },
      ),
    );

    const { verifySolTransfer } = await import("../src/verify.js");
    const config = makeConfig({ sol: ourWallet });
    const result = await verifySolTransfer("solhash", config);

    expect(result).not.toBeNull();
    expect(result!.token).toBe("usdc");
    expect(result!.amountUsd).toBe(10);
    expect(result!.to).toBe(ourWallet);
    expect(result!.blockNumber).toBe(200);
  });
});

describe("verifyTransfer dispatcher", () => {
  it("throws for unsupported chain", async () => {
    const { verifyTransfer } = await import("../src/verify.js");
    const config = makeConfig();
    await expect(
      verifyTransfer("0x123", "xyz" as any, config),
    ).rejects.toThrow("Unsupported chain");
  });
});

// ── Helper: build a Config object for testing ──

function makeConfig(wallets?: Partial<Record<string, string>>) {
  return {
    port: 3003,
    databaseUrl: "postgresql://test:test@localhost:5432/test",
    wallets: {
      base: wallets?.base ?? "0xTestBaseWallet",
      eth: wallets?.eth ?? "0xTestEthWallet",
      ton: wallets?.ton ?? "EQTestTonWallet",
      sol: wallets?.sol ?? "TestSolWallet",
      base_sepolia: wallets?.base_sepolia ?? wallets?.base ?? "0xTestBaseWallet",
    },
    rpc: {
      base: "https://mainnet.base.org",
      eth: "https://cloudflare-eth.com",
      sol: "https://api.mainnet-beta.solana.com",
      ton: "https://toncenter.com/api/v3",
      base_sepolia: "https://sepolia.base.org",
    },
    prices: { byok: 5, starter: 5, pro: 25, max: 100 },
    telegramBotToken: "",
    apiKey: "",
    callbackSecret: "",
    baseUrl: "https://pay.openclaw.ai",
  };
}
