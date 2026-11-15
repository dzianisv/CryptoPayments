"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchConfig, submitPayment } from "@/lib/api";
import {
  type AppConfig,
  type ChainId,
  type TokenId,
  CHAINS,
  TOKENS,
} from "@/lib/config";
import { ChainSelector } from "@/components/chain-selector";
import { TokenSelector } from "@/components/token-selector";
import { AmountDisplay } from "@/components/amount-display";
import { WalletConnect } from "@/components/wallet-connect";
import { StatusMessage, type StatusType } from "@/components/status-message";

// Telegram WebApp types
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        initData: string;
        initDataUnsafe?: {
          user?: { id: number; first_name?: string };
          start_param?: string;
        };
        themeParams?: Record<string, string>;
      };
    };
  }
}

export default function PayPage() {
  // Config from API
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Payment params (from URL query or Telegram start_param)
  const [plan, setPlan] = useState("starter");
  const [topup, setTopup] = useState("");
  const [uid, setUid] = useState("");
  const [idType, setIdType] = useState<"tg" | "email">("tg");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [tenantType, setTenantType] = useState<"personal" | "team" | "">("");
  const [vmProvider, setVmProvider] = useState<"azure" | "hetzner" | "">("");
  const [hostType, setHostType] = useState<"vps" | "">("");
  const [amountUsd, setAmountUsd] = useState("");
  const [intentExp, setIntentExp] = useState("");
  const [intentSig, setIntentSig] = useState("");
  const [initData, setInitData] = useState("");
  const [userName, setUserName] = useState("");

  // Selection state
  const [selectedChain, setSelectedChain] = useState<ChainId>("base");
  const [selectedToken, setSelectedToken] = useState<TokenId>("usdc");

  // Testnet visibility (show only when ?test=true)
  const [showTestnets, setShowTestnets] = useState(false);

  // Payment state
  const [status, setStatus] = useState<{ type: StatusType; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);

  // Parse URL params and Telegram data on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tg = window.Telegram?.WebApp;

    // Enable testnets if ?test=true
    setShowTestnets(params.get("test") === "true");

    let pUid = params.get("uid") || "";
    let pPlan = params.get("plan") || "starter";
    const pTopup = params.get("topup") || "";
    let pIdType = (params.get("idtype") || "tg") as "tg" | "email";
    let pCallback = params.get("callback") || "";
    const pTenantType = params.get("tenantType") || params.get("tenant") || "";
    const pVmProvider = params.get("vmp") || params.get("vmProvider") || "";
    const pHostType = params.get("hostType") || "";
    const pAmountUsd = params.get("amountUsd") || "";
    const pExp = params.get("exp") || "";
    const pSig = params.get("sig") || "";
    let pName = "";

    if (tg) {
      tg.ready();
      tg.expand();
      setInitData(tg.initData || "");
      if (tg.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        if (!pUid) pUid = String(user.id);
        pIdType = "tg";
        pName = user.first_name || "";
      }
      // Parse start_param: "plan_uid"
      const startParam = tg.initDataUnsafe?.start_param;
      if (startParam && !params.get("uid")) {
        const parts = startParam.split("_");
        if (parts.length >= 2) {
          pPlan = parts[0];
          pUid = parts.slice(1).join("_");
        }
      }
    }

    setPlan(pPlan);
    setTopup(pTopup);
    setUid(pUid);
    setIdType(pIdType);
    setCallbackUrl(pCallback);
    setTenantType(pTenantType === "team" || pTenantType === "personal" ? pTenantType : "");
    setVmProvider(pVmProvider === "azure" || pVmProvider === "hetzner" ? pVmProvider : "");
    setHostType(pHostType === "vps" ? "vps" : "");
    setAmountUsd(pAmountUsd);
    setIntentExp(pExp);
    setIntentSig(pSig);
    setUserName(pName || (pIdType === "tg" ? `User ${pUid}` : pUid));

    // Fetch config
    fetchConfig()
      .then(setConfig)
      .catch(() => setStatus({ type: "error", message: "Failed to load payment configuration" }))
      .finally(() => setLoading(false));
  }, []);

  // Get price for current plan.
  // Invariant: never quote or collect a price that did not come from the
  // backend config or the signed amount intent — a missing price fails
  // visibly (this exact chain rendered a stale $10 for byok from the
  // retired Supabase config).
  const price = amountUsd ? Number(amountUsd) : config?.prices[plan];

  // Filter chains — hide testnets unless ?test=true
  const visibleChains = showTestnets ? CHAINS : CHAINS.filter((c) => !c.testnet);

  // Get wallet address for current chain
  const walletAddress = config?.wallets[selectedChain] ?? "";

  // Get token contract address
  const tokenAddress = config?.tokens[selectedChain]?.[selectedToken] ?? "";

  // Handle wallet transaction completion
  const handleTxSent = useCallback(
    async (hash: string) => {
      setStatus({ type: "pending", message: "Transaction sent. Verifying on-chain..." });
      await doSubmit(hash);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedChain, selectedToken, idType, uid, plan, topup, callbackUrl, initData, tenantType, vmProvider, hostType, amountUsd, intentExp, intentSig],
  );

  // Submit payment for verification
  async function doSubmit(hash: string) {
    if (!hash.trim()) {
      setStatus({ type: "error", message: "No transaction hash provided" });
      return;
    }
    setSubmitting(true);
    setStatus({ type: "pending", message: "Verifying transaction on-chain..." });

    try {
      const result = await submitPayment({
        txHash: hash.trim(),
        chainId: selectedChain,
        token: selectedToken,
        idType,
        uid,
        plan: topup ? undefined : plan,
        topup: topup || undefined,
        tenantType: tenantType || undefined,
        vmProvider: vmProvider || undefined,
        hostType: hostType || undefined,
        amountUsd: amountUsd || undefined,
        callbackUrl: callbackUrl || undefined,
        initData: initData || undefined,
        exp: intentExp || undefined,
        sig: intentSig || undefined,
      });

      if (result.payment?.status === "verified") {
        const p = result.payment;
        const planName = p.plan_id
          ? p.plan_id.charAt(0).toUpperCase() + p.plan_id.slice(1)
          : "";
        setStatus({
          type: "success",
          message: `Payment verified! ${planName ? `${planName} plan — ` : ""}$${p.amount_usd.toFixed(2)} ${p.token.toUpperCase()}`,
        });
        setVerified(true);

        // Auto-close Telegram Mini App after 3s
        if (window.Telegram?.WebApp) {
          setTimeout(() => window.Telegram?.WebApp?.close(), 3000);
        }
      } else {
        setStatus({
          type: "error",
          message: result.error || "Verification failed. Check the hash and try again.",
        });
      }
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Verification failed",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-accent" />
      </div>
    );
  }

  if (!uid) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="rounded-xl border border-border bg-surface p-6 text-center max-w-sm">
          <h1 className="text-lg font-semibold mb-2">No user identified</h1>
          <p className="text-sm text-muted">
            Open this page from the Telegram bot or use a payment link with your user ID.
          </p>
        </div>
      </div>
    );
  }

  if (config === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="rounded-xl border border-border bg-surface p-6 text-center max-w-sm">
          <h1 className="text-lg font-semibold mb-2">Failed to load payment configuration</h1>
          <p className="text-sm text-muted">
            Check your connection and reopen the payment link.
          </p>
        </div>
      </div>
    );
  }

  if (price === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="rounded-xl border border-border bg-surface p-6 text-center max-w-sm">
          <h1 className="text-lg font-semibold mb-2">Price unavailable</h1>
          <p className="text-sm text-muted">
            The price for this plan could not be loaded. Reopen the payment link from the bot.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 pb-20">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Pay with Crypto</h1>
          <p className="mt-1 text-sm text-muted">
            {userName} — {topup ? `${topup.charAt(0).toUpperCase() + topup.slice(1)} top-up` : `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan`}
          </p>
        </div>

        {/* Amount */}
        <AmountDisplay
          amount={price}
          token={selectedToken}
          chain={selectedChain}
        />

        {/* Step 1: Chain */}
        <section className="mt-6">
          <StepHeader step={1} title="Select network" />
          <ChainSelector
            chains={visibleChains}
            selected={selectedChain}
            onSelect={setSelectedChain}
            disabled={verified}
          />
        </section>

        {/* Step 2: Token */}
        <section className="mt-4">
          <StepHeader step={2} title="Select token" />
          <TokenSelector
            tokens={TOKENS}
            selected={selectedToken}
            onSelect={setSelectedToken}
            disabled={verified}
            disabledTokens={
              tokenAddress === "0x" ? [selectedToken] : []
            }
          />
        </section>

        {/* Step 3: Pay */}
        <section className="mt-4">
          <StepHeader step={3} title="Send payment" />
          <div className="rounded-xl border border-border bg-surface p-4">
            {/* Wallet connect + send */}
            <WalletConnect
              chain={selectedChain}
              token={selectedToken}
              tokenAddress={tokenAddress}
              walletAddress={walletAddress}
              amount={price}
              onTxSent={handleTxSent}
              disabled={verified || submitting}
              onStatus={(type, msg) => setStatus({ type, message: msg })}
            />
          </div>
        </section>

        {/* Status */}
        {status && (
          <div className="mt-4">
            <StatusMessage type={status.type} message={status.message} />
          </div>
        )}

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted/50">
          Powered by OpenClaw
        </p>
      </div>
    </main>
  );
}

function StepHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
        {step}
      </span>
      <span className="text-sm font-medium">{title}</span>
    </div>
  );
}
