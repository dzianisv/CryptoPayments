import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CodeWindow, type CodeTab } from "@/components/sdk/code-window";

const REPO_URL = "https://github.com/dzianisv/CryptoPayments";
const API_BASE = "https://pay.agentlabs.cc";

export function buildSdkMetadata(url: string): Metadata {
  return {
    title: "Pay by AgentLabs SDK \u2014 Free Open-Source Crypto Payments SDK, No Fees",
    description:
      "Free open-source SDK to accept USDC and USDT payments for services and subscriptions. No platform fees, non-custodial \u2014 payments settle directly to your wallet. WalletConnect supported. A Coinbase Pay and Binance Pay alternative, with an API AI agents can pay through.",
    keywords: [
      "crypto payments SDK",
      "accept crypto payments",
      "no fee crypto payments",
      "USDC payments",
      "USDT payments",
      "crypto subscriptions",
      "Coinbase Pay alternative",
      "Binance Pay alternative",
      "MCP payments",
      "WalletConnect checkout",
      "open source payment gateway",
    ],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "Pay by AgentLabs",
      title: "Pay by AgentLabs \u2014 Free Open-Source Crypto Payments SDK",
      description:
        "Accept USDC and USDT for services and subscriptions with no platform fees. Payments settle directly to your wallet. Open source, WalletConnect supported, built for agents.",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: "Pay by AgentLabs \u2014 Free Open-Source Crypto Payments SDK",
      description:
        "Accept USDC and USDT with no platform fees. Non-custodial, open source, WalletConnect supported. A Coinbase Pay and Binance Pay alternative.",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Syntax-highlight helpers (GitHub-dark palette, code panels only).   */
/* ------------------------------------------------------------------ */
const Str = ({ children }: { children: ReactNode }) => (
  <span className="text-[#a5d6ff]">{children}</span>
);
const Kw = ({ children }: { children: ReactNode }) => (
  <span className="text-[#ff7b72]">{children}</span>
);
const Fn = ({ children }: { children: ReactNode }) => (
  <span className="text-[#d2a8ff]">{children}</span>
);
const Prop = ({ children }: { children: ReactNode }) => (
  <span className="text-[#79c0ff]">{children}</span>
);
const Com = ({ children }: { children: ReactNode }) => (
  <span className="text-[#8b949e]">{children}</span>
);

/* ------------------------------------------------------------------ */
/* Code samples — the real integration surface, unchanged in substance */
/* ------------------------------------------------------------------ */

const curlRaw = `curl -X POST ${API_BASE}/v1/checkout/sessions \\
  -H "x-api-key: $AGENTLABS_PAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 25,
    "success_url": "https://your-site.com/paid",
    "cancel_url": "https://your-site.com/pricing",
    "callback_url": "https://your-site.com/hooks/agentlabs-pay"
  }'`;

const curlSample = (
  <>
    <Fn>curl</Fn> <Prop>-X</Prop> POST {API_BASE}/v1/checkout/sessions \<br />
    {"  "}
    <Prop>-H</Prop> <Str>"x-api-key: $AGENTLABS_PAY_API_KEY"</Str> \<br />
    {"  "}
    <Prop>-H</Prop> <Str>"Content-Type: application/json"</Str> \<br />
    {"  "}
    <Prop>-d</Prop> <Str>'{'{'}</Str>
    <br />
    {"    "}
    <Str>"amount"</Str>: <Prop>25</Prop>,<br />
    {"    "}
    <Str>"success_url"</Str>: <Str>"https://your-site.com/paid"</Str>,<br />
    {"    "}
    <Str>"cancel_url"</Str>: <Str>"https://your-site.com/pricing"</Str>,<br />
    {"    "}
    <Str>"callback_url"</Str>: <Str>"https://your-site.com/hooks/agentlabs-pay"</Str>
    <br />
    {"  "}
    <Str>{'}'}'</Str>
  </>
);

const jsRaw = `const res = await fetch(
  "${API_BASE}/v1/checkout/sessions",
  {
    method: "POST",
    headers: {
      "x-api-key": process.env.AGENTLABS_PAY_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: 25,
      success_url: "https://your-site.com/paid",
      cancel_url: "https://your-site.com/pricing",
      callback_url: "https://your-site.com/hooks/agentlabs-pay",
    }),
  }
);
const session = await res.json();
// Redirect your customer to session.url — the hosted checkout.`;

const jsSample = (
  <>
    <Kw>const</Kw> res = <Kw>await</Kw> <Fn>fetch</Fn>(<br />
    {"  "}
    <Str>"{API_BASE}/v1/checkout/sessions"</Str>,<br />
    {"  "}
    {'{'}
    <br />
    {"    "}
    <Prop>method</Prop>: <Str>"POST"</Str>,<br />
    {"    "}
    <Prop>headers</Prop>: {'{'}
    <br />
    {"      "}
    <Str>"x-api-key"</Str>: process.env.
    <Prop>AGENTLABS_PAY_API_KEY</Prop>,<br />
    {"      "}
    <Str>"Content-Type"</Str>: <Str>"application/json"</Str>,<br />
    {"    "}
    {'}'},<br />
    {"    "}
    <Prop>body</Prop>: JSON.<Fn>stringify</Fn>({'{'}
    <br />
    {"      "}
    <Prop>amount</Prop>: <Prop>25</Prop>,<br />
    {"      "}
    <Prop>success_url</Prop>: <Str>"https://your-site.com/paid"</Str>,<br />
    {"      "}
    <Prop>cancel_url</Prop>: <Str>"https://your-site.com/pricing"</Str>,<br />
    {"      "}
    <Prop>callback_url</Prop>: <Str>"https://your-site.com/hooks/agentlabs-pay"</Str>,
    <br />
    {"    "}
    {'}'}),<br />
    {"  "}
    {'}'}
    <br />
    );
    <br />
    <Kw>const</Kw> session = <Kw>await</Kw> res.<Fn>json</Fn>();
    <br />
    <Com>{"// Redirect your customer to session.url — the hosted checkout."}</Com>
  </>
);

const embedRaw = `<script src="https://pay.agentlabs.cc/agentlabs-pay.js"></script>
<button onclick="AgentLabsPay.checkout({ url: SIGNED_CHECKOUT_URL })">
  Pay with crypto
</button>`;

const embedSample = (
  <>
    <span className="text-[#7ee787]">&lt;script</span>{" "}
    <Prop>src</Prop>=<Str>"https://pay.agentlabs.cc/agentlabs-pay.js"</Str>
    <span className="text-[#7ee787]">&gt;&lt;/script&gt;</span>
    <br />
    <span className="text-[#7ee787]">&lt;button</span>{" "}
    <Prop>onclick</Prop>=
    <Str>"AgentLabsPay.checkout({'{'} url: SIGNED_CHECKOUT_URL {'}'})"</Str>
    <span className="text-[#7ee787]">&gt;</span>
    <br />
    {"  "}Pay with crypto
    <br />
    <span className="text-[#7ee787]">&lt;/button&gt;</span>
  </>
);

const eventsRaw = `curl ${API_BASE}/v1/events \\
  -H "x-api-key: $AGENTLABS_PAY_API_KEY"`;

const eventsSample = (
  <>
    <Fn>curl</Fn> {API_BASE}/v1/events \<br />
    {"  "}
    <Prop>-H</Prop> <Str>"x-api-key: $AGENTLABS_PAY_API_KEY"</Str>
  </>
);

const signedLinkRaw = `https://pay.agentlabs.cc/pay?uid=<user id>&plan=<plan id>&exp=<unix expiry>&sig=<hmac>`;

const llmsExcerpt = `# Pay by AgentLabs
> Free open-source SDK to accept crypto payments (USDC, USDT).
> No platform fees and no intermediary: payments settle directly
> from the payer's wallet to the merchant's wallet.

API base: ${API_BASE}
Auth: header \`x-api-key: <key>\` on all /v1 endpoints.

- POST /v1/checkout/sessions -> returns a session with a hosted checkout \`url\`
- GET  /v1/events — webhook event log (type filter supported)
- GET  /api/config — public: chains, tokens, settlement wallets`;

const sessionTabs: CodeTab[] = [
  { label: "cURL", copyText: curlRaw, content: curlSample },
  { label: "JavaScript", copyText: jsRaw, content: jsSample },
];

/* ------------------------------------------------------------------ */
/* MCP server samples — mcp/ package (agentlabs-pay-mcp), stdio.       */
/* The worked example is a real session created against the            */
/* production API on 2026-11-27 (values verbatim, fields trimmed).     */
/* ------------------------------------------------------------------ */

const mcpRunRaw = `git clone https://github.com/dzianisv/CryptoPayments.git
cd CryptoPayments
pnpm install
pnpm --filter agentlabs-pay-mcp build

# The server speaks MCP over stdio — your client launches it:
AGENTLABS_PAY_API_KEY=<your key> node mcp/dist/index.js`;

const mcpRunSample = (
  <>
    <Fn>git</Fn> clone https://github.com/dzianisv/CryptoPayments.git<br />
    <Fn>cd</Fn> CryptoPayments<br />
    <Fn>pnpm</Fn> install<br />
    <Fn>pnpm</Fn> <Prop>--filter</Prop> agentlabs-pay-mcp build<br />
    <br />
    <Com># The server speaks MCP over stdio — your client launches it:</Com>
    <br />
    <Prop>AGENTLABS_PAY_API_KEY</Prop>=<Str>&lt;your key&gt;</Str> <Fn>node</Fn>{" "}
    mcp/dist/index.js
  </>
);

const mcpConfigRaw = `{
  "mcpServers": {
    "agentlabs-pay": {
      "command": "node",
      "args": ["<path to CryptoPayments>/mcp/dist/index.js"],
      "env": { "AGENTLABS_PAY_API_KEY": "<your key>" }
    }
  }
}`;

const mcpConfigSample = (
  <>
    {'{'}
    <br />
    {"  "}
    <Str>"mcpServers"</Str>: {'{'}
    <br />
    {"    "}
    <Str>"agentlabs-pay"</Str>: {'{'}
    <br />
    {"      "}
    <Str>"command"</Str>: <Str>"node"</Str>,<br />
    {"      "}
    <Str>"args"</Str>: [<Str>"&lt;path to CryptoPayments&gt;/mcp/dist/index.js"</Str>],
    <br />
    {"      "}
    <Str>"env"</Str>: {'{'} <Str>"AGENTLABS_PAY_API_KEY"</Str>: <Str>"&lt;your key&gt;"</Str>{" "}
    {'}'}
    <br />
    {"    "}
    {'}'}
    <br />
    {"  "}
    {'}'}
    <br />
    {'}'}
  </>
);

const mcpCallRaw = `{
  "name": "create_checkout_session",
  "arguments": {
    "amount": 25,
    "plan_id": "pro",
    "success_url": "https://pay.agentlabs.cc/sdk",
    "cancel_url": "https://pay.agentlabs.cc/sdk"
  }
}`;

const mcpCallSample = (
  <>
    {'{'}
    <br />
    {"  "}
    <Str>"name"</Str>: <Str>"create_checkout_session"</Str>,<br />
    {"  "}
    <Str>"arguments"</Str>: {'{'}
    <br />
    {"    "}
    <Str>"amount"</Str>: <Prop>25</Prop>,<br />
    {"    "}
    <Str>"plan_id"</Str>: <Str>"pro"</Str>,<br />
    {"    "}
    <Str>"success_url"</Str>: <Str>"https://pay.agentlabs.cc/sdk"</Str>,<br />
    {"    "}
    <Str>"cancel_url"</Str>: <Str>"https://pay.agentlabs.cc/sdk"</Str>
    <br />
    {"  "}
    {'}'}
    <br />
    {'}'}
  </>
);

const mcpResultRaw = `{
  "id": "f639d441-26a4-41e1-a4f8-f603b6548d35",
  "stripe_id": "cs_d7a1ab9e1d71413f8421eeb684a8ecf9",
  "status": "open",
  "plan_id": "pro",
  "amount": 25,
  "currency": "usd",
  "url": "https://pay.openclaw.ai/checkout/cs_d7a1ab9e1d71413f8421eeb684a8ecf9",
  "expires_at": "2026-11-27T07:19:39.252Z"
}`;

const mcpResultSample = (
  <>
    {'{'}
    <br />
    {"  "}
    <Str>"id"</Str>: <Str>"f639d441-26a4-41e1-a4f8-f603b6548d35"</Str>,<br />
    {"  "}
    <Str>"stripe_id"</Str>: <Str>"cs_d7a1ab9e1d71413f8421eeb684a8ecf9"</Str>,<br />
    {"  "}
    <Str>"status"</Str>: <Str>"open"</Str>,<br />
    {"  "}
    <Str>"plan_id"</Str>: <Str>"pro"</Str>,<br />
    {"  "}
    <Str>"amount"</Str>: <Prop>25</Prop>,<br />
    {"  "}
    <Str>"currency"</Str>: <Str>"usd"</Str>,<br />
    {"  "}
    <Str>"url"</Str>:{" "}
    <Str>"https://pay.openclaw.ai/checkout/cs_d7a1ab9e1d71413f8421eeb684a8ecf9"</Str>,
    <br />
    {"  "}
    <Str>"expires_at"</Str>: <Str>"2026-11-27T07:19:39.252Z"</Str>
    <br />
    {'}'}
  </>
);

const mcpSetupTabs: CodeTab[] = [
  { label: "Build & run", copyText: mcpRunRaw, content: mcpRunSample },
  { label: "Client config", copyText: mcpConfigRaw, content: mcpConfigSample },
];

const mcpExampleTabs: CodeTab[] = [
  { label: "Tool call", copyText: mcpCallRaw, content: mcpCallSample },
  { label: "Result", copyText: mcpResultRaw, content: mcpResultSample },
];

const mcpTools = [
  { name: "create_checkout_session", route: "POST /v1/checkout/sessions", desc: "Create a hosted checkout session for an amount (USD); returns the session with the hosted checkout url to send the payer to" },
  { name: "get_checkout_session", route: "GET /v1/checkout/sessions/:id", desc: "Retrieve a checkout session by id to check its status (open / complete / expired)" },
  { name: "create_payment_intent", route: "POST /v1/payment_intents", desc: "Create a payment intent for an amount (USD), optionally tied to a customer or invoice and a specific chain/token" },
  { name: "get_payment_intent", route: "GET /v1/payment_intents/:id", desc: "Retrieve a payment intent by id to confirm its payment status" },
  { name: "list_payment_intents", route: "GET /v1/payment_intents", desc: "List payment intents, optionally filtered by customer or status" },
  { name: "confirm_payment_intent", route: "POST /v1/payment_intents/:id/confirm", desc: "Mark a payment intent as processing after a payment transaction was submitted, recording its tx hash / chain / token" },
  { name: "create_customer", route: "POST /v1/customers", desc: "Get-or-create a customer by identity: Telegram user id or email address" },
  { name: "get_customer", route: "GET /v1/customers/:id", desc: "Retrieve a customer by id" },
  { name: "list_customers", route: "GET /v1/customers", desc: "List customers (paginated)" },
  { name: "create_invoice", route: "POST /v1/invoices", desc: "Create a draft invoice for a customer; add line items, then finalize" },
  { name: "get_invoice", route: "GET /v1/invoices/:id", desc: "Retrieve an invoice by id; can include its line items" },
  { name: "list_invoices", route: "GET /v1/invoices", desc: "List invoices, optionally filtered by customer or status" },
  { name: "add_invoice_line_item", route: "POST /v1/invoices/:id/line_items", desc: "Add a line item (description + amount in USD) to a draft invoice" },
  { name: "finalize_invoice", route: "POST /v1/invoices/:id/finalize", desc: "Finalize a draft invoice so it can be paid" },
  { name: "void_invoice", route: "POST /v1/invoices/:id/void", desc: "Void an invoice" },
  { name: "list_events", route: "GET /v1/events", desc: "List webhook events emitted by the backend (e.g. payment completions), optionally filtered by event type" },
];

const heroTabs: CodeTab[] = [
  ...sessionTabs,
  { label: "Embed", copyText: embedRaw, content: embedSample },
];

/* ------------------------------------------------------------------ */
/* Content — every claim carried over from the shipped page, verbatim  */
/* in substance. Follow-ups stay labeled as in development.            */
/* ------------------------------------------------------------------ */

const steps = [
  {
    n: "01",
    title: "Get an API key and checkout secret",
    desc: "Keys are issued on request today (self-serve onboarding is in development). Your wallet addresses are yours — configure them once, and every payment settles to them directly.",
  },
  {
    n: "02",
    title: "Create a checkout from your server",
    desc: "Call the REST API to create a customer, an invoice, or a checkout session — or sign a payment link yourself with your checkout secret. Send the customer to the hosted checkout at pay.agentlabs.cc/pay.",
  },
  {
    n: "03",
    title: "Get paid, get a signed callback",
    desc: "The customer pays with WalletConnect, MetaMask, Phantom, Tonkeeper, or by QR code. The payment is verified on-chain and your server receives an HMAC-signed callback. No intermediary ever holds the funds.",
  },
];

const wallets: {
  name: string;
  desc: string;
  note?: string;
  link?: { href: string; label: string };
}[] = [
  {
    name: "WalletConnect",
    desc: "Connect a WalletConnect-compatible wallet — mobile or desktop — by scanning a QR code, and pay the backend-issued transaction from the connected wallet. One connection flow covers hundreds of wallets on the EVM chains (Base and Ethereum).",
    note: "WalletConnect connect-and-pay is live in the hosted checkout (AgentPod #6438): connect a wallet on the checkout page and pay from it directly, alongside MetaMask, Phantom, and Tonkeeper. QR code and copied-address payment remain available as the fallback.",
    link: { href: "https://docs.walletconnect.com/", label: "WalletConnect documentation" },
  },
  {
    name: "MetaMask",
    desc: "Browser-extension and mobile wallet for the EVM chains — Base and Ethereum.",
  },
  {
    name: "Phantom",
    desc: "Solana wallet for USDC and USDT payments on Solana.",
  },
  {
    name: "Tonkeeper",
    desc: "TON wallet for payments on the TON network.",
  },
  {
    name: "QR code / address",
    desc: "No wallet connection needed. The checkout shows a payment address and a QR code; the customer sends the exact amount from any wallet or exchange, and the payment is verified on-chain.",
  },
];

const endpoints = [
  { methods: ["POST", "GET"], path: "/v1/customers", desc: "Create and list your customers" },
  { methods: ["POST", "GET"], path: "/v1/invoices", desc: "Invoices for services and subscription billing, with line items, finalize and void" },
  { methods: ["POST", "GET"], path: "/v1/payment_intents", desc: "Payment intents for a customer or invoice; confirm with a transaction hash" },
  { methods: ["POST", "GET"], path: "/v1/checkout/sessions", desc: "Hosted checkout sessions with success / cancel / callback URLs" },
  { methods: ["GET"], path: "/v1/events", desc: "Webhook event log — poll what happened instead of guessing" },
  { methods: ["GET"], path: "/api/config", desc: "Public configuration: chains, tokens, prices, settlement wallets" },
  { methods: ["POST"], path: "/api/payment", desc: "Submit a payment transaction for on-chain verification" },
];

const faqs = [
  {
    q: "What does Pay by AgentLabs charge?",
    a: "Nothing. There is no platform fee and no percentage cut: the processor takes no fee in code, and payments settle directly from the customer's wallet to yours. The only cost is the blockchain network fee (gas), paid to the network, which is lowest on Base.",
  },
  {
    q: "How is this different from Coinbase Pay or Binance Pay?",
    a: "Pay by AgentLabs is open source and non-custodial. You run on open code, your customers pay your own wallet addresses, and no intermediary holds funds or takes a platform fee. It is a free, open-source alternative to hosted processors like Coinbase Pay and Binance Pay.",
  },
  {
    q: "Which chains and tokens are supported?",
    a: "USDC and USDT on Base, Ethereum, Solana, and TON (Base Sepolia and Ethereum Sepolia for testing). Customers can pay with WalletConnect, MetaMask, Phantom, or Tonkeeper, or by scanning a QR code.",
  },
  {
    q: "Can I bill subscriptions with it?",
    a: "Yes. The API models customers, invoices with line items, and payment intents — the building blocks of subscription billing. Your server creates an invoice per billing period and sends the customer a checkout link; signed callbacks tell you when it is paid.",
  },
  {
    q: "How do AI agents pay through it?",
    a: "Agents use the same REST API and hosted checkout: create a payment intent or open a signed checkout link, pay, and confirm status via the API. A dedicated MCP server for agent payments ships in this repo (the mcp/ package — run `node mcp/dist/index.js` with AGENTLABS_PAY_API_KEY set); the machine-readable integration summary lives at pay.agentlabs.cc/llms.txt.",
  },
  {
    q: "Is it really open source?",
    a: "Yes. The full processor — backend, hosted checkout, and this SDK — is MIT-licensed at github.com/dzianisv/CryptoPayments. It is the same code AgentPod itself runs in production to take crypto payments.",
  },
];

const stats = [
  { value: "0%", label: "Platform fee" },
  { value: "4", label: "Chains — Base, Ethereum, Solana, TON" },
  { value: "USDC · USDT", label: "Stablecoins accepted" },
  { value: "MIT", label: "Open-source license" },
];

/* ------------------------------------------------------------------ */

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-10 max-w-2xl">
      <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-[#58a6ff]">
        {eyebrow}
      </p>
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
        {title}
      </h2>
      {children ? (
        <p className="mt-3 leading-relaxed text-zinc-400">{children}</p>
      ) : null}
    </div>
  );
}

export function SdkContent({ url }: { url: string }) {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Pay by AgentLabs SDK",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url,
    downloadUrl: REPO_URL,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: "AgentLabs", url: "https://agentlabs.cc" },
    description:
      "Free open-source SDK to accept USDC and USDT payments for services and subscriptions with no platform fees. Non-custodial, WalletConnect supported, with a REST API AI agents can pay through.",
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* ---------------- Header ---------------- */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#09090b]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <span className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight">Pay by AgentLabs</span>
            <span className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              SDK
            </span>
          </span>
          <nav className="ml-auto hidden items-center gap-6 text-sm text-zinc-400 sm:flex">
            <a href="#wallets" className="transition-colors hover:text-zinc-100">
              Wallets
            </a>
            <a href="#quickstart" className="transition-colors hover:text-zinc-100">
              Quickstart
            </a>
            <a href="#api" className="transition-colors hover:text-zinc-100">
              API
            </a>
            <a href="#agents" className="transition-colors hover:text-zinc-100">
              Agents
            </a>
            <a href="#mcp" className="transition-colors hover:text-zinc-100">
              MCP
            </a>
            <a href="#faq" className="transition-colors hover:text-zinc-100">
              FAQ
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-zinc-100"
            >
              GitHub
            </a>
          </nav>
          <Link
            href="/pay"
            className="ml-auto rounded-md bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 sm:ml-0"
          >
            Live checkout
          </Link>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-16 sm:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-5 font-mono text-xs font-medium uppercase tracking-[0.2em] text-[#58a6ff]">
                Free · Open source · No platform fees
              </p>
              <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-zinc-50 sm:text-[3.4rem]">
                The crypto payments SDK that charges nothing
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-400">
                Add crypto payments to your website or service. Customers pay in USDC or
                USDT — for one-off services and for subscriptions — and the money settles
                directly to your wallet. No platform fee, no percentage cut, no
                intermediary holding funds. The open-source alternative to Coinbase Pay
                and Binance Pay, and the same stack AgentPod runs in production.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#quickstart"
                  className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
                >
                  Read the quickstart
                </a>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-white/15 px-5 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:border-white/35"
                >
                  View on GitHub
                </a>
              </div>
            </div>
            <div className="min-w-0">
              <CodeWindow tabs={heroTabs} />
              <p className="mt-4 text-sm text-zinc-500">
                Create a checkout session from your server; the customer pays on the
                hosted checkout and the funds settle to your wallet.
              </p>
            </div>
          </div>

          <dl className="mt-16 grid grid-cols-2 gap-y-8 border-t border-white/[0.06] pt-8 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col pr-6">
                <dt className="order-2 mt-1 text-sm text-zinc-500">{s.label}</dt>
                <dd className="order-1 text-2xl font-semibold tracking-tight text-zinc-50">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <SectionHeading eyebrow="How it works" title="From signup to settled in three steps" />
          <div>
            {steps.map((s, i) => (
              <div
                key={s.n}
                className={`grid gap-2 py-8 sm:grid-cols-[5rem_1fr_1.4fr] sm:gap-6 ${
                  i > 0 ? "border-t border-white/[0.06]" : "pt-0"
                }`}
              >
                <span className="font-mono text-sm text-[#58a6ff]">{s.n}</span>
                <h3 className="text-lg font-medium tracking-tight text-zinc-50">
                  {s.title}
                </h3>
                <p className="leading-relaxed text-zinc-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Wallets ---------------- */}
      <section id="wallets" className="scroll-mt-20 border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <SectionHeading eyebrow="Wallets" title="Every way a customer can pay">
            The hosted checkout meets customers in the wallet they already use. However
            they pay, the amount and destination come from your backend — the customer
            approves the exact transaction, and the payment settles to your wallet.
          </SectionHeading>
          <div>
            {wallets.map((w, i) => (
              <div
                key={w.name}
                className={`grid gap-2 py-7 sm:grid-cols-[12rem_1fr] sm:gap-6 ${
                  i > 0 ? "border-t border-white/[0.06]" : "pt-0"
                }`}
              >
                <h3 className="text-lg font-medium tracking-tight text-zinc-50">
                  {w.name}
                </h3>
                <div>
                  <p className="max-w-2xl leading-relaxed text-zinc-400">{w.desc}</p>
                  {w.note ? (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
                      {w.note}
                    </p>
                  ) : null}
                  {w.link ? (
                    <p className="mt-2 text-sm">
                      <a
                        href={w.link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#58a6ff] hover:underline"
                      >
                        {w.link.label} ↗
                      </a>
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Quickstart ---------------- */}
      <section id="quickstart" className="scroll-mt-20 border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <SectionHeading eyebrow="Quickstart" title="Integrate in an afternoon">
            Two ways in. The hosted checkout needs no frontend code at all; the embed
            snippet adds a one-line button to any page. Server calls use your API key in
            the <code className="font-mono text-[0.9em] text-zinc-200">x-api-key</code>{" "}
            header against{" "}
            <code className="font-mono text-[0.9em] text-zinc-200">{API_BASE}</code>.
          </SectionHeading>

          <div className="space-y-16">
            <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-12">
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Step 1
                </p>
                <h3 className="mb-3 text-xl font-medium tracking-tight text-zinc-50">
                  Embed the button
                </h3>
                <p className="leading-relaxed text-zinc-400">
                  Drop the script on any page and point the button at a signed checkout
                  URL created by your server. The checkout secret never goes in browser
                  code.
                </p>
              </div>
              <CodeWindow
                tabs={[{ label: "HTML", copyText: embedRaw, content: embedSample }]}
              />
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-12">
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Step 2
                </p>
                <h3 className="mb-3 text-xl font-medium tracking-tight text-zinc-50">
                  Create a checkout session
                </h3>
                <p className="leading-relaxed text-zinc-400">
                  One call from your server returns a hosted checkout URL. Or skip the
                  API and sign a payment link directly: the checkout intent is an
                  HMAC-SHA256 signature over the sorted payment parameters (
                  <code className="font-mono text-[0.9em] text-zinc-200">uid</code>,{" "}
                  <code className="font-mono text-[0.9em] text-zinc-200">plan</code> or{" "}
                  <code className="font-mono text-[0.9em] text-zinc-200">amountUsd</code>,{" "}
                  <code className="font-mono text-[0.9em] text-zinc-200">exp</code>) keyed
                  by your checkout secret, passed as{" "}
                  <code className="font-mono text-[0.9em] text-zinc-200">sig</code> on{" "}
                  <code className="font-mono text-[0.9em] text-zinc-200">
                    https://pay.agentlabs.cc/pay
                  </code>
                  . The exact canonical format is in the open-source backend (
                  <code className="font-mono text-[0.9em] text-zinc-200">
                    verifyCheckoutIntent
                  </code>
                  ).
                </p>
                <p className="mt-4 break-all font-mono text-[13px] leading-6 text-zinc-500">
                  {signedLinkRaw}
                </p>
              </div>
              <CodeWindow tabs={sessionTabs} />
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-12">
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Step 3
                </p>
                <h3 className="mb-3 text-xl font-medium tracking-tight text-zinc-50">
                  Confirm the payment
                </h3>
                <p className="leading-relaxed text-zinc-400">
                  Your{" "}
                  <code className="font-mono text-[0.9em] text-zinc-200">callback_url</code>{" "}
                  receives an HMAC-signed POST when a payment verifies on-chain. You can
                  also poll{" "}
                  <code className="font-mono text-[0.9em] text-zinc-200">GET /v1/events</code>{" "}
                  or the payment intent. Verification is on-chain — a payment counts when
                  the transaction confirms, not when a customer clicks pay.
                </p>
              </div>
              <CodeWindow
                tabs={[{ label: "cURL", copyText: eventsRaw, content: eventsSample }]}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- API ---------------- */}
      <section id="api" className="scroll-mt-20 border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <SectionHeading eyebrow="API reference" title="A small, complete REST API">
            Customers, invoices, payment intents, and checkout sessions — the building
            blocks of one-off payments and subscription billing, behind one API key.
          </SectionHeading>
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02] text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3 font-medium">Method</th>
                  <th className="px-5 py-3 font-medium">Endpoint</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((e) => (
                  <tr
                    key={e.path}
                    className="border-b border-white/[0.05] transition-colors last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span className="flex gap-1.5">
                        {e.methods.map((m) => (
                          <span
                            key={m}
                            className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${
                              m === "POST"
                                ? "border-[#1f6feb]/40 bg-[#1f6feb]/10 text-[#58a6ff]"
                                : "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300"
                            }`}
                          >
                            {m}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[13px] text-zinc-100">
                      {e.path}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-400">{e.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-zinc-500">
            Chains: Base, Ethereum, Solana, TON. Tokens: USDC, USDT. Full machine-readable
            summary for agents:{" "}
            <a href="/llms.txt" className="text-[#58a6ff] hover:underline">
              pay.agentlabs.cc/llms.txt
            </a>
            .
          </p>
        </div>
      </section>

      {/* ---------------- Agents ---------------- */}
      <section id="agents" className="scroll-mt-20 border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-12">
            <div>
              <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-[#58a6ff]">
                For agents
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
                Built for agents, too
              </h2>
              <p className="mt-4 leading-relaxed text-zinc-400">
                Services that onboard this SDK become payable by AI agents through the
                same API and hosted checkout — an agent creates a payment intent, pays
                it, and confirms the result programmatically.
              </p>
              <p className="mt-4 leading-relaxed text-zinc-400">
                The dedicated MCP server ships in the repo (the{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">mcp/</code>{" "}
                package): run it with your API key and agents get the payment
                tools natively.{" "}
                <a href="/llms.txt" className="text-[#58a6ff] hover:underline">
                  llms.txt
                </a>{" "}
                remains the plain-text contract: endpoints, parameters, and the
                payment flow.
              </p>
              <p className="mt-6">
                <span className="rounded border border-emerald-400/25 bg-emerald-400/[0.07] px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-emerald-300">
                  MCP server — available in repo
                </span>
              </p>
            </div>
            <CodeWindow
              tabs={[{ label: "llms.txt", copyText: llmsExcerpt, content: llmsExcerpt }]}
            />
          </div>
        </div>
      </section>

      {/* ---------------- MCP server ---------------- */}
      <section id="mcp" className="scroll-mt-20 border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <SectionHeading eyebrow="MCP server" title="Payments as native agent tools">
            The MCP server (package{" "}
            <code className="font-mono text-[0.9em] text-zinc-200">agentlabs-pay-mcp</code>,
            in the repo&apos;s{" "}
            <code className="font-mono text-[0.9em] text-zinc-200">mcp/</code> directory)
            wraps the same /v1 REST API as native{" "}
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#58a6ff] hover:underline"
            >
              Model Context Protocol
            </a>{" "}
            tools, so any MCP client — Claude Desktop, Claude Code, or your own agent
            runtime — can create checkouts, invoices, and payment intents without writing
            HTTP code. It speaks MCP over stdio: the client launches the process and
            exchanges JSON-RPC with it on stdin/stdout. Every tool maps 1:1 to a route
            the API actually exposes; the server holds no state and no keys of its own —
            calls go to the API with your key.
          </SectionHeading>

          <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-12">
            <div>
              <h3 className="mb-3 text-xl font-medium tracking-tight text-zinc-50">
                Quickstart
              </h3>
              <p className="leading-relaxed text-zinc-400">
                Clone the repo, build the package, and register it with your MCP client.
                The client starts the server itself — there is nothing to host.
              </p>
              <p className="mt-4 leading-relaxed text-zinc-400">
                <code className="font-mono text-[0.9em] text-zinc-200">
                  AGENTLABS_PAY_API_KEY
                </code>{" "}
                is required — the same API key the REST API uses (issued on request
                today).{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">
                  AGENTLABS_PAY_API_BASE
                </code>{" "}
                is optional and defaults to the production API (
                <code className="font-mono text-[0.9em] text-zinc-200">
                  https://pay.agentlabs.cc
                </code>
                ) — the same {API_BASE} as the REST examples above.
              </p>
              <p className="mt-4 leading-relaxed text-zinc-400">
                Typical agent flow:{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">
                  create_payment_intent
                </code>{" "}
                (or{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">create_invoice</code>{" "}
                →{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">
                  add_invoice_line_item
                </code>{" "}
                →{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">
                  finalize_invoice
                </code>
                ) →{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">
                  create_checkout_session
                </code>{" "}
                → send the payer the session&apos;s hosted checkout{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">url</code> → confirm
                the result with{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">
                  get_checkout_session
                </code>
                ,{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">
                  get_payment_intent
                </code>
                , or{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">list_events</code>.
              </p>
            </div>
            <CodeWindow tabs={mcpSetupTabs} />
          </div>

          <h3 className="mb-4 mt-16 text-xl font-medium tracking-tight text-zinc-50">
            The 16 tools
          </h3>
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02] text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3 font-medium">Tool</th>
                  <th className="px-5 py-3 font-medium">API route</th>
                  <th className="px-5 py-3 font-medium">What it does</th>
                </tr>
              </thead>
              <tbody>
                {mcpTools.map((t) => (
                  <tr
                    key={t.name}
                    className="border-b border-white/[0.05] transition-colors last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[13px] text-zinc-100">
                      {t.name}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[13px] text-zinc-400">
                      {t.route}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-400">{t.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-16 grid items-start gap-6 lg:grid-cols-2 lg:gap-12">
            <div>
              <h3 className="mb-3 text-xl font-medium tracking-tight text-zinc-50">
                Worked example — a $25 Pro checkout
              </h3>
              <p className="leading-relaxed text-zinc-400">
                The agent calls{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">
                  create_checkout_session
                </code>{" "}
                with an amount and a plan. The tool returns the session JSON — this is a
                real session created against the production API — and the agent sends the
                payer the hosted checkout{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">url</code>. The
                payer pays there (WalletConnect, MetaMask, Phantom, Tonkeeper, or QR);
                the agent polls{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">
                  get_checkout_session
                </code>{" "}
                until the status flips from{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">open</code> to{" "}
                <code className="font-mono text-[0.9em] text-zinc-200">complete</code>.
              </p>
            </div>
            <CodeWindow tabs={mcpExampleTabs} />
          </div>
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section id="faq" className="scroll-mt-20 border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <SectionHeading eyebrow="FAQ" title="Questions, answered" />
          <div className="max-w-3xl">
            {faqs.map((f, i) => (
              <details
                key={f.q}
                className={`group py-5 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-zinc-50 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="text-xl font-light leading-none text-zinc-500 transition-transform duration-200 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl leading-relaxed text-zinc-400">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-24">
          <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight text-zinc-50">
            Start accepting crypto payments
          </h2>
          <p className="mx-auto mt-4 max-w-lg leading-relaxed text-zinc-400">
            Open source, non-custodial, and free — the only cost is the blockchain
            network fee, and it goes to the network, not to us.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="#quickstart"
              className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Read the quickstart
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-white/15 px-5 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:border-white/35"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer>
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <p className="font-semibold tracking-tight">Pay by AgentLabs</p>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-500">
                A free, open-source crypto payments SDK by{" "}
                <a
                  href="https://agentlabs.cc/pay/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-300 hover:underline"
                >
                  AgentLabs
                </a>
                . Payments settle directly to your wallet — no intermediary, no platform
                fee.
              </p>
            </div>
            <nav>
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
                Product
              </p>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li>
                  <Link href="/pay" className="transition-colors hover:text-zinc-100">
                    Hosted checkout
                  </Link>
                </li>
                <li>
                  <a href="#quickstart" className="transition-colors hover:text-zinc-100">
                    Quickstart
                  </a>
                </li>
                <li>
                  <a href="#api" className="transition-colors hover:text-zinc-100">
                    API reference
                  </a>
                </li>
                <li>
                  <a href="/llms.txt" className="transition-colors hover:text-zinc-100">
                    llms.txt
                  </a>
                </li>
              </ul>
            </nav>
            <nav>
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
                Resources
              </p>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li>
                  <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-zinc-100"
                  >
                    GitHub — source (MIT)
                  </a>
                </li>
                <li>
                  <a
                    href="https://agentlabs.cc/pay/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-zinc-100"
                  >
                    AgentLabs product page
                  </a>
                </li>
                <li>
                  <a href="#agents" className="transition-colors hover:text-zinc-100">
                    Payments for agents
                  </a>
                </li>
                <li>
                  <a href="#faq" className="transition-colors hover:text-zinc-100">
                    FAQ
                  </a>
                </li>
              </ul>
            </nav>
          </div>
          <p className="mt-12 border-t border-white/[0.06] pt-6 text-sm text-zinc-600">
            Chains: Base, Ethereum, Solana, TON · Tokens: USDC, USDT · Open source under
            the MIT License.
          </p>
        </div>
      </footer>
    </main>
  );
}
