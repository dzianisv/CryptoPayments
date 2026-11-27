// Pay by AgentLabs — one public domain: pay.agentlabs.cc is both the hosted
// checkout site and the API base. This Pages Function proxies /v1/* to the
// backend service (origin: https://crypto-payments.agentpod.agentlabs.cc),
// forwarding method, headers (incl. x-api-key), query and body, and returning
// the backend's status, headers and body unchanged.
const ORIGIN = "https://crypto-payments.agentpod.agentlabs.cc";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const headers = new Headers(context.request.headers);
  headers.delete("host");
  const init = {
    method: context.request.method,
    headers,
    redirect: "manual",
  };
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = context.request.body;
    init.duplex = "half";
  }
  return fetch(ORIGIN + url.pathname + url.search, init);
}
