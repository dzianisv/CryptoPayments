/**
 * x402 payer for the Pay by AgentLabs MCP server (AgentPod #6451).
 *
 * Lets an agent pay any x402-priced resource end to end: fetch → on 402,
 * parse the payment requirements → select an `exact`/EIP-3009 USDC
 * requirement → sign a transferWithAuthorization with viem (gasless for the
 * payer; the resource's facilitator settles on-chain) → retry with the
 * payment header.
 *
 * The wallet key comes from the environment only
 * (AGENTLABS_PAY_X402_PRIVATE_KEY). It is never logged, never returned by
 * any tool, and never sent anywhere — it only signs locally.
 */
import { randomBytes } from "node:crypto";
import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const DEFAULT_X402_RPC = "https://sepolia.base.org";
/** Default per-payment cap: 1 USDC (atomic units). */
export const DEFAULT_MAX_AMOUNT_ATOMIC = "1000000";

const CHAIN_IDS: Record<string, number> = {
  "eip155:84532": 84532,
  "eip155:8453": 8453,
};
/** Canonical USDC per supported network. The payer signs ONLY for these:
 *  the per-payment cap is a USDC-atomic cap, and any other asset would
 *  silently change what the cap means. */
const USDC_BY_NETWORK: Record<string, string> = {
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
const NETWORK_ALIASES: Record<string, string> = {
  "base-sepolia": "eip155:84532",
  base: "eip155:8453",
};

export function normalizeNetwork(network: string): string {
  return NETWORK_ALIASES[network] ?? network;
}

// ── Requirement shapes (v2 primary, v1 tolerant) ─────────────────────────────

export interface X402Requirement {
  scheme: string;
  network: string;
  /** v2 amount field (atomic units). */
  amount?: string;
  /** v1 amount field (atomic units). */
  maxAmountRequired?: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: {
    name?: string;
    version?: string;
    assetTransferMethod?: string;
  };
}

export interface PaymentRequiredBody {
  x402Version: number;
  error?: string;
  resource?: unknown;
  accepts: X402Requirement[];
}

export function requirementAmount(req: X402Requirement): string {
  const amount = req.amount ?? req.maxAmountRequired;
  if (amount === undefined) {
    throw new Error("Payment requirement carries no amount");
  }
  return amount;
}

function b64DecodeJson(raw: string): unknown {
  const normalized = raw.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function asPaymentRequired(value: unknown): PaymentRequiredBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.accepts) || body.accepts.length === 0) return null;
  return {
    x402Version: typeof body.x402Version === "number" ? body.x402Version : 1,
    error: typeof body.error === "string" ? body.error : undefined,
    resource: body.resource,
    accepts: body.accepts as X402Requirement[],
  };
}

/** Parse requirements from a 402 response: PAYMENT-REQUIRED header (v2
 *  canonical) first, then the JSON body (v1 style / debugging copy). */
export function parsePaymentRequired(
  headers: Headers,
  bodyText: string,
): PaymentRequiredBody | null {
  const header = headers.get("PAYMENT-REQUIRED");
  if (header) {
    try {
      const parsed = asPaymentRequired(b64DecodeJson(header));
      if (parsed) return parsed;
    } catch {
      // fall through to the body
    }
  }
  try {
    return asPaymentRequired(JSON.parse(bodyText));
  } catch {
    return null;
  }
}

/** Decode a settlement receipt header (PAYMENT-RESPONSE / X-PAYMENT-RESPONSE). */
export function parseSettlementReceipt(headers: Headers): unknown {
  const raw =
    headers.get("PAYMENT-RESPONSE") ?? headers.get("X-PAYMENT-RESPONSE");
  if (!raw) return null;
  try {
    return b64DecodeJson(raw);
  } catch {
    return null;
  }
}

/**
 * Select the requirement to pay: `exact` scheme on a supported EVM network.
 * Base Sepolia is preferred; Base mainnet (eip155:8453) is selected ONLY when
 * the caller explicitly asked for it — never automatically.
 */
export function selectRequirement(
  accepts: X402Requirement[],
  opts: { network?: string } = {},
): X402Requirement {
  const supported = accepts.filter(
    (req) =>
      req.scheme === "exact" &&
      CHAIN_IDS[normalizeNetwork(req.network)] !== undefined,
  );
  if (opts.network) {
    const wanted = normalizeNetwork(opts.network);
    const match = supported.find(
      (req) => normalizeNetwork(req.network) === wanted,
    );
    if (!match) {
      throw new Error(
        `No exact/EVM requirement offered for network ${opts.network}. Offered: ${accepts
          .map((r) => `${r.scheme}/${r.network}`)
          .join(", ")}`,
      );
    }
    return match;
  }
  const testnet = supported.find(
    (req) => normalizeNetwork(req.network) === "eip155:84532",
  );
  if (testnet) return testnet;
  throw new Error(
    `No payable exact/EVM requirement offered (Base mainnet is never auto-selected; pass network explicitly). Offered: ${accepts
      .map((r) => `${r.scheme}/${r.network}`)
      .join(", ")}`,
  );
}

// ── Payer ────────────────────────────────────────────────────────────────────

export interface X402PayerConfig {
  privateKey?: string;
  /** Per-payment cap in atomic units (env default 1 USDC). */
  maxAmountAtomic?: string;
  rpcUrl?: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

interface RawResponse {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

export class X402Payer {
  private readonly privateKey?: string;
  private readonly maxAmountAtomic: bigint;
  private readonly rpcUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: X402PayerConfig = {}) {
    this.privateKey = config.privateKey;
    this.maxAmountAtomic = BigInt(
      config.maxAmountAtomic ?? DEFAULT_MAX_AMOUNT_ATOMIC,
    );
    this.rpcUrl = config.rpcUrl ?? DEFAULT_X402_RPC;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  static fromEnv(
    env: Record<string, string | undefined>,
    fetchFn?: typeof fetch,
  ): X402Payer {
    return new X402Payer({
      privateKey: env.AGENTLABS_PAY_X402_PRIVATE_KEY,
      maxAmountAtomic: env.AGENTLABS_PAY_X402_MAX_AMOUNT_ATOMIC,
      rpcUrl: env.AGENTLABS_PAY_X402_RPC,
      fetchFn,
    });
  }

  get configured(): boolean {
    return Boolean(this.privateKey);
  }

  private account(): PrivateKeyAccount {
    if (!this.privateKey) {
      throw new Error(
        "AGENTLABS_PAY_X402_PRIVATE_KEY is not set. The x402 payer tools need a wallet key in the environment (never in tool arguments).",
      );
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(this.privateKey)) {
      throw new Error(
        "AGENTLABS_PAY_X402_PRIVATE_KEY is malformed (expected a 0x-prefixed 32-byte hex key).",
      );
    }
    return privateKeyToAccount(this.privateKey as Hex);
  }

  /** The payer address — safe to surface; never the key. */
  address(): string {
    return this.account().address;
  }

  private async rawRequest(
    url: string,
    opts: { method?: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<RawResponse> {
    const res = await this.fetchFn(url, {
      method: opts.method ?? "POST",
      headers: {
        ...(opts.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json: unknown = text;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body — surface as text.
    }
    return { status: res.status, headers: res.headers, text, json };
  }

  /** Fetch a resource WITHOUT paying; report its 402 requirements if any. */
  async getRequirements(
    url: string,
    opts: { method?: string; body?: unknown } = {},
  ): Promise<unknown> {
    const res = await this.rawRequest(url, opts);
    if (res.status !== 402) {
      return { status: res.status, body: res.json };
    }
    const required = parsePaymentRequired(res.headers, res.text);
    if (!required) {
      return { status: 402, body: res.json, error: "Unparseable 402 response" };
    }
    return {
      status: 402,
      x402Version: required.x402Version,
      error: required.error,
      resource: required.resource,
      accepts: required.accepts,
    };
  }

  /** Build (and sign) the payment payload for a chosen requirement. */
  async buildPayment(
    required: PaymentRequiredBody,
    requirement: X402Requirement,
    opts: { maxAmountAtomic?: string } = {},
  ): Promise<{
    headerValue: string;
    version: 1 | 2;
    amount: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  }> {
    const account = this.account();

    // Refuse anything that is not an EIP-3009 USDC requirement on the
    // selected network — before any signing. The EIP-712 domain name/version
    // must come from the requirement; defaulting them would sign against a
    // domain the token does not use.
    const network = normalizeNetwork(requirement.network);
    const expectedAsset = USDC_BY_NETWORK[network];
    if (!expectedAsset) {
      throw new Error(`Unsupported x402 network: ${requirement.network}`);
    }
    if (requirement.asset.toLowerCase() !== expectedAsset.toLowerCase()) {
      throw new Error(
        `Refusing to pay asset ${requirement.asset} on ${network}: only USDC (${expectedAsset}) is supported. Nothing was signed.`,
      );
    }
    const method = requirement.extra?.assetTransferMethod;
    if (method !== undefined && method !== "eip3009") {
      throw new Error(
        `Refusing assetTransferMethod ${method}: only eip3009 is supported. Nothing was signed.`,
      );
    }
    if (!requirement.extra?.name || !requirement.extra?.version) {
      throw new Error(
        "Payment requirement is missing extra.name / extra.version (the token's EIP-712 domain). Nothing was signed.",
      );
    }

    const amount = requirementAmount(requirement);
    const cap =
      opts.maxAmountAtomic !== undefined
        ? BigInt(opts.maxAmountAtomic) < this.maxAmountAtomic
          ? BigInt(opts.maxAmountAtomic)
          : this.maxAmountAtomic
        : this.maxAmountAtomic;
    if (BigInt(amount) > cap) {
      throw new Error(
        `Refusing to pay ${amount} atomic units: above the per-payment cap of ${cap} (AGENTLABS_PAY_X402_MAX_AMOUNT_ATOMIC / max_amount_atomic). Nothing was signed.`,
      );
    }

    const chainId = CHAIN_IDS[network];
    const validBefore =
      Math.floor(Date.now() / 1000) + (requirement.maxTimeoutSeconds ?? 60);
    const authorization = {
      from: account.address,
      to: requirement.payTo,
      value: amount,
      validAfter: "0",
      validBefore: String(validBefore),
      nonce: `0x${randomBytes(32).toString("hex")}`,
    };

    const signature = await account.signTypedData({
      domain: {
        name: requirement.extra.name,
        version: requirement.extra.version,
        chainId,
        verifyingContract: requirement.asset as Hex,
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
        from: authorization.from as Hex,
        to: authorization.to as Hex,
        value: BigInt(amount),
        validAfter: 0n,
        validBefore: BigInt(validBefore),
        nonce: authorization.nonce as Hex,
      },
    });

    if (required.x402Version === 2) {
      const payload = {
        x402Version: 2,
        resource: required.resource,
        accepted: requirement,
        payload: { signature, authorization },
        extensions: {},
      };
      return {
        headerValue: Buffer.from(JSON.stringify(payload), "utf8").toString(
          "base64",
        ),
        version: 2,
        amount,
        authorization,
      };
    }

    const payload = {
      x402Version: 1,
      scheme: "exact",
      network: requirement.network,
      payload: { signature, authorization },
    };
    return {
      headerValue: Buffer.from(JSON.stringify(payload), "utf8").toString(
        "base64",
      ),
      version: 1,
      amount,
      authorization,
    };
  }

  /** Full flow: fetch → on 402 sign + retry with the payment header. */
  async pay(
    url: string,
    opts: {
      method?: string;
      body?: unknown;
      maxAmountAtomic?: string;
      network?: string;
    } = {},
  ): Promise<unknown> {
    const first = await this.rawRequest(url, opts);
    if (first.status !== 402) {
      return { status: first.status, body: first.json, paid: false };
    }
    const required = parsePaymentRequired(first.headers, first.text);
    if (!required) {
      throw new Error("Resource returned 402 with unparseable payment requirements");
    }
    const requirement = selectRequirement(required.accepts, {
      network: opts.network,
    });
    const payment = await this.buildPayment(required, requirement, {
      maxAmountAtomic: opts.maxAmountAtomic,
    });

    // Dual-send: v2 servers read PAYMENT-SIGNATURE, v1 servers X-PAYMENT.
    const retry = await this.rawRequest(url, {
      ...opts,
      headers: {
        "PAYMENT-SIGNATURE": payment.headerValue,
        "X-PAYMENT": payment.headerValue,
      },
    });
    const ok = retry.status >= 200 && retry.status < 300;
    const result: Record<string, unknown> = {
      status: retry.status,
      body: retry.json,
      // Signing-and-sending is not payment: `paid` is true only when the
      // resource was actually served after payment.
      paid: ok,
      payer: this.address(),
      amount: payment.amount,
      asset: requirement.asset,
      network: normalizeNetwork(requirement.network),
      settlement: parseSettlementReceipt(retry.headers),
    };
    if (!ok) {
      // The payment may still have settled server-side (e.g. a settle that
      // broadcast but answered 402): the authorization — its nonce above
      // all — is the reconciliation handle, so it is returned here (design
      // §5 step 6). The nonce is single-use; a fresh call re-signs.
      result.payment = { authorization: payment.authorization };
    }
    return result;
  }

  /** Payer address + Base Sepolia USDC balance (faucet check before paying). */
  async walletInfo(): Promise<unknown> {
    const account = this.account();
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(this.rpcUrl),
    });
    const balance = await client.readContract({
      address: BASE_SEPOLIA_USDC,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [account.address],
    });
    return {
      address: account.address,
      network: "eip155:84532",
      usdc: BASE_SEPOLIA_USDC,
      usdc_balance_atomic: balance.toString(),
    };
  }
}
