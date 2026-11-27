import type { Metadata } from "next";
import Link from "next/link";

const SDK_URL = "https://pay.agentlabs.cc/sdk";
const REPO_URL = "https://github.com/dzianisv/CryptoPayments";

export const metadata: Metadata = {
  title: "Pay by AgentLabs SDK — Free Open-Source Crypto Payments SDK, No Fees",
  description:
    "Free open-source SDK to accept USDC and USDT payments for services and subscriptions. No platform fees, non-custodial — payments settle directly to your wallet. WalletConnect supported. A Coinbase Pay and Binance Pay alternative, with an API AI agents can pay through.",
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
  alternates: { canonical: SDK_URL },
  openGraph: {
    type: "website",
    siteName: "Pay by AgentLabs",
    title: "Pay by AgentLabs — Free Open-Source Crypto Payments SDK",
    description:
      "Accept USDC and USDT for services and subscriptions with no platform fees. Payments settle directly to your wallet. Open source, WalletConnect supported, built for agents.",
    url: SDK_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Pay by AgentLabs — Free Open-Source Crypto Payments SDK",
    description:
      "Accept USDC and USDT with no platform fees. Non-custodial, open source, WalletConnect supported. A Coinbase Pay and Binance Pay alternative.",
  },
};

const steps = [
  {
    step: "1",
    title: "Get an API key and checkout secret",
    desc: "Keys are issued on request today (self-serve onboarding is in development). Your wallet addresses are yours — configure them once, and every payment settles to them directly.",
  },
  {
    step: "2",
    title: "Create a checkout from your server",
    desc: "Call the REST API to create a customer, an invoice, or a checkout session — or sign a payment link yourself with your checkout secret. Send the customer to the hosted checkout at pay.agentlabs.cc/pay.",
  },
  {
    step: "3",
    title: "Get paid, get a signed callback",
    desc: "The customer pays with WalletConnect, MetaMask, Phantom, Tonkeeper, or by QR code. The payment is verified on-chain and your server receives an HMAC-signed callback. No intermediary ever holds the funds.",
  },
];

const endpoints = [
  ["POST / GET", "/v1/customers", "Create and list your customers"],
  ["POST / GET", "/v1/invoices", "Invoices for services and subscription billing, with line items, finalize and void"],
  ["POST / GET", "/v1/payment_intents", "Payment intents for a customer or invoice; confirm with a transaction hash"],
  ["POST / GET", "/v1/checkout/sessions", "Hosted checkout sessions with success / cancel / callback URLs"],
  ["GET", "/v1/events", "Webhook event log — poll what happened instead of guessing"],
  ["GET", "/api/config", "Public configuration: chains, tokens, prices, settlement wallets"],
  ["POST", "/api/payment", "Submit a payment transaction for on-chain verification"],
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
    a: "Agents use the same REST API and hosted checkout: create a payment intent or open a signed checkout link, pay, and confirm status via the API. A dedicated MCP server for agent payments is in development; the machine-readable integration summary lives at pay.agentlabs.cc/llms.txt.",
  },
  {
    q: "Is it really open source?",
    a: "Yes. The full processor — backend, hosted checkout, and this SDK — is MIT-licensed at github.com/dzianisv/CryptoPayments. It is the same code AgentPod itself runs in production to take crypto payments.",
  },
];

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Pay by AgentLabs SDK",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  url: SDK_URL,
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

const codeBlock =
  "rounded-lg border border-border bg-background p-4 text-[13px] leading-relaxed overflow-x-auto font-mono text-foreground/90 whitespace-pre";

export default function SdkPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <nav className="mb-10 flex items-center justify-between text-sm">
          <span className="font-semibold tracking-tight">Pay by AgentLabs</span>
          <span className="flex gap-4 text-muted">
            <Link href="/pay" className="hover:text-foreground transition-colors">
              Live checkout
            </Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              GitHub
            </a>
            <a href="https://agentlabs.cc/pay/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              AgentLabs
            </a>
          </span>
        </nav>

        <header className="mb-12">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.22em] text-accent">
            Free · Open source · No platform fees
          </p>
          <h1 className="mb-4 text-3xl font-bold leading-tight sm:text-4xl">
            The crypto payments SDK that charges nothing
          </h1>
          <p className="text-base leading-relaxed text-muted sm:text-lg">
            Add crypto payments to your website or service. Your customers pay in USDC or USDT —
            for one-off services and for subscriptions — and the money settles directly to your
            wallet. No platform fee, no percentage cut, no intermediary holding funds. The only
            cost is the blockchain network fee. Pay by AgentLabs is the open-source alternative to
            Coinbase Pay and Binance Pay, and the same stack AgentPod runs in production.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#install"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Install the SDK
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-hover"
            >
              View source on GitHub
            </a>
          </div>
        </header>

        <section className="mb-12">
          <h2 className="mb-4 text-xl font-semibold">How it works</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.step} className="rounded-xl border border-border bg-surface p-4">
                <p className="mb-2 text-sm font-semibold text-accent">Step {s.step}</p>
                <h3 className="mb-2 font-medium">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="install" className="mb-12 scroll-mt-8">
          <h2 className="mb-4 text-xl font-semibold">Install</h2>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Two ways in. The hosted checkout needs no frontend code at all; the embed snippet adds
            a one-line button to any page. Server calls use your API key in the{" "}
            <code className="font-mono text-foreground/90">x-api-key</code> header against{" "}
            <code className="font-mono text-foreground/90">https://crypto-payments.agentpod.agentlabs.cc</code>.
          </p>

          <h3 className="mb-2 font-medium">1 — Embed snippet (any website)</h3>
          <pre className={codeBlock}>{`<script src="https://pay.agentlabs.cc/agentlabs-pay.js"></script>
<button onclick="AgentLabsPay.checkout({ url: SIGNED_CHECKOUT_URL })">
  Pay with crypto
</button>`}</pre>
          <p className="mb-6 mt-2 text-sm text-muted">
            <code className="font-mono text-foreground/90">SIGNED_CHECKOUT_URL</code> is created by
            your server (below). The checkout secret never goes in browser code.
          </p>

          <h3 className="mb-2 font-medium">2 — Create a checkout session (server)</h3>
          <pre className={codeBlock}>{`curl -X POST https://crypto-payments.agentpod.agentlabs.cc/v1/checkout/sessions \\
  -H "x-api-key: $AGENTLABS_PAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 25,
    "success_url": "https://your-site.com/paid",
    "cancel_url": "https://your-site.com/pricing",
    "callback_url": "https://your-site.com/hooks/agentlabs-pay"
  }'`}</pre>
          <p className="mb-6 mt-2 text-sm text-muted">
            Or sign a payment link directly: the checkout intent is an HMAC-SHA256 signature over
            the sorted payment parameters (<code className="font-mono text-foreground/90">uid</code>,{" "}
            <code className="font-mono text-foreground/90">plan</code> or{" "}
            <code className="font-mono text-foreground/90">amountUsd</code>,{" "}
            <code className="font-mono text-foreground/90">exp</code>) keyed by your checkout
            secret, passed as <code className="font-mono text-foreground/90">sig</code> on{" "}
            <code className="font-mono text-foreground/90">https://pay.agentlabs.cc/pay</code>. The
            exact canonical format is in the open-source backend (
            <code className="font-mono text-foreground/90">verifyCheckoutIntent</code>).
          </p>

          <h3 className="mb-2 font-medium">3 — Confirm payment</h3>
          <p className="text-sm leading-relaxed text-muted">
            Your <code className="font-mono text-foreground/90">callback_url</code> receives an
            HMAC-signed POST when a payment verifies on-chain. You can also poll{" "}
            <code className="font-mono text-foreground/90">GET /v1/events</code> or the payment
            intent. Verification is on-chain — a payment counts when the transaction confirms, not
            when a customer clicks pay.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-xl font-semibold">API summary</h2>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <tbody>
                {endpoints.map(([method, path, desc]) => (
                  <tr key={path} className="border-b border-border bg-surface last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">{method}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{path}</td>
                    <td className="px-4 py-3 text-muted">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted">
            Chains: Base, Ethereum, Solana, TON. Tokens: USDC, USDT. Full machine-readable summary
            for agents: <a href="/llms.txt" className="text-accent hover:underline">pay.agentlabs.cc/llms.txt</a>.
          </p>
        </section>

        <section className="mb-12 rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-2 text-xl font-semibold">Built for agents, too</h2>
          <p className="text-sm leading-relaxed text-muted">
            Services that onboard this SDK become payable by AI agents through the same API and
            hosted checkout — an agent creates a payment intent, pays it, and confirms the result
            programmatically. A dedicated MCP server for agent payments is in development. Until it
            ships, <a href="/llms.txt" className="text-accent hover:underline">llms.txt</a> is the
            contract an agent needs: endpoints, parameters, and the payment flow in plain text.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-xl font-semibold">FAQ</h2>
          <div className="space-y-3">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-xl border border-border bg-surface p-4">
                <h3 className="mb-1 font-medium">{f.q}</h3>
                <p className="text-sm leading-relaxed text-muted">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-border pt-6 text-sm text-muted">
          <p>
            Pay by AgentLabs — an{" "}
            <a href="https://agentlabs.cc/pay/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              AgentLabs
            </a>{" "}
            product. Open source (MIT):{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              github.com/dzianisv/CryptoPayments
            </a>
            . Live checkout: <Link href="/pay" className="text-accent hover:underline">pay.agentlabs.cc/pay</Link>.
          </p>
        </footer>
      </div>
    </main>
  );
}
