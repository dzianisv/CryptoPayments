// ── Postgres access via `pg` (self-hosted CNPG Cluster, issue #6101) ─────────
// Replaces @supabase/supabase-js (PostgREST). Same exported query functions,
// same return shapes — only the transport changed. All SQL is parameterized;
// no string-interpolated values ever reach the database.
//
// Type-shape note: node-postgres returns int8 as string and timestamptz as
// Date by default, but the old PostgREST layer returned JSON numbers and ISO
// timestamp strings. The two type parsers below restore the old shapes, so
// every record type below stays exactly as it was.
import pg from "pg";

const { Pool } = pg;

// int8 (block_number) → JS number (was a JSON number from PostgREST).
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => Number.parseInt(v, 10));
// timestamptz → ISO-8601 string (was an ISO string from PostgREST).
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v: string) => new Date(v).toISOString());

// ── Types ────────────────────────────────────────────────────────────────────

export type DB = pg.Pool;

export interface CustomerRecord {
  id: string;
  stripe_id: string;
  id_type: "tg" | "email";
  uid: string;
  name: string | null;
  email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InvoiceRecord {
  id: string;
  stripe_id: string;
  customer_id: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  amount_remaining: number;
  due_date: string | null;
  paid_at: string | null;
  voided_at: string | null;
  payment_intent_id: string | null;
  plan_id: string | null;
  description: string | null;
  footer: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItemRecord {
  id: string;
  stripe_id: string;
  invoice_id: string;
  description: string;
  amount: number;
  quantity: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PaymentIntentRecord {
  id: string;
  stripe_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  amount: number;
  currency: string;
  status: "requires_payment_method" | "processing" | "succeeded" | "failed" | "canceled";
  chain_id: string | null;
  token: string | null;
  tx_hash: string | null;
  from_address: string | null;
  to_address: string | null;
  block_number: number | null;
  amount_raw: string | null;
  plan_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  succeeded_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckoutSessionRecord {
  id: string;
  stripe_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  payment_intent_id: string | null;
  status: "open" | "complete" | "expired";
  plan_id: string | null;
  amount: number;
  currency: string;
  success_url: string | null;
  cancel_url: string | null;
  callback_url: string | null;
  url: string | null;
  expires_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WebhookEventRecord {
  id: string;
  stripe_id: string;
  type: string;
  data: Record<string, unknown>;
  delivered: boolean;
  delivered_at: string | null;
  delivery_attempts: number;
  last_error: string | null;
  created_at: string;
}

// ── Legacy compat: maps to old PaymentRecord shape ───────────────────────────

export interface PaymentRecord {
  id: string;
  id_type: "tg" | "email";
  uid: string;
  tx_hash: string;
  chain_id: string;
  token: string;
  amount_raw: string;
  amount_usd: number;
  status: "pending" | "verified" | "failed";
  verified_at: string | null;
  plan_id: string | null;
  from_address: string | null;
  to_address: string | null;
  block_number: number | null;
  created_at: string;
}

export interface InsertPayment {
  idType: "tg" | "email";
  uid: string;
  txHash: string;
  chainId: string;
  token: string;
  amountRaw: string;
  amountUsd: number;
  planId?: string;
  fromAddress?: string;
  toAddress?: string;
  blockNumber?: number;
}

// ── Prefix ID generation (client-side fallback) ──────────────────────────────

function prefixedId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

// ── Query helpers ────────────────────────────────────────────────────────────

/** One row or null (the old `.single()` read path, which never threw on empty). */
async function one<T>(db: DB, text: string, params: unknown[]): Promise<T | null> {
  const { rows } = await db.query(text, params);
  return (rows[0] as T | undefined) ?? null;
}

/** One row, throwing when the statement returns none (the old insert/update `.single()`).
 *  Callers wrap the error with the "Failed to ..." prefix, as before. */
async function oneOrThrow<T>(db: DB, text: string, params: unknown[]): Promise<T> {
  const row = await one<T>(db, text, params);
  if (!row) throw new Error("no row returned");
  return row;
}

async function many<T>(db: DB, text: string, params: unknown[]): Promise<T[]> {
  const { rows } = await db.query(text, params);
  return rows as T[];
}

/** Build a `SET "col" = $n, ...` clause from a partial-update object. Keys are
 *  code-controlled column names (never user input); values are parameterized. */
function setClause(
  updates: Record<string, unknown>,
  startAt = 1,
): { clause: string; values: unknown[] } {
  const entries = Object.entries(updates);
  const clause = entries.map(([col], i) => `"${col}" = $${startAt + i}`).join(", ");
  return { clause, values: entries.map(([, v]) => v) };
}

// ── Stripe-ID → UUID resolver ────────────────────────────────────────────────

const STRIPE_PREFIX_TABLE: Record<string, string> = {
  cus_: "customers",
  inv_: "invoices",
  pi_: "payment_intents",
  cs_: "checkout_sessions",
};

/**
 * Resolve a Stripe-style prefixed ID (e.g. cus_abc123) to the row's UUID.
 * If already a UUID, returns it as-is. Returns null if not found.
 */
async function resolveToUuid(db: DB, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const prefix = Object.keys(STRIPE_PREFIX_TABLE).find((p) => id.startsWith(p));
  if (!prefix) return id; // Already a UUID
  const table = STRIPE_PREFIX_TABLE[prefix];
  const row = await one<{ id: string }>(db, `SELECT "id" FROM "${table}" WHERE "stripe_id" = $1`, [id]);
  return row?.id ?? null;
}

// ── Database client ──────────────────────────────────────────────────────────

export function createDB(databaseUrl: string): DB {
  return new Pool({ connectionString: databaseUrl });
}

/** Liveness probe for the /api/health handler: true iff the DB answers. */
export async function pingDb(db: DB): Promise<boolean> {
  try {
    await db.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// ── Customers ────────────────────────────────────────────────────────────────

export async function getOrCreateCustomer(
  db: DB,
  idType: "tg" | "email",
  uid: string,
): Promise<CustomerRecord> {
  // Try to find existing customer
  const existing = await one<CustomerRecord>(
    db,
    `SELECT * FROM "customers" WHERE "id_type" = $1 AND "uid" = $2`,
    [idType, uid],
  );
  if (existing) return existing;

  // Create new customer
  try {
    return await oneOrThrow<CustomerRecord>(
      db,
      `INSERT INTO "customers" ("id_type", "uid", "stripe_id") VALUES ($1, $2, $3) RETURNING *`,
      [idType, uid, prefixedId("cus")]
    );
  } catch (err) {
    throw new Error(`Failed to create customer: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getCustomerById(db: DB, id: string): Promise<CustomerRecord | null> {
  // Support both UUID and stripe_id (cus_...)
  const column = id.startsWith("cus_") ? "stripe_id" : "id";
  return one<CustomerRecord>(db, `SELECT * FROM "customers" WHERE "${column}" = $1`, [id]);
}

export async function updateCustomer(
  db: DB,
  id: string,
  updates: { name?: string; email?: string; metadata?: Record<string, unknown> },
): Promise<CustomerRecord | null> {
  const column = id.startsWith("cus_") ? "stripe_id" : "id";
  const { clause, values } = setClause(updates as Record<string, unknown>);
  if (!clause) return getCustomerById(db, id);
  try {
    return await oneOrThrow<CustomerRecord>(
      db,
      `UPDATE "customers" SET ${clause} WHERE "${column}" = $${values.length + 1} RETURNING *`,
      [...values, id]
    );
  } catch (err) {
    throw new Error(`Failed to update customer: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function listCustomers(
  db: DB,
  opts: { limit?: number; offset?: number } = {},
): Promise<CustomerRecord[]> {
  const limit = opts.limit ?? 10;
  const offset = opts.offset ?? 0;
  return many<CustomerRecord>(
    db,
    `SELECT * FROM "customers" ORDER BY "created_at" DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
}

// ── Invoices ─────────────────────────────────────────────────────────────────

export async function createInvoice(
  db: DB,
  input: {
    customerId: string;
    planId?: string;
    description?: string;
    footer?: string;
    metadata?: Record<string, unknown>;
    dueDate?: string;
  },
): Promise<InvoiceRecord> {
  try {
    return await oneOrThrow<InvoiceRecord>(
      db,
      `INSERT INTO "invoices" ("stripe_id", "customer_id", "plan_id", "description", "footer", "metadata", "due_date")
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        prefixedId("inv"),
        input.customerId,
        input.planId ?? null,
        input.description ?? null,
        input.footer ?? null,
        input.metadata ?? {},
        input.dueDate ?? null,
      ]
    );
  } catch (err) {
    throw new Error(`Failed to create invoice: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getInvoiceById(db: DB, id: string): Promise<InvoiceRecord | null> {
  const column = id.startsWith("inv_") ? "stripe_id" : "id";
  return one<InvoiceRecord>(db, `SELECT * FROM "invoices" WHERE "${column}" = $1`, [id]);
}

export async function getInvoiceWithLineItems(
  db: DB,
  id: string,
): Promise<(InvoiceRecord & { line_items: InvoiceLineItemRecord[] }) | null> {
  const column = id.startsWith("inv_") ? "stripe_id" : "id";
  const invoice = await one<InvoiceRecord>(
    db,
    `SELECT * FROM "invoices" WHERE "${column}" = $1`,
    [id],
  );
  if (!invoice) return null;
  const lineItems = await many<InvoiceLineItemRecord>(
    db,
    `SELECT * FROM "invoice_line_items" WHERE "invoice_id" = $1 ORDER BY "created_at" ASC`,
    [invoice.id],
  );
  return { ...invoice, line_items: lineItems };
}

export async function listInvoices(
  db: DB,
  opts: { customerId?: string; status?: string; limit?: number; offset?: number } = {},
): Promise<InvoiceRecord[]> {
  const limit = opts.limit ?? 10;
  const offset = opts.offset ?? 0;
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (opts.customerId) {
    values.push(opts.customerId);
    conditions.push(`"customer_id" = $${values.length}`);
  }
  if (opts.status) {
    values.push(opts.status);
    conditions.push(`"status" = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit, offset);
  return many<InvoiceRecord>(
    db,
    `SELECT * FROM "invoices" ${where} ORDER BY "created_at" DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
}

export async function addInvoiceLineItem(
  db: DB,
  invoiceId: string,
  item: { description: string; amount: number; quantity?: number; metadata?: Record<string, unknown> },
): Promise<InvoiceLineItemRecord> {
  // Resolve invoice UUID
  const invoice = await getInvoiceById(db, invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "draft") throw new Error("Can only add line items to draft invoices");

  let lineItem: InvoiceLineItemRecord;
  try {
    lineItem = await oneOrThrow<InvoiceLineItemRecord>(
      db,
      `INSERT INTO "invoice_line_items" ("stripe_id", "invoice_id", "description", "amount", "quantity", "metadata")
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        prefixedId("il"),
        invoice.id,
        item.description,
        item.amount,
        item.quantity ?? 1,
        item.metadata ?? {},
      ]
    );
  } catch (err) {
    throw new Error(`Failed to add line item: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Recalculate invoice totals
  await recalculateInvoiceTotals(db, invoice.id);

  return lineItem;
}

async function recalculateInvoiceTotals(db: DB, invoiceId: string): Promise<void> {
  const items = await many<{ amount: number; quantity: number }>(
    db,
    `SELECT "amount", "quantity" FROM "invoice_line_items" WHERE "invoice_id" = $1`,
    [invoiceId],
  );

  const subtotal = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  const total = subtotal; // No tax for crypto payments

  await db.query(
    `UPDATE "invoices" SET "subtotal" = $1, "total" = $2, "amount_remaining" = $3 WHERE "id" = $4`,
    [subtotal, total, total, invoiceId],
  );
}

export async function finalizeInvoice(db: DB, invoiceId: string): Promise<InvoiceRecord> {
  const invoice = await getInvoiceById(db, invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "draft") throw new Error("Can only finalize draft invoices");

  try {
    return await oneOrThrow<InvoiceRecord>(
      db,
      `UPDATE "invoices" SET "status" = 'open' WHERE "id" = $1 RETURNING *`,
      [invoice.id]
    );
  } catch (err) {
    throw new Error(`Failed to finalize invoice: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function voidInvoice(db: DB, invoiceId: string): Promise<InvoiceRecord> {
  const invoice = await getInvoiceById(db, invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "open") throw new Error("Can only void open invoices");

  try {
    return await oneOrThrow<InvoiceRecord>(
      db,
      `UPDATE "invoices" SET "status" = 'void', "voided_at" = $1 WHERE "id" = $2 RETURNING *`,
      [new Date().toISOString(), invoice.id]
    );
  } catch (err) {
    throw new Error(`Failed to void invoice: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function markInvoicePaid(
  db: DB,
  invoiceId: string,
  paymentIntentId: string,
): Promise<InvoiceRecord> {
  const invoice = await getInvoiceById(db, invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  try {
    return await oneOrThrow<InvoiceRecord>(
      db,
      `UPDATE "invoices" SET "status" = 'paid', "paid_at" = $1, "payment_intent_id" = $2,
        "amount_paid" = $3, "amount_remaining" = 0 WHERE "id" = $4 RETURNING *`,
      [new Date().toISOString(), paymentIntentId, invoice.total, invoice.id]
    );
  } catch (err) {
    throw new Error(`Failed to mark invoice paid: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Payment Intents ──────────────────────────────────────────────────────────

export async function createPaymentIntent(
  db: DB,
  input: {
    customerId?: string;
    invoiceId?: string;
    amount: number;
    chainId?: string;
    token?: string;
    planId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<PaymentIntentRecord> {
  // Resolve stripe_ids (cus_..., inv_...) to UUIDs for FK columns
  const customerId = await resolveToUuid(db, input.customerId);
  const invoiceId = await resolveToUuid(db, input.invoiceId);

  try {
    return await oneOrThrow<PaymentIntentRecord>(
      db,
      `INSERT INTO "payment_intents" ("stripe_id", "customer_id", "invoice_id", "amount", "chain_id", "token", "plan_id", "description", "metadata")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        prefixedId("pi"),
        customerId,
        invoiceId,
        input.amount,
        input.chainId ?? null,
        input.token ?? null,
        input.planId ?? null,
        input.description ?? null,
        input.metadata ?? {},
      ]
    );
  } catch (err) {
    throw new Error(`Failed to create payment intent: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getPaymentIntentById(db: DB, id: string): Promise<PaymentIntentRecord | null> {
  const column = id.startsWith("pi_") ? "stripe_id" : "id";
  return one<PaymentIntentRecord>(db, `SELECT * FROM "payment_intents" WHERE "${column}" = $1`, [id]);
}

export async function getPaymentIntentByTx(
  db: DB,
  txHash: string,
  chainId: string,
): Promise<PaymentIntentRecord | null> {
  return one<PaymentIntentRecord>(
    db,
    `SELECT * FROM "payment_intents" WHERE "tx_hash" = $1 AND "chain_id" = $2`,
    [txHash, chainId],
  );
}

export async function listPaymentIntents(
  db: DB,
  opts: { customerId?: string; status?: string; limit?: number; offset?: number } = {},
): Promise<PaymentIntentRecord[]> {
  const limit = opts.limit ?? 10;
  const offset = opts.offset ?? 0;
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (opts.customerId) {
    values.push(opts.customerId);
    conditions.push(`"customer_id" = $${values.length}`);
  }
  if (opts.status) {
    values.push(opts.status);
    conditions.push(`"status" = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit, offset);
  return many<PaymentIntentRecord>(
    db,
    `SELECT * FROM "payment_intents" ${where} ORDER BY "created_at" DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
}

export async function updatePaymentIntentStatus(
  db: DB,
  id: string,
  status: PaymentIntentRecord["status"],
  details?: {
    txHash?: string;
    chainId?: string;
    token?: string;
    fromAddress?: string;
    toAddress?: string;
    amountRaw?: string;
    blockNumber?: number;
    planId?: string;
  },
): Promise<PaymentIntentRecord> {
  const updates: Record<string, unknown> = { status };
  if (details?.txHash) updates.tx_hash = details.txHash;
  if (details?.chainId) updates.chain_id = details.chainId;
  if (details?.token) updates.token = details.token;
  if (details?.fromAddress) updates.from_address = details.fromAddress;
  if (details?.toAddress) updates.to_address = details.toAddress;
  if (details?.amountRaw) updates.amount_raw = details.amountRaw;
  if (details?.blockNumber) updates.block_number = details.blockNumber;
  if (details?.planId) updates.plan_id = details.planId;
  if (status === "succeeded") updates.succeeded_at = new Date().toISOString();
  if (status === "canceled") updates.canceled_at = new Date().toISOString();

  const column = id.startsWith("pi_") ? "stripe_id" : "id";
  const { clause, values } = setClause(updates);
  try {
    return await oneOrThrow<PaymentIntentRecord>(
      db,
      `UPDATE "payment_intents" SET ${clause} WHERE "${column}" = $${values.length + 1} RETURNING *`,
      [...values, id]
    );
  } catch (err) {
    throw new Error(`Failed to update payment intent: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Checkout Sessions ────────────────────────────────────────────────────────

export async function createCheckoutSession(
  db: DB,
  input: {
    customerId?: string;
    invoiceId?: string;
    paymentIntentId?: string;
    planId?: string;
    amount: number;
    successUrl?: string;
    cancelUrl?: string;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
    expiresInMinutes?: number;
  },
  baseUrl: string,
): Promise<CheckoutSessionRecord> {
  const stripeId = prefixedId("cs");
  const expiresAt = new Date(Date.now() + (input.expiresInMinutes ?? 30) * 60 * 1000).toISOString();
  const url = `${baseUrl}/checkout/${stripeId}`;

  // Resolve stripe_ids (cus_..., inv_..., pi_...) to UUIDs for FK columns
  const customerId = await resolveToUuid(db, input.customerId);
  const invoiceId = await resolveToUuid(db, input.invoiceId);
  const paymentIntentId = await resolveToUuid(db, input.paymentIntentId);

  try {
    return await oneOrThrow<CheckoutSessionRecord>(
      db,
      `INSERT INTO "checkout_sessions" ("stripe_id", "status", "customer_id", "invoice_id", "payment_intent_id",
        "plan_id", "amount", "success_url", "cancel_url", "callback_url", "url", "expires_at", "metadata")
       VALUES ($1, 'open', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        stripeId,
        customerId,
        invoiceId,
        paymentIntentId,
        input.planId ?? null,
        input.amount,
        input.successUrl ?? null,
        input.cancelUrl ?? null,
        input.callbackUrl ?? null,
        url,
        expiresAt,
        input.metadata ?? {},
      ]
    );
  } catch (err) {
    throw new Error(`Failed to create checkout session: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getCheckoutSessionById(db: DB, id: string): Promise<CheckoutSessionRecord | null> {
  const column = id.startsWith("cs_") ? "stripe_id" : "id";
  return one<CheckoutSessionRecord>(db, `SELECT * FROM "checkout_sessions" WHERE "${column}" = $1`, [id]);
}

export async function completeCheckoutSession(
  db: DB,
  id: string,
  paymentIntentId: string,
): Promise<CheckoutSessionRecord> {
  const column = id.startsWith("cs_") ? "stripe_id" : "id";
  const resolvedPiId = await resolveToUuid(db, paymentIntentId);
  try {
    return await oneOrThrow<CheckoutSessionRecord>(
      db,
      `UPDATE "checkout_sessions" SET "status" = 'complete', "payment_intent_id" = $1, "completed_at" = $2
       WHERE "${column}" = $3 RETURNING *`,
      [resolvedPiId, new Date().toISOString(), id]
    );
  } catch (err) {
    throw new Error(`Failed to complete checkout session: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Webhook Events ───────────────────────────────────────────────────────────

export async function createWebhookEvent(
  db: DB,
  type: string,
  eventData: Record<string, unknown>,
): Promise<WebhookEventRecord> {
  try {
    return await oneOrThrow<WebhookEventRecord>(
      db,
      `INSERT INTO "webhook_events" ("stripe_id", "type", "data") VALUES ($1, $2, $3) RETURNING *`,
      [prefixedId("evt"), type, eventData]
    );
  } catch (err) {
    throw new Error(`Failed to create webhook event: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function markEventDelivered(
  db: DB,
  eventId: string,
  deliveryError?: string,
): Promise<void> {
  const updates: Record<string, unknown> = {
    delivery_attempts: 1,
  };

  if (deliveryError) {
    updates.last_error = deliveryError;
  } else {
    updates.delivered = true;
    updates.delivered_at = new Date().toISOString();
  }

  const { clause, values } = setClause(updates);
  await db.query(
    `UPDATE "webhook_events" SET ${clause} WHERE "id" = $${values.length + 1}`,
    [...values, eventId],
  );
}

export async function listWebhookEvents(
  db: DB,
  opts: { type?: string; limit?: number; offset?: number } = {},
): Promise<WebhookEventRecord[]> {
  const limit = opts.limit ?? 10;
  const offset = opts.offset ?? 0;
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (opts.type) {
    values.push(opts.type);
    conditions.push(`"type" = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit, offset);
  return many<WebhookEventRecord>(
    db,
    `SELECT * FROM "webhook_events" ${where} ORDER BY "created_at" DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
}

// ── Legacy compatibility layer ───────────────────────────────────────────────
// These functions provide backward compatibility with the old SQLite-based API.

/**
 * Insert a payment using the legacy format.
 * Creates a customer (if needed) and a payment intent, returns a PaymentRecord.
 */
export async function insertPayment(db: DB, p: InsertPayment): Promise<PaymentRecord> {
  const customer = await getOrCreateCustomer(db, p.idType, p.uid);
  const amountCents = Math.round(p.amountUsd * 100);

  const pi = await createPaymentIntent(db, {
    customerId: customer.id,
    amount: amountCents,
    chainId: p.chainId,
    token: p.token,
    planId: p.planId,
  });

  // Set tx_hash and metadata directly
  if (p.txHash) {
    await db.query(
      `UPDATE "payment_intents" SET "tx_hash" = $1, "from_address" = $2, "to_address" = $3,
        "block_number" = $4, "amount_raw" = $5 WHERE "id" = $6`,
      [p.txHash, p.fromAddress ?? null, p.toAddress ?? null, p.blockNumber ?? null, p.amountRaw, pi.id],
    );
  }

  return piToPaymentRecord(
    { ...pi, tx_hash: p.txHash, from_address: p.fromAddress ?? null, to_address: p.toAddress ?? null, block_number: p.blockNumber ?? null, amount_raw: p.amountRaw },
    customer,
  );
}

export async function getPaymentById(db: DB, id: string): Promise<PaymentRecord | null> {
  const pi = await getPaymentIntentById(db, id);
  if (!pi || !pi.customer_id) return null;
  const customer = await getCustomerById(db, pi.customer_id);
  if (!customer) return null;
  return piToPaymentRecord(pi, customer);
}

export async function getPaymentByTx(db: DB, txHash: string, chainId: string): Promise<PaymentRecord | null> {
  const pi = await getPaymentIntentByTx(db, txHash, chainId);
  if (!pi || !pi.customer_id) return null;
  const customer = await getCustomerById(db, pi.customer_id);
  if (!customer) return null;
  return piToPaymentRecord(pi, customer);
}

export async function getPaymentsByUser(db: DB, idType: string, uid: string): Promise<PaymentRecord[]> {
  const customer = await one<CustomerRecord>(
    db,
    `SELECT * FROM "customers" WHERE "id_type" = $1 AND "uid" = $2`,
    [idType, uid],
  );
  if (!customer) return [];

  const pis = await listPaymentIntents(db, { customerId: customer.id, limit: 100 });
  return pis.map((pi) => piToPaymentRecord(pi, customer));
}

export async function markPaymentVerified(
  db: DB,
  id: string,
  details: { fromAddress: string; toAddress: string; amountRaw: string; amountUsd: number; blockNumber?: number; planId?: string },
): Promise<void> {
  await updatePaymentIntentStatus(db, id, "succeeded", {
    fromAddress: details.fromAddress,
    toAddress: details.toAddress,
    amountRaw: details.amountRaw,
    blockNumber: details.blockNumber,
    planId: details.planId,
  });

  // Update amount in cents
  const column = id.startsWith("pi_") ? "stripe_id" : "id";
  await db.query(
    `UPDATE "payment_intents" SET "amount" = $1 WHERE "${column}" = $2`,
    [Math.round(details.amountUsd * 100), id],
  );
}

export async function markPaymentFailed(db: DB, id: string): Promise<void> {
  await updatePaymentIntentStatus(db, id, "failed");
}

/** Convert a PaymentIntentRecord + CustomerRecord to the legacy PaymentRecord shape */
function piToPaymentRecord(pi: PaymentIntentRecord, customer: CustomerRecord): PaymentRecord {
  return {
    id: pi.stripe_id,
    id_type: customer.id_type,
    uid: customer.uid,
    tx_hash: pi.tx_hash ?? "",
    chain_id: pi.chain_id ?? "",
    token: pi.token ?? "",
    amount_raw: pi.amount_raw ?? "0",
    amount_usd: pi.amount / 100,
    status: pi.status === "succeeded" ? "verified" : pi.status === "failed" ? "failed" : "pending",
    verified_at: pi.succeeded_at,
    plan_id: pi.plan_id,
    from_address: pi.from_address,
    to_address: pi.to_address,
    block_number: pi.block_number,
    created_at: pi.created_at,
  };
}
