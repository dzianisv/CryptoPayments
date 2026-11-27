import { describe, expect, it, vi } from "vitest";
import { PayApiError, PayClient } from "../src/client.js";

function stubFetch(response: { status?: number; body?: unknown } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response.body ?? { ok: true }), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

describe("PayClient", () => {
  it("sends the x-api-key header and JSON body to the right URL", async () => {
    const { fetchFn, calls } = stubFetch({ body: { id: "cs_1" } });
    const client = new PayClient({
      baseUrl: "https://pay.example.test/",
      apiKey: "test-key",
      fetchFn,
    });

    const out = await client.createCheckoutSession({ amount: 25 });

    expect(out).toEqual({ id: "cs_1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://pay.example.test/v1/checkout/sessions");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["x-api-key"]).toBe(
      "test-key",
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ amount: 25 });
  });

  it("encodes query params and skips undefined ones", async () => {
    const { fetchFn, calls } = stubFetch({ body: { object: "list", data: [] } });
    const client = new PayClient({
      baseUrl: "https://pay.example.test",
      apiKey: "k",
      fetchFn,
    });

    await client.listInvoices({ customer_id: "cus 1", limit: 5 });

    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v1/invoices");
    expect(url.searchParams.get("customer_id")).toBe("cus 1");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.has("status")).toBe(false);
    expect(url.searchParams.has("offset")).toBe(false);
  });

  it("maps API errors to PayApiError with status and message", async () => {
    const { fetchFn } = stubFetch({ status: 401, body: { error: "Unauthorized" } });
    const client = new PayClient({
      baseUrl: "https://pay.example.test",
      apiKey: "bad",
      fetchFn,
    });

    await expect(client.getCheckoutSession("cs_x")).rejects.toMatchObject({
      name: "PayApiError",
      status: 401,
      message: expect.stringContaining("Unauthorized"),
    });
    await expect(client.getCheckoutSession("cs_x")).rejects.toBeInstanceOf(
      PayApiError,
    );
  });

  it("fails clearly when no API key is configured", async () => {
    const { fetchFn, calls } = stubFetch();
    const client = PayClient.fromEnv({}, fetchFn);

    await expect(client.listEvents()).rejects.toThrow(/AGENTLABS_PAY_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it("fromEnv honors AGENTLABS_PAY_API_BASE", async () => {
    const { fetchFn, calls } = stubFetch({ body: { object: "list", data: [] } });
    const client = PayClient.fromEnv(
      {
        AGENTLABS_PAY_API_KEY: "k",
        AGENTLABS_PAY_API_BASE: "https://proxy.example.test/",
      },
      fetchFn,
    );

    await client.listEvents();

    expect(calls[0].url.startsWith("https://proxy.example.test/v1/events")).toBe(
      true,
    );
  });
});
