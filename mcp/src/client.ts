/**
 * Thin typed client over the Pay by AgentLabs /v1 API.
 *
 * The endpoint surface mirrors src/server.ts in this repo exactly — every
 * method maps to a route the API actually exposes (all require the
 * `x-api-key` header):
 *
 *   POST /v1/customers                     GET /v1/customers/:id
 *   GET  /v1/customers
 *   POST /v1/invoices                      GET /v1/invoices/:id
 *   GET  /v1/invoices                      POST /v1/invoices/:id/finalize
 *   POST /v1/invoices/:id/void             POST /v1/invoices/:id/line_items
 *   POST /v1/payment_intents               GET /v1/payment_intents/:id
 *   GET  /v1/payment_intents               POST /v1/payment_intents/:id/confirm
 *   POST /v1/checkout/sessions             GET /v1/checkout/sessions/:id
 *   GET  /v1/events
 */

export const DEFAULT_API_BASE = "https://pay.agentlabs.cc";

export interface PayClientConfig {
  baseUrl: string;
  apiKey: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

export class PayApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const detail =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : typeof body === "string"
          ? body
          : JSON.stringify(body);
    super(`Pay by AgentLabs API error (HTTP ${status}): ${detail}`);
    this.name = "PayApiError";
    this.status = status;
    this.body = body;
  }
}

type Query = Record<string, string | number | undefined>;

export class PayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: PayClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  /**
   * Build a client from the environment:
   *   AGENTLABS_PAY_API_KEY  (required to call the API)
   *   AGENTLABS_PAY_API_BASE (optional; defaults to the production API)
   *
   * A missing key does not throw here — the server should still start and
   * list its tools; individual calls fail with a clear error instead.
   */
  static fromEnv(
    env: Record<string, string | undefined>,
    fetchFn?: typeof fetch,
  ): PayClient {
    return new PayClient({
      baseUrl: env.AGENTLABS_PAY_API_BASE || DEFAULT_API_BASE,
      apiKey: env.AGENTLABS_PAY_API_KEY ?? "",
      fetchFn,
    });
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: { body?: unknown; query?: Query } = {},
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        "AGENTLABS_PAY_API_KEY is not set. API keys for Pay by AgentLabs are " +
          "issued on request today (see https://pay.agentlabs.cc/sdk).",
      );
    }

    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const res = await this.fetchFn(url.toString(), {
      method,
      headers: {
        "x-api-key": this.apiKey,
        ...(opts.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON response body — surface it as-is in the error below.
    }
    if (!res.ok) throw new PayApiError(res.status, parsed);
    return parsed as T;
  }

  // ── Customers ────────────────────────────────────────────────────────────

  createCustomer(input: {
    id_type: "tg" | "email";
    uid: string;
    name?: string;
    email?: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown> {
    return this.request("POST", "/v1/customers", { body: input });
  }

  getCustomer(id: string): Promise<unknown> {
    return this.request("GET", `/v1/customers/${encodeURIComponent(id)}`);
  }

  listCustomers(query: { limit?: number; offset?: number } = {}): Promise<unknown> {
    return this.request("GET", "/v1/customers", { query });
  }

  // ── Invoices ─────────────────────────────────────────────────────────────

  createInvoice(input: {
    customer_id: string;
    plan_id?: string;
    description?: string;
    footer?: string;
    metadata?: Record<string, unknown>;
    due_date?: string;
  }): Promise<unknown> {
    return this.request("POST", "/v1/invoices", { body: input });
  }

  getInvoice(id: string, expandLineItems = false): Promise<unknown> {
    return this.request("GET", `/v1/invoices/${encodeURIComponent(id)}`, {
      query: expandLineItems ? { expand: "line_items" } : {},
    });
  }

  listInvoices(
    query: {
      customer_id?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<unknown> {
    return this.request("GET", "/v1/invoices", { query });
  }

  addInvoiceLineItem(
    invoiceId: string,
    input: {
      description: string;
      amount: number;
      quantity?: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/v1/invoices/${encodeURIComponent(invoiceId)}/line_items`,
      { body: input },
    );
  }

  finalizeInvoice(id: string): Promise<unknown> {
    return this.request("POST", `/v1/invoices/${encodeURIComponent(id)}/finalize`, {
      body: {},
    });
  }

  voidInvoice(id: string): Promise<unknown> {
    return this.request("POST", `/v1/invoices/${encodeURIComponent(id)}/void`, {
      body: {},
    });
  }

  // ── Payment intents ──────────────────────────────────────────────────────

  createPaymentIntent(input: {
    amount: number;
    customer_id?: string;
    invoice_id?: string;
    chain_id?: string;
    token?: string;
    plan_id?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown> {
    return this.request("POST", "/v1/payment_intents", { body: input });
  }

  getPaymentIntent(id: string): Promise<unknown> {
    return this.request("GET", `/v1/payment_intents/${encodeURIComponent(id)}`);
  }

  listPaymentIntents(
    query: {
      customer_id?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<unknown> {
    return this.request("GET", "/v1/payment_intents", { query });
  }

  confirmPaymentIntent(
    id: string,
    input: { tx_hash?: string; chain_id?: string; token?: string } = {},
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/v1/payment_intents/${encodeURIComponent(id)}/confirm`,
      { body: input },
    );
  }

  // ── Checkout sessions ────────────────────────────────────────────────────

  createCheckoutSession(input: {
    amount: number;
    customer_id?: string;
    invoice_id?: string;
    payment_intent_id?: string;
    plan_id?: string;
    success_url?: string;
    cancel_url?: string;
    callback_url?: string;
    metadata?: Record<string, unknown>;
    expires_in_minutes?: number;
  }): Promise<unknown> {
    return this.request("POST", "/v1/checkout/sessions", { body: input });
  }

  getCheckoutSession(id: string): Promise<unknown> {
    return this.request(
      "GET",
      `/v1/checkout/sessions/${encodeURIComponent(id)}`,
    );
  }

  // ── Events ───────────────────────────────────────────────────────────────

  listEvents(
    query: { type?: string; limit?: number; offset?: number } = {},
  ): Promise<unknown> {
    return this.request("GET", "/v1/events", { query });
  }
}
