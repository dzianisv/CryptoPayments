/*!
 * Pay by AgentLabs — embed snippet (MIT License)
 * https://pay.agentlabs.cc/sdk · Source: https://github.com/dzianisv/CryptoPayments
 *
 * Opens the hosted Pay by AgentLabs checkout from any website.
 *
 * Usage:
 *   <script src="https://pay.agentlabs.cc/agentlabs-pay.js"></script>
 *   <button onclick="AgentLabsPay.checkout({ url: SIGNED_CHECKOUT_URL })">
 *     Pay with crypto
 *   </button>
 *
 * SIGNED_CHECKOUT_URL is created by YOUR server — either the `url` of a
 * checkout session created via POST /v1/checkout/sessions, or a payment link
 * your server signed with your checkout secret (HMAC-SHA256 over the sorted
 * payment parameters, passed as `sig`). Never put your API key or checkout
 * secret in browser code.
 *
 * You can also build the checkout URL from already-signed parameters:
 *   AgentLabsPay.checkout({ uid: "user-123", plan: "pro", exp: 1799999999, sig: "…" })
 *   AgentLabsPay.checkout({ uid: "user-123", amountUsd: "25", exp: 1799999999, sig: "…" })
 */
(function (global) {
  "use strict";

  var PAY_BASE = "https://pay.agentlabs.cc";

  function buildUrl(opts) {
    opts = opts || {};
    if (opts.url) return opts.url;
    var params = new URLSearchParams();
    if (opts.uid) params.set("uid", String(opts.uid));
    if (opts.plan) params.set("plan", String(opts.plan));
    if (opts.topup) params.set("topup", String(opts.topup));
    if (opts.amountUsd) params.set("amountUsd", String(opts.amountUsd));
    if (opts.callback) params.set("callback", String(opts.callback));
    if (opts.exp) params.set("exp", String(opts.exp));
    if (opts.sig) params.set("sig", String(opts.sig));
    var qs = params.toString();
    return PAY_BASE + "/pay" + (qs ? "?" + qs : "");
  }

  function checkout(opts) {
    var url = buildUrl(opts || {});
    if (opts && opts.newTab === false) {
      global.location.href = url;
    } else {
      global.open(url, "_blank", "noopener");
    }
    return url;
  }

  global.AgentLabsPay = {
    checkout: checkout,
    buildUrl: buildUrl,
    version: "1.0.0",
  };
})(typeof window !== "undefined" ? window : this);
