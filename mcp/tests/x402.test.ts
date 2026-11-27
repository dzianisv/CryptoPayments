import { describe, expect, it, vi } from "vitest";
import { verifyTypedData } from "viem";
import {
  X402Payer,
  parsePaymentRequired,
  selectRequirement,
  type X402Requirement,
} from "../src/x402.js";
import { X402_TOOLS } from "../src/tools.js";

// Well-known public Hardhat test account #0 — a test fixture, not a secret.
const TEST_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TX_HASH = `0x${"ab".repeat(32)}`;

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function requirement(overrides: Partial<X402Requirement> = {}): X402Requirement {
  return {
    scheme: "exact",
    network: "eip155:84532",
    amount: "10000",
    asset: USDC_BASE_SEPOLIA,
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: { name: "USDC", version: "2", assetTransferMethod: "eip3009" },
    ...overrides,
  };
}

function paymentRequiredBody(accepts: X402Requirement[]) {
  return {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: {
      url: "https://api.example.com/x402/checkout",
      description: "checkout",
      mimeType: "application/json",
    },
    accepts,
    extensions: {},
  };
}

function response402(accepts: X402Requirement[]): Response {
  const body = paymentRequiredBody(accepts);
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "PAYMENT-REQUIRED": b64(body),
    },
  });
}

function response200(): Response {
  const receipt = {
    success: true,
    transaction: TX_HASH,
    network: "eip155:84532",
    payer: TEST_ADDRESS,
  };
  return new Response(JSON.stringify({ id: "cs_test", status: "open" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "PAYMENT-RESPONSE": b64(receipt),
    },
  });
}

describe("parsePaymentRequired", () => {
  it("reads the PAYMENT-REQUIRED header first", () => {
    const res = response402([requirement()]);
    const parsed = parsePaymentRequired(res.headers, "");
    expect(parsed?.x402Version).toBe(2);
    expect(parsed?.accepts[0].network).toBe("eip155:84532");
  });

  it("falls back to the JSON body (v1 style)", () => {
    const body = {
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: "base-sepolia",
          maxAmountRequired: "10000",
          asset: USDC_BASE_SEPOLIA,
          payTo: PAY_TO,
        },
      ],
    };
    const headers = new Headers();
    const parsed = parsePaymentRequired(headers, JSON.stringify(body));
    expect(parsed?.x402Version).toBe(1);
    expect(parsed?.accepts[0].maxAmountRequired).toBe("10000");
  });

  it("returns null for a non-402-shaped response", () => {
    expect(parsePaymentRequired(new Headers(), "hello")).toBeNull();
  });
});

describe("selectRequirement", () => {
  it("prefers Base Sepolia", () => {
    const mainnet = requirement({
      network: "eip155:8453",
      asset: USDC_BASE,
    });
    const testnet = requirement();
    expect(selectRequirement([mainnet, testnet]).network).toBe("eip155:84532");
  });

  it("never auto-selects mainnet", () => {
    const mainnet = requirement({ network: "eip155:8453", asset: USDC_BASE });
    expect(() => selectRequirement([mainnet])).toThrow(/never auto-selected/);
  });

  it("selects mainnet when explicitly requested", () => {
    const mainnet = requirement({ network: "eip155:8453", asset: USDC_BASE });
    expect(
      selectRequirement([mainnet], { network: "eip155:8453" }).network,
    ).toBe("eip155:8453");
  });

  it("normalizes v1 network names", () => {
    const v1 = requirement({ network: "base-sepolia" });
    expect(selectRequirement([v1]).network).toBe("base-sepolia");
  });
});

describe("X402Payer", () => {
  it("exposes exactly the three x402 tools", () => {
    expect(X402_TOOLS.map((t) => t.name)).toEqual([
      "get_x402_payment_requirements",
      "pay_x402_resource",
      "x402_wallet_info",
    ]);
  });

  it("getRequirements returns the accepts without signing or paying", async () => {
    const fetchFn = vi.fn(async () => response402([requirement()]));
    const payer = new X402Payer({
      privateKey: TEST_KEY,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = (await payer.getRequirements("https://api.example.com/x")) as any;
    expect(result.status).toBe(402);
    expect(result.accepts).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("pay completes the full cycle and produces a verifiable EIP-3009 signature", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      return seen.length === 1 ? response402([requirement()]) : response200();
    });
    const payer = new X402Payer({
      privateKey: TEST_KEY,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = (await payer.pay("https://api.example.com/x402/checkout")) as any;
    expect(result.paid).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payer).toBe(TEST_ADDRESS);
    expect(result.amount).toBe("10000");
    expect(result.settlement).toMatchObject({
      success: true,
      transaction: TX_HASH,
    });

    // The retry carried the payment in both headers, identically.
    const retryHeaders = new Headers(seen[1].init?.headers as any);
    const headerValue = retryHeaders.get("PAYMENT-SIGNATURE");
    expect(headerValue).toBeTruthy();
    expect(retryHeaders.get("X-PAYMENT")).toBe(headerValue);

    const payload = JSON.parse(
      Buffer.from(headerValue!, "base64").toString("utf8"),
    );
    expect(payload.x402Version).toBe(2);
    expect(payload.accepted.network).toBe("eip155:84532");
    const { signature, authorization } = payload.payload;
    expect(authorization.from).toBe(TEST_ADDRESS);
    expect(authorization.to).toBe(PAY_TO);
    expect(authorization.value).toBe("10000");

    // The signature is a real EIP-712 signature over the USDC domain.
    const valid = await verifyTypedData({
      address: TEST_ADDRESS,
      domain: {
        name: "USDC",
        version: "2",
        chainId: 84532,
        verifyingContract: USDC_BASE_SEPOLIA,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
      signature,
    });
    expect(valid).toBe(true);
  });

  it("pay returns paid:false for a free resource", async () => {
    const fetchFn = vi.fn(async () => response200());
    const payer = new X402Payer({
      privateKey: TEST_KEY,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = (await payer.pay("https://api.example.com/free")) as any;
    expect(result.paid).toBe(false);
    expect(result.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("refuses amounts above the cap and never retries", async () => {
    const fetchFn = vi.fn(async () =>
      response402([requirement({ amount: "2000000" })]),
    );
    const payer = new X402Payer({
      privateKey: TEST_KEY,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      payer.pay("https://api.example.com/expensive"),
    ).rejects.toThrow(/above the per-payment cap/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when the key is not set", async () => {
    const fetchFn = vi.fn(async () => response402([requirement()]));
    const payer = new X402Payer({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(payer.configured).toBe(false);
    await expect(payer.pay("https://api.example.com/x")).rejects.toThrow(
      /AGENTLABS_PAY_X402_PRIVATE_KEY is not set/,
    );
    await expect(payer.walletInfo()).rejects.toThrow(
      /AGENTLABS_PAY_X402_PRIVATE_KEY is not set/,
    );
  });

  it("pays a v1 (body-only) 402 with a v1-shaped payload", async () => {
    const v1Body = {
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts: [
        {
          scheme: "exact",
          network: "base-sepolia",
          maxAmountRequired: "10000",
          asset: USDC_BASE_SEPOLIA,
          payTo: PAY_TO,
          resource: "https://api.example.com/x402/checkout",
          maxTimeoutSeconds: 300,
          extra: { name: "USDC", version: "2" },
        },
      ],
    };
    const seen: { init?: RequestInit }[] = [];
    const fetchFn = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      seen.push({ init });
      if (seen.length === 1) {
        return new Response(JSON.stringify(v1Body), {
          status: 402,
          headers: { "content-type": "application/json" },
        });
      }
      return response200();
    });
    const payer = new X402Payer({
      privateKey: TEST_KEY,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = (await payer.pay("https://api.example.com/x402/checkout")) as any;
    expect(result.paid).toBe(true);

    const retryHeaders = new Headers(seen[1].init?.headers as any);
    const payload = JSON.parse(
      Buffer.from(retryHeaders.get("X-PAYMENT")!, "base64").toString("utf8"),
    );
    expect(payload.x402Version).toBe(1);
    expect(payload.scheme).toBe("exact");
    expect(payload.network).toBe("base-sepolia");
    expect(payload.payload.authorization.value).toBe("10000");
    expect(payload.payload.authorization.from).toBe(TEST_ADDRESS);
  });

  it("non-2xx after payment → paid:false and the authorization is returned for reconciliation", async () => {
    const seen: { init?: RequestInit }[] = [];
    const fetchFn = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      seen.push({ init });
      // Both the first fetch and the paid retry answer 402 (e.g. the server
      // settled-but-pending case in design §7 risk 7).
      return response402([requirement()]);
    });
    const payer = new X402Payer({
      privateKey: TEST_KEY,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = (await payer.pay("https://api.example.com/x402/checkout")) as any;
    expect(result.status).toBe(402);
    expect(result.paid).toBe(false);
    expect(result.settlement).toBeNull();
    expect(result.payment?.authorization).toBeTruthy();

    const retryHeaders = new Headers(seen[1].init?.headers as any);
    const sent = JSON.parse(
      Buffer.from(retryHeaders.get("PAYMENT-SIGNATURE")!, "base64").toString(
        "utf8",
      ),
    );
    expect(result.payment.authorization.nonce).toBe(
      sent.payload.authorization.nonce,
    );
    expect(result.payment.authorization.value).toBe("10000");
  });

  it("refuses a non-USDC asset and signs nothing", async () => {
    const fetchFn = vi.fn(async () =>
      response402([
        requirement({ asset: "0x1111111111111111111111111111111111111111" }),
      ]),
    );
    const payer = new X402Payer({
      privateKey: TEST_KEY,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(payer.pay("https://api.example.com/x")).rejects.toThrow(
      /only USDC/,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("refuses a requirement without the EIP-712 domain in extra", async () => {
    const fetchFn = vi.fn(async () =>
      response402([requirement({ extra: { assetTransferMethod: "eip3009" } })]),
    );
    const payer = new X402Payer({
      privateKey: TEST_KEY,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(payer.pay("https://api.example.com/x")).rejects.toThrow(
      /EIP-712 domain/,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
