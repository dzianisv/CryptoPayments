import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { PayClient } from "../src/client.js";
import { registerTools } from "../src/tools.js";

/**
 * Protocol-level test: a real MCP client talks to the server over the
 * SDK's in-memory transport; only the HTTP layer to the payments API is
 * stubbed.
 */
async function connectedPair(fetchFn: typeof fetch) {
  const payClient = new PayClient({
    baseUrl: "https://pay.example.test",
    apiKey: "test-key",
    fetchFn,
  });
  const server = new McpServer({ name: "agentlabs-pay", version: "0.1.0" });
  registerTools(server, payClient);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

describe("MCP protocol", () => {
  it("lists all tools over the transport", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const client = await connectedPair(fetchFn);

    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name)).toContain("create_checkout_session");
    expect(tools).toHaveLength(16);
    const create = tools.find((t) => t.name === "create_checkout_session");
    expect(create?.inputSchema.required).toContain("amount");
  });

  it("calls create_checkout_session end to end (stubbed HTTP)", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({ id: "cs_123", url: "https://pay.example.test/pay" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
    const client = await connectedPair(fetchFn);

    const result = await client.callTool({
      name: "create_checkout_session",
      arguments: { amount: 25, plan_id: "pro" },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(JSON.parse(text)).toMatchObject({ id: "cs_123" });
  });

  it("surfaces API 401s as tool errors, not crashes", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const client = await connectedPair(fetchFn);

    const result = await client.callTool({
      name: "get_checkout_session",
      arguments: { id: "cs_nope" },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("401");
    expect(text).toContain("Unauthorized");
  });
});
