/**
 * x402 protocol support for POST /x402/checkout (AgentPod #6451).
 *
 * Hand-rolled against the x402 v2 spec (x402-foundation/x402,
 * specs/x402-specification-v2.md + schemes/exact/scheme_exact_evm.md) with a
 * v1-compat accept path. The server side needs exactly three things, all
 * here: build the PaymentRequired response, normalize a client's payment
 * header (v2 `PAYMENT-SIGNATURE` or v1 `X-PAYMENT`) into a facilitator
 * request, and call the facilitator's /verify + /settle. Verification and
 * settlement are performed by the facilitator, never locally.
 *
 * Scheme: `exact` / EIP-3009 transferWithAuthorization, asset USDC.
 * Networks: Base Sepolia (eip155:84532, proof) and Base (eip155:8453,
 * config-only until the owner provisions the CDP facilitator — see
 * loadX402Config in config.ts).
 */
import { TOKEN_ADDRESSES, type ChainId, type Config } from "./config.js";

// ── Network table ────────────────────────────────────────────────────────────

export interface X402NetworkInfo {
  caip2: string;
  /** Key into config.wallets / config.rpc and the PI chain_id we record. */
  chainKey: Extract<ChainId, "base" | "base_sepolia">;
  /** v1 network name for the same chain. */
  v1Name: "base" | "base-sepolia";
  chainId: number;
}

export const X402_NETWORKS: Record<string, X402NetworkInfo> = {
  "eip155:84532": {
    caip2: "eip155:84532",
    chainKey: "base_sepolia",
    v1Name: "base-sepolia",
    chainId: 84532,
  },
  "eip155:8453": {
    caip2: "eip155:8453",
    chainKey: "base",
    v1Name: "base",
    chainId: 8453,
  },
};

export function x402Network(config: Config): X402NetworkInfo {
  const info = X402_NETWORKS[config.x402.network];
  if (!info) {
    throw new Error(`Unsupported x402 network: ${config.x402.network}`);
  }
  return info;
}

/** USDC contract for the configured network (from the shared token table). */
export function x402Asset(config: Config): string {
  return TOKEN_ADDRESSES[x402Network(config).chainKey].usdc;
}

/** Wallet that receives x402 payments on the configured network. */
export function x402PayTo(config: Config): string {
  return config.wallets[x402Network(config).chainKey];
}

/** USD value of the configured atomic price (USDC has 6 decimals). */
export function x402PriceUsd(config: Config): number {
  return Number(config.x402.priceAtomic) / 1_000_000;
}

// ── Payment requirements (what we charge) ────────────────────────────────────

export interface PaymentRequirementsV2 {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; assetTransferMethod: "eip3009" };
}

/** USDC's EIP-712 domain, confirmed on-chain for Base Sepolia USDC
 *  (name() = "USDC", version() = "2" — read 2026-11-27, AgentPod #6451). */
export const USDC_EIP712 = { name: "USDC", version: "2" } as const;

export function buildRequirements(config: Config): PaymentRequirementsV2 {
  return {
    scheme: "exact",
    network: config.x402.network,
    amount: config.x402.priceAtomic,
    asset: x402Asset(config),
    payTo: x402PayTo(config),
    maxTimeoutSeconds: config.x402.maxTimeoutSeconds,
    extra: { ...USDC_EIP712, assetTransferMethod: "eip3009" },
  };
}

/** The full v2 PaymentRequired object emitted with a 402 (body + header). */
export function buildPaymentRequired(config: Config, error: string) {
  return {
    x402Version: 2,
    error,
    resource: {
      url: `${config.baseUrl}/x402/checkout`,
      description: "Create a Pay by AgentLabs hosted checkout session",
      mimeType: "application/json",
    },
    accepts: [buildRequirements(config)],
    extensions: {},
  };
}

// ── Base64 helpers (spec payloads are base64-encoded JSON) ───────────────────

export function b64EncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function b64DecodeJson(raw: string): unknown {
  const normalized = raw.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

// ── Client payment payloads ──────────────────────────────────────────────────

export interface Eip3009Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface NormalizedPayment {
  version: 1 | 2;
  payer: string;
  /** Body for the facilitator's /verify and /settle (identical shape). */
  facilitatorBody: {
    x402Version: 1 | 2;
    paymentPayload: unknown;
    paymentRequirements: unknown;
  };
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${what} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function readAuthorization(payload: Record<string, unknown>): {
  signature: string;
  authorization: Eip3009Authorization;
} {
  const inner = asRecord(payload.payload, "payment payload.payload");
  const signature = inner.signature;
  if (typeof signature !== "string" || signature.length === 0) {
    throw new Error("payment payload is missing payload.signature");
  }
  const auth = asRecord(inner.authorization, "payment payload.authorization");
  const authorization: Eip3009Authorization = {
    from: String(auth.from ?? ""),
    to: String(auth.to ?? ""),
    value: String(auth.value ?? ""),
    validAfter: String(auth.validAfter ?? ""),
    validBefore: String(auth.validBefore ?? ""),
    nonce: String(auth.nonce ?? ""),
  };
  if (!ADDRESS_RE.test(authorization.from) || !ADDRESS_RE.test(authorization.to)) {
    throw new Error("payment authorization has malformed from/to addresses");
  }
  return { signature, authorization };
}

/**
 * Decode + validate a payment header against OUR requirement (the amount,
 * asset, payTo and network are always taken from server config — never
 * trusted from the client) and produce the facilitator request body.
 * Throws Error with a client-facing message on any mismatch; the route maps
 * that to a fresh 402.
 */
export function normalizePaymentHeader(
  rawHeader: string,
  config: Config,
): NormalizedPayment {
  let decoded: unknown;
  try {
    decoded = b64DecodeJson(rawHeader);
  } catch {
    throw new Error("Payment header is not valid base64-encoded JSON");
  }
  const payload = asRecord(decoded, "payment payload");
  const requirements = buildRequirements(config);
  const net = x402Network(config);
  const { authorization } = readAuthorization(payload);

  // The authorization itself must match the requirement on the fields the
  // facilitator would enforce anyway; failing here gives a cleaner 402.
  if (authorization.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
    throw new Error("Payment authorization payTo does not match the requirement");
  }
  if (authorization.value !== requirements.amount) {
    throw new Error("Payment authorization amount does not match the requirement");
  }

  if (payload.x402Version === 2) {
    const accepted = asRecord(payload.accepted, "payment payload.accepted");
    if (
      accepted.scheme !== "exact" ||
      accepted.network !== requirements.network ||
      String(accepted.asset).toLowerCase() !== requirements.asset.toLowerCase() ||
      String(accepted.payTo).toLowerCase() !== requirements.payTo.toLowerCase() ||
      String(accepted.amount) !== requirements.amount
    ) {
      throw new Error("Accepted payment requirement does not match the offered requirement");
    }
    return {
      version: 2,
      payer: authorization.from,
      facilitatorBody: {
        x402Version: 2,
        paymentPayload: payload,
        paymentRequirements: requirements,
      },
    };
  }

  if (payload.x402Version === 1) {
    if (payload.scheme !== "exact" || payload.network !== net.v1Name) {
      throw new Error("v1 payment payload scheme/network does not match the offered requirement");
    }
    return {
      version: 1,
      payer: authorization.from,
      facilitatorBody: {
        x402Version: 1,
        paymentPayload: payload,
        paymentRequirements: {
          scheme: "exact",
          network: net.v1Name,
          maxAmountRequired: requirements.amount,
          asset: requirements.asset,
          payTo: requirements.payTo,
          resource: `${config.baseUrl}/x402/checkout`,
          maxTimeoutSeconds: requirements.maxTimeoutSeconds,
          extra: { name: USDC_EIP712.name, version: USDC_EIP712.version },
        },
      },
    };
  }

  throw new Error(`Unsupported x402Version: ${String(payload.x402Version)}`);
}

// ── Facilitator client ───────────────────────────────────────────────────────

export class FacilitatorUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacilitatorUnavailable";
  }
}

export interface VerifyResult {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResult {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
}

const FACILITATOR_TIMEOUT_MS = 30_000;

async function facilitatorPost(
  config: Config,
  path: "/verify" | "/settle",
  body: unknown,
  fetchFn: typeof fetch,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchFn(`${config.x402.facilitatorUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FACILITATOR_TIMEOUT_MS),
    });
  } catch (err) {
    throw new FacilitatorUnavailable(
      `Facilitator ${path} unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new FacilitatorUnavailable(
      `Facilitator ${path} returned HTTP ${res.status}`,
    );
  }
  try {
    return asRecord(await res.json(), `facilitator ${path} response`);
  } catch {
    throw new FacilitatorUnavailable(`Facilitator ${path} returned invalid JSON`);
  }
}

export async function facilitatorVerify(
  config: Config,
  facilitatorBody: unknown,
  fetchFn: typeof fetch = fetch,
): Promise<VerifyResult> {
  const res = await facilitatorPost(config, "/verify", facilitatorBody, fetchFn);
  return {
    isValid: res.isValid === true,
    invalidReason:
      typeof res.invalidReason === "string" ? res.invalidReason : undefined,
    payer: typeof res.payer === "string" ? res.payer : undefined,
  };
}

export async function facilitatorSettle(
  config: Config,
  facilitatorBody: unknown,
  fetchFn: typeof fetch = fetch,
): Promise<SettleResult> {
  const res = await facilitatorPost(config, "/settle", facilitatorBody, fetchFn);
  return {
    success: res.success === true,
    transaction:
      typeof res.transaction === "string" ? res.transaction : undefined,
    network: typeof res.network === "string" ? res.network : undefined,
    payer: typeof res.payer === "string" ? res.payer : undefined,
    errorReason:
      typeof res.errorReason === "string" ? res.errorReason : undefined,
  };
}

/** Settlement receipt emitted in the PAYMENT-RESPONSE header on success. */
export function buildSettlementReceipt(
  config: Config,
  settle: SettleResult,
  payer: string,
) {
  return {
    success: true,
    transaction: settle.transaction,
    network: settle.network ?? config.x402.network,
    payer: settle.payer ?? payer,
  };
}
