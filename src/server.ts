import { Hono, type Context } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cors } from "hono/cors";
import { loadConfig, type ChainId, type TokenId, TOKEN_ADDRESSES } from "./config.js";
import {
  createDB,
  pingDb,
  type DB,
  // Legacy compat
  insertPayment,
  getPaymentById,
  getPaymentByTx,
  getPaymentsByUser,
  markPaymentVerified,
  markPaymentFailed,
  // Stripe-like API
  getOrCreateCustomer,
  getCustomerById,
  updateCustomer,
  listCustomers,
  createInvoice,
  getInvoiceById,
  getInvoiceWithLineItems,
  listInvoices,
  addInvoiceLineItem,
  finalizeInvoice,
  voidInvoice,
  createPaymentIntent,
  getPaymentIntentById,
  listPaymentIntents,
  updatePaymentIntentStatus,
  createCheckoutSession,
  getCheckoutSessionById,
  completeCheckoutSession,
  listWebhookEvents,
  createWebhookEvent,
  type PaymentRecord,
} from "./db.js";
import { verifyTransfer, resolveplan } from "./verify.js";
import { verifyTelegramInitData } from "./telegram.js";

const config = loadConfig();
const db = createDB(config.databaseUrl);

// ── App factory (for testing) ────────────────────────────────────────────────

export function createApp(injectedDb?: DB) {
  const appDb = injectedDb ?? db;
  const app = new Hono();

  // ── Middleware ──────────────────────────────────────────────────────────────

  app.use("/api/*", cors({ origin: "*" }));
  app.use("/v1/*", cors({ origin: "*" }));

  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
  });

  // ── API key auth middleware helper ─────────────────────────────────────────

  function requireApiKey(c: Context): boolean {
    if (!config.apiKey) return true;
    const provided = c.req.header("x-api-key") ?? c.req.query("api_key");
    return provided === config.apiKey;
  }

  function verifyCheckoutIntent(input: {
    uid: string;
    plan?: string;
    topup?: string;
    callbackUrl?: string;
    tenantType?: string;
    vmProvider?: string;
    hostType?: string;
    amountUsd?: string;
    exp?: string;
    sig?: string;
  }): boolean {
    if (!config.checkoutSecret || !input.exp || !input.sig) return false;
    const exp = Number(input.exp);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const params = new URLSearchParams();
    if (input.plan) params.set("plan", input.plan);
    if (input.topup) params.set("topup", input.topup);
    params.set("uid", input.uid);
    params.set("idtype", "tg");
    if (input.amountUsd) params.set("amountUsd", input.amountUsd);
    params.set("exp", input.exp);
    if (input.callbackUrl) params.set("callback", input.callbackUrl);
    if (input.tenantType) {
      params.set("tenantType", input.tenantType);
      params.set("tenant", input.tenantType);
    }
    if (input.vmProvider) params.set("vmp", input.vmProvider);
    if (input.hostType) params.set("hostType", input.hostType);
    const canonical = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const expected = createHmac("sha256", config.checkoutSecret)
      .update(canonical)
      .digest("hex");
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(input.sig);
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEGACY API (backward compatible)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Health ──────────────────────────────────────────────────────────────────
  // DB ping: Traefik must never route to a pod that 500s every DB call (#6101 §3).
  // Liveness stays process-only (a DB outage must NOT crash-loop the pod) — the
  // livenessProbe is a tcpSocket; only this readiness signal carries the DB.

  app.get("/api/health", async (c) => {
    const dbOk = await pingDb(appDb);
    if (!dbOk) {
      return c.json({ ok: false, error: "database unreachable" }, 503);
    }
    return c.json({ ok: true, chains: ["base", "eth", "ton", "sol", "base_sepolia", "eth_sepolia"], tokens: ["usdt", "usdc"] });
  });

  // ── Public config ──────────────────────────────────────────────────────────

  app.get("/api/config", (c) => {
    return c.json({
      wallets: config.wallets,
      prices: config.prices,
      tokens: TOKEN_ADDRESSES,
      chains: ["base", "eth", "ton", "sol", "base_sepolia", "eth_sepolia"],
    });
  });

  // ── Submit tx hash for verification (legacy) ───────────────────────────────

  app.post("/api/payment", async (c) => {
    const body = await c.req.json<{
      txHash: string;
      chainId: ChainId;
      token: TokenId;
      idType: "tg" | "email";
      uid: string;
      plan?: string;
      topup?: string;
      tenantType?: "personal" | "team";
      vmProvider?: "azure" | "hetzner";
      hostType?: "vps";
      amountUsd?: string;
      callbackUrl?: string;
      initData?: string;
      apiKey?: string;
      exp?: string;
      sig?: string;
    }>();

    // ── Auth (optional but recommended) ──
    let authed = false;
    let checkoutIntentVerified = false;
    if (body.initData && config.telegramBotToken) {
      const result = await verifyTelegramInitData(body.initData, config.telegramBotToken);
      if (!result.valid) {
        return c.json({ error: "Invalid Telegram initData" }, 401);
      }
      if (result.user) {
        body.idType = "tg";
        body.uid = String(result.user.id);
      }
      authed = true;
    } else if (body.apiKey) {
      if (!config.apiKey || body.apiKey !== config.apiKey) {
        return c.json({ error: "Invalid API key" }, 401);
      }
      authed = true;
    } else if (verifyCheckoutIntent(body)) {
      authed = true;
      checkoutIntentVerified = true;
    }
    if (!authed) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // ── Validate inputs ──
    if (!body.txHash || typeof body.txHash !== "string") {
      return c.json({ error: "txHash is required" }, 400);
    }
    if (!body.chainId || !["base", "eth", "ton", "sol", "base_sepolia", "eth_sepolia"].includes(body.chainId)) {
      return c.json({ error: "chainId must be base, eth, ton, sol, base_sepolia, or eth_sepolia" }, 400);
    }
    if (!body.idType || !["tg", "email"].includes(body.idType)) {
      return c.json({ error: "idType must be 'tg' or 'email'" }, 400);
    }
    if (!body.uid) {
      return c.json({ error: "uid is required" }, 400);
    }

    const token = body.token || "usdt";
    if (!["usdt", "usdc"].includes(token)) {
      return c.json({ error: "token must be usdt or usdc" }, 400);
    }

    // ── Duplicate check ──
    const existing = await getPaymentByTx(appDb, body.txHash, body.chainId);
    if (existing) {
      return c.json({ error: "Transaction already submitted", payment: existing }, 409);
    }

    // ── Insert pending payment ──
    const payment = await insertPayment(appDb, {
      idType: body.idType,
      uid: body.uid,
      txHash: body.txHash,
      chainId: body.chainId,
      token,
      amountRaw: "0",
      amountUsd: 0,
      planId: body.plan ?? undefined,
    });

    // ── Verify on-chain ──
    try {
      const result = await verifyTransfer(body.txHash, body.chainId, config);

      if (!result) {
        await markPaymentFailed(appDb, payment.id);
        const updated = await getPaymentById(appDb, payment.id);
        return c.json({ payment: updated, error: "Transfer not found or not to our wallet" }, 400);
      }

      const planId = resolveplan(result.amountUsd, config.prices);
      const signedAmountUsd = Number(body.amountUsd);
      const matchesSignedIntentAmount = checkoutIntentVerified &&
        body.plan &&
        Number.isFinite(signedAmountUsd) &&
        Math.abs(result.amountUsd - signedAmountUsd) < 0.01;
      const verifiedPlanId = body.topup
        ? undefined
        : matchesSignedIntentAmount
          ? body.plan
          : planId;
      if (!body.topup && body.plan && verifiedPlanId !== body.plan) {
        await markPaymentFailed(appDb, payment.id);
        return c.json({ error: "Verified amount does not match requested plan", payment: await getPaymentById(appDb, payment.id) }, 400);
      }
      if (!body.topup && !verifiedPlanId) {
        await markPaymentFailed(appDb, payment.id);
        return c.json({ error: "Verified amount does not match a supported plan", payment: await getPaymentById(appDb, payment.id) }, 400);
      }

      await markPaymentVerified(appDb, payment.id, {
        fromAddress: result.from,
        toAddress: result.to,
        amountRaw: result.amountRaw,
        amountUsd: result.amountUsd,
        blockNumber: result.blockNumber,
        planId: verifiedPlanId ?? undefined,
      });

      const verified = await getPaymentById(appDb, payment.id);

      // ── Send webhook callback ──
      if (body.callbackUrl && config.callbackSecret && verified) {
        sendCallback(body.callbackUrl, verified, {
          topup: body.topup,
          tenantType: body.tenantType,
          vmProvider: body.vmProvider,
          hostType: body.hostType,
        }).catch((err) =>
          console.error("Callback error:", err),
        );
      }

      return c.json({ payment: verified });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markPaymentFailed(appDb, payment.id);
      return c.json(
        { error: `Verification failed: ${msg}`, payment: await getPaymentById(appDb, payment.id) },
        500,
      );
    }
  });

  // ── Check payment status (legacy) ──────────────────────────────────────────

  app.get("/api/payment/:id", async (c) => {
    if (!requireApiKey(c)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    // Legacy: try as a stripe_id (pi_...) or number
    const numId = Number(id);
    if (!id.startsWith("pi_") && Number.isNaN(numId)) {
      return c.json({ error: "Invalid payment ID" }, 400);
    }

    const payment = await getPaymentById(appDb, id);
    if (!payment) return c.json({ error: "Payment not found" }, 404);

    return c.json({ payment });
  });

  // ── User payment history (legacy) ──────────────────────────────────────────

  app.get("/api/payments", async (c) => {
    if (!requireApiKey(c)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const idType = c.req.query("idtype");
    const uid = c.req.query("uid");

    if (!idType || !uid) {
      return c.json({ error: "Query params idtype and uid are required" }, 400);
    }

    const payments = await getPaymentsByUser(appDb, idType, uid);
    return c.json({ payments });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STRIPE-LIKE v1 API
  // ══════════════════════════════════════════════════════════════════════════

  // ── Customers ──────────────────────────────────────────────────────────────

  app.post("/v1/customers", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json<{
      id_type: "tg" | "email";
      uid: string;
      name?: string;
      email?: string;
      metadata?: Record<string, unknown>;
    }>();

    if (!body.id_type || !body.uid) {
      return c.json({ error: "id_type and uid are required" }, 400);
    }

    const customer = await getOrCreateCustomer(appDb, body.id_type, body.uid);
    // Apply optional fields if provided
    if (body.name || body.email || body.metadata) {
      const updated = await updateCustomer(appDb, customer.id, {
        name: body.name,
        email: body.email,
        metadata: body.metadata,
      });
      return c.json(updated);
    }
    return c.json(customer);
  });

  app.get("/v1/customers/:id", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const customer = await getCustomerById(appDb, c.req.param("id"));
    if (!customer) return c.json({ error: "Customer not found" }, 404);
    return c.json(customer);
  });

  app.get("/v1/customers", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const limit = Number(c.req.query("limit")) || 10;
    const offset = Number(c.req.query("offset")) || 0;
    const data = await listCustomers(appDb, { limit, offset });
    return c.json({ object: "list", data, has_more: data.length === limit });
  });

  // ── Invoices ───────────────────────────────────────────────────────────────

  app.post("/v1/invoices", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json<{
      customer_id: string;
      plan_id?: string;
      description?: string;
      footer?: string;
      metadata?: Record<string, unknown>;
      due_date?: string;
    }>();

    if (!body.customer_id) {
      return c.json({ error: "customer_id is required" }, 400);
    }

    const invoice = await createInvoice(appDb, {
      customerId: body.customer_id,
      planId: body.plan_id,
      description: body.description,
      footer: body.footer,
      metadata: body.metadata,
      dueDate: body.due_date,
    });
    return c.json(invoice);
  });

  app.get("/v1/invoices/:id", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const expand = c.req.query("expand");
    if (expand === "line_items") {
      const invoice = await getInvoiceWithLineItems(appDb, c.req.param("id"));
      if (!invoice) return c.json({ error: "Invoice not found" }, 404);
      return c.json(invoice);
    }
    const invoice = await getInvoiceById(appDb, c.req.param("id"));
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);
    return c.json(invoice);
  });

  app.get("/v1/invoices", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const limit = Number(c.req.query("limit")) || 10;
    const offset = Number(c.req.query("offset")) || 0;
    const customerId = c.req.query("customer_id");
    const status = c.req.query("status");
    const data = await listInvoices(appDb, { customerId: customerId ?? undefined, status: status ?? undefined, limit, offset });
    return c.json({ object: "list", data, has_more: data.length === limit });
  });

  app.post("/v1/invoices/:id/finalize", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    try {
      const invoice = await finalizeInvoice(appDb, c.req.param("id"));
      return c.json(invoice);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/v1/invoices/:id/void", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    try {
      const invoice = await voidInvoice(appDb, c.req.param("id"));
      return c.json(invoice);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/v1/invoices/:id/line_items", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json<{
      description: string;
      amount: number;
      quantity?: number;
      metadata?: Record<string, unknown>;
    }>();

    if (!body.description || body.amount == null) {
      return c.json({ error: "description and amount are required" }, 400);
    }

    try {
      const item = await addInvoiceLineItem(appDb, c.req.param("id"), body);
      return c.json(item);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // ── Invoice HTML rendering (deprecated — use SPA) ──────────────────────────
  // HTML rendering moved to the Next.js SPA. This route returns JSON only.
  app.get("/v1/invoices/:id/html", async (c) => {
    const invoice = await getInvoiceWithLineItems(appDb, c.req.param("id"));
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);
    return c.json({ error: "HTML rendering removed. Use the SPA at /pay or the JSON API at /v1/invoices/:id" }, 410);
  });

  // ── Payment Intents ────────────────────────────────────────────────────────

  app.post("/v1/payment_intents", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json<{
      customer_id?: string;
      invoice_id?: string;
      amount: number;
      chain_id?: string;
      token?: string;
      plan_id?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    }>();

    if (body.amount == null) {
      return c.json({ error: "amount is required" }, 400);
    }

    const pi = await createPaymentIntent(appDb, {
      customerId: body.customer_id,
      invoiceId: body.invoice_id,
      amount: body.amount,
      chainId: body.chain_id,
      token: body.token,
      planId: body.plan_id,
      description: body.description,
      metadata: body.metadata,
    });
    return c.json(pi);
  });

  app.get("/v1/payment_intents/:id", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const pi = await getPaymentIntentById(appDb, c.req.param("id"));
    if (!pi) return c.json({ error: "Payment intent not found" }, 404);
    return c.json(pi);
  });

  app.get("/v1/payment_intents", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const limit = Number(c.req.query("limit")) || 10;
    const offset = Number(c.req.query("offset")) || 0;
    const customerId = c.req.query("customer_id");
    const status = c.req.query("status");
    const data = await listPaymentIntents(appDb, { customerId: customerId ?? undefined, status: status ?? undefined, limit, offset });
    return c.json({ object: "list", data, has_more: data.length === limit });
  });

  app.post("/v1/payment_intents/:id/confirm", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json<{
      tx_hash?: string;
      chain_id?: string;
      token?: string;
    }>();

    try {
      const pi = await updatePaymentIntentStatus(appDb, c.req.param("id"), "processing", {
        txHash: body.tx_hash,
        chainId: body.chain_id,
        token: body.token,
      });
      return c.json(pi);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // ── Checkout Sessions ──────────────────────────────────────────────────────

  app.post("/v1/checkout/sessions", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json<{
      customer_id?: string;
      invoice_id?: string;
      payment_intent_id?: string;
      plan_id?: string;
      amount: number;
      success_url?: string;
      cancel_url?: string;
      callback_url?: string;
      metadata?: Record<string, unknown>;
      expires_in_minutes?: number;
    }>();

    if (body.amount == null) {
      return c.json({ error: "amount is required" }, 400);
    }

    const session = await createCheckoutSession(
      appDb,
      {
        customerId: body.customer_id,
        invoiceId: body.invoice_id,
        paymentIntentId: body.payment_intent_id,
        planId: body.plan_id,
        amount: body.amount,
        successUrl: body.success_url,
        cancelUrl: body.cancel_url,
        callbackUrl: body.callback_url,
        metadata: body.metadata,
        expiresInMinutes: body.expires_in_minutes,
      },
      config.baseUrl,
    );
    return c.json(session);
  });

  app.get("/v1/checkout/sessions/:id", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const session = await getCheckoutSessionById(appDb, c.req.param("id"));
    if (!session) return c.json({ error: "Checkout session not found" }, 404);
    return c.json(session);
  });

  // ── Webhook Events ─────────────────────────────────────────────────────────

  app.get("/v1/events", async (c) => {
    if (!requireApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
    const limit = Number(c.req.query("limit")) || 10;
    const offset = Number(c.req.query("offset")) || 0;
    const type = c.req.query("type");
    const data = await listWebhookEvents(appDb, { type: type ?? undefined, limit, offset });
    return c.json({ object: "list", data, has_more: data.length === limit });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CHECKOUT PAGE (public)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Checkout redirect (HTML moved to SPA) ──────────────────────────────────
  app.get("/checkout/:id", async (c) => {
    const session = await getCheckoutSessionById(appDb, c.req.param("id"));
    if (!session) return c.json({ error: "Checkout session not found" }, 404);
    if (session.status === "expired") return c.json({ error: "This checkout session has expired" }, 410);
    if (session.status === "complete") return c.json({ error: "This payment has already been completed" }, 200);

    // Return checkout session JSON — the SPA reads this via /v1/checkout/sessions/:id
    return c.json({
      id: session.stripe_id,
      amount: session.amount,
      plan_id: session.plan_id,
      status: session.status,
    });
  });

  // ── TonConnect manifest (required for TON wallet integration) ─────────────
  app.get("/tonconnect-manifest.json", (c) => {
    const baseUrl = config.baseUrl || `${c.req.url.split("/tonconnect")[0]}`;
    return c.json({
      url: baseUrl,
      name: "OpenClaw Crypto Payments",
      iconUrl: "https://openclaw.ai/favicon.ico",
    });
  });

  // ── Payment page (HTML moved to SPA) ───────────────────────────────────────
  // The SPA is hosted separately (e.g. Vercel). These routes now return JSON
  // info directing clients to the SPA or use /api/config for configuration.
  app.get("/pay", (c) =>
    c.json({ message: "Payment page moved to the SPA frontend. Use /api/config for configuration." }),
  );
  app.get("/", (c) =>
    c.json({
      service: "OpenClaw Crypto Payments API",
      docs: "/api/config",
      version: "1.0.0",
    }),
  );

  return app;
}

// ── Webhook callback ─────────────────────────────────────────────────────────

/** Compute HMAC-SHA256 using the Web Crypto API */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendCallback(
  callbackUrl: string,
  payment: PaymentRecord,
  metadata: {
    topup?: string;
    tenantType?: string;
    vmProvider?: string;
    hostType?: string;
  } = {},
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = JSON.stringify({
    event: "payment.verified",
    payment: {
      id: payment.id,
      idType: payment.id_type,
      uid: payment.uid,
      plan: payment.plan_id,
      chain: payment.chain_id,
      token: payment.token,
      amountUsd: payment.amount_usd,
      txHash: payment.tx_hash,
      ...(metadata.topup ? { topup: metadata.topup } : {}),
      ...(metadata.tenantType ? { tenantType: metadata.tenantType } : {}),
      ...(metadata.vmProvider ? { vmProvider: metadata.vmProvider } : {}),
      ...(metadata.hostType ? { hostType: metadata.hostType } : {}),
    },
    timestamp,
  });

  const signature = await hmacSha256Hex(config.callbackSecret, payload);

  const resp = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Timestamp": timestamp,
    },
    body: payload,
  });

  if (!resp.ok) {
    console.error(`Callback to ${callbackUrl} failed: ${resp.status} ${resp.statusText}`);
  } else {
    console.log(`Callback sent for payment ${payment.id}`);
  }
}

// ── Module exports ───────────────────────────────────────────────────────────

const app = createApp();
export { app, config };

// ── Node.js server startup (skipped when imported as a module in Deno/Edge) ──

const g = globalThis as Record<string, unknown>;
if (!g.Deno && g.process) {
  import("@hono/node-server").then(({ serve }) => {
    serve({ fetch: app.fetch, port: config.port }, () => {
      console.log(`Listening on http://localhost:${config.port}`);
    });
  });
}
