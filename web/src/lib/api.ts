// API client for the CryptoPayments Edge Function

import { API_BASE, type AppConfig, type PaymentRequest, type PaymentResult } from "./config";

// #6072 (b): the config fetch was unbounded — a hung/slow /api/config kept the
// pay page on its loading spinner forever (page.tsx renders "Select network"
// only after fetchConfig settles) and the E2E gate timed out bare. Bound it so
// it either resolves or rejects promptly and the failure surfaces instead of
// hanging. No retry: a retry would mask a real outage. 10s matches the
// endpoint's healthy ~1s response with headroom.
const CONFIG_FETCH_TIMEOUT_MS = 10_000;

export async function fetchConfig(): Promise<AppConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/config`, {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Failed to load config: ${res.status}`);
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(
        `Config request timed out after ${CONFIG_FETCH_TIMEOUT_MS}ms: ${API_BASE}/api/config`,
      );
    }
    throw err;
  }
}

export async function submitPayment(body: PaymentRequest): Promise<PaymentResult> {
  const res = await fetch(`${API_BASE}/api/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (res.status === 409) {
    throw new Error("This transaction was already submitted.");
  }
  if (!res.ok) {
    throw new Error(data.error || `Verification failed (${res.status})`);
  }
  return data;
}

export async function checkPaymentStatus(id: string): Promise<PaymentResult> {
  const res = await fetch(`${API_BASE}/api/payment/${id}`);
  if (!res.ok) throw new Error(`Payment not found: ${res.status}`);
  return res.json();
}
