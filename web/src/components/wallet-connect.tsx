"use client";

import { useState, useEffect, useRef } from "react";
import type { ChainId, TokenId } from "@/lib/config";
import { EVM_CHAINS } from "@/lib/config";
import { isEvmAvailable, connectEvm, sendEvmTransfer } from "@/lib/wallets/evm";
import {
  isWalletConnectConfigured,
  connectWalletConnect,
  disconnectWalletConnect,
} from "@/lib/wallets/walletconnect";
import { isSolanaAvailable, connectSolana, sendSolanaTransfer } from "@/lib/wallets/solana";
import { buildTonTransferMessage } from "@/lib/wallets/ton";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import type { StatusType } from "./status-message";
import type { Signer } from "ethers";

const INSTALL_URLS: Record<string, { name: string; url: string }> = {
  evm: { name: "EVM wallet", url: "https://metamask.io/download/" },
  sol: { name: "Phantom", url: "https://phantom.app/download" },
  ton: { name: "Tonkeeper", url: "https://tonkeeper.com/" },
};

/** Map raw wallet/ethers errors to user-friendly messages */
function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return "Transaction failed";
  const msg = err.message;
  // EIP-1193 user rejection (code 4001) or ethers ACTION_REJECTED
  if (msg.includes("ACTION_REJECTED") || msg.includes("User rejected") || msg.includes("user rejected")) {
    return "Transaction cancelled";
  }
  // ethers INSUFFICIENT_FUNDS or ERC20 balance check failure (CALL_EXCEPTION during estimateGas)
  if (msg.includes("INSUFFICIENT_FUNDS") || msg.includes("insufficient funds")) {
    return "Insufficient funds for gas fees";
  }
  if (msg.includes("transfer amount exceeds balance") || msg.includes("exceeds balance")) {
    return "Insufficient token balance. Please fund your wallet and try again.";
  }
  // Network / RPC errors
  if (msg.includes("NETWORK_ERROR") || msg.includes("network changed")) {
    return "Network error. Please check your wallet connection.";
  }
  // WalletConnect: the selected chain was not approved in the session —
  // the recovery is re-pairing with that chain requested.
  if (msg.includes("not approved") || msg.includes("Failed to switch to chain")) {
    return "Chain not approved in your wallet — reconnect and approve it in the WalletConnect prompt.";
  }
  return msg;
}

interface WalletConnectProps {
  chain: ChainId;
  token: TokenId;
  tokenAddress: string;
  walletAddress: string;
  amount: number;
  onTxSent: (txHash: string) => void;
  disabled?: boolean;
  onStatus: (type: StatusType, message: string) => void;
}

export function WalletConnect({
  chain,
  token,
  tokenAddress,
  walletAddress,
  amount,
  onTxSent,
  disabled,
  onStatus,
}: WalletConnectProps) {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [evmSigner, setEvmSigner] = useState<Signer | null>(null);
  const [evmTransport, setEvmTransport] = useState<"injected" | "walletconnect" | null>(null);
  const [sending, setSending] = useState(false);
  const prevChainRef = useRef(chain);

  // TonConnect hooks
  const [tonConnectUI] = useTonConnectUI();
  const tonAddress = useTonAddress(false); // raw address

  const isEvm = EVM_CHAINS.includes(chain);
  const isSol = chain === "sol";
  const isTon = chain === "ton";

  // Reset wallet state when chain changes
  useEffect(() => {
    if (prevChainRef.current !== chain) {
      // A WalletConnect session is bound to the chain it was paired with —
      // drop it so the next connect re-pairs for the new chain.
      if (evmTransport === "walletconnect") {
        disconnectWalletConnect().catch(() => {});
      }
      setEvmTransport(null);
      setConnectedAddress(null);
      setEvmSigner(null);
      setSending(false);
      prevChainRef.current = chain;
    }
  }, [chain, evmTransport]);

  // Sync TON connected address from TonConnect
  useEffect(() => {
    if (isTon && tonAddress) {
      setConnectedAddress(tonAddress);
    }
  }, [isTon, tonAddress]);

  // Check extension availability
  const hasEvmWallet = isEvm && isEvmAvailable();
  const hasSolWallet = isSol && isSolanaAvailable();

  // WalletConnect is the EVM fallback when no extension is injected
  // (Telegram WebApp / mobile browsers). Configured = project id baked in.
  const wcConfigured = isEvm && isWalletConnectConfigured();
  // The injected button is the only EVM path when WalletConnect is not
  // configured; when it is configured and no extension exists, the injected
  // button (and its install prompt) would be a dead end — hide both.
  const showInjectedButton = !isEvm || hasEvmWallet || !wcConfigured;
  const showInstallPrompt = isEvm
    ? !hasEvmWallet && !wcConfigured
    : !hasSolWallet && !isTon;

  // Determine wallet type for install prompt
  const walletType = isEvm ? "evm" : isSol ? "sol" : "ton";
  const walletInfo = INSTALL_URLS[walletType];
  // TON uses TonConnect (QR + deep links), always available
  const hasExtension = hasEvmWallet || hasSolWallet || isTon;

  async function handleConnect() {
    // If no extension, open install page
    if (!hasExtension) {
      window.open(walletInfo.url, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      if (isEvm) {
        const { signer, address } = await connectEvm(chain);
        setEvmSigner(signer);
        setEvmTransport("injected");
        setConnectedAddress(address);
        onStatus("pending", `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`);
      } else if (isSol) {
        const { address } = await connectSolana();
        setConnectedAddress(address);
        onStatus("pending", `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`);
      } else if (isTon) {
        // Open TonConnect modal (QR code / wallet list)
        await tonConnectUI.openModal();
      }
    } catch (err) {
      onStatus("error", friendlyError(err));
    }
  }

  async function handleConnectWalletConnect() {
    try {
      // connect() opens the WalletConnect QR modal and establishes the
      // session for the selected chain before the provider is used.
      const wcProvider = await connectWalletConnect(chain);
      const { signer, address } = await connectEvm(chain, wcProvider);
      setEvmSigner(signer);
      setEvmTransport("walletconnect");
      setConnectedAddress(address);
      onStatus("pending", `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`);
    } catch (err) {
      onStatus("error", friendlyError(err));
    }
  }

  async function handleSend() {
    setSending(true);
    onStatus("pending", "Confirm the transaction in your wallet...");
    try {
      let txHash: string;

      if (isEvm && evmSigner) {
        txHash = await sendEvmTransfer(evmSigner, tokenAddress, walletAddress, amount);
      } else if (isSol) {
        const mintAddr = tokenAddress;
        txHash = await sendSolanaTransfer(mintAddr, walletAddress, amount);
      } else if (isTon) {
        // Build TEP-74 jetton transfer message and send via TonConnect
        const txMessage = buildTonTransferMessage({
          jettonAddress: tokenAddress,
          toAddress: walletAddress,
          amountUsd: amount,
        });
        const result = await tonConnectUI.sendTransaction(txMessage);
        // TonConnect returns { boc: string } — the signed transaction BOC
        // Use BOC as the transaction identifier for verification
        txHash = result.boc;
      } else {
        throw new Error("Wallet not connected");
      }

      onTxSent(txHash);
    } catch (err) {
      onStatus("error", friendlyError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Connect button — always shown */}
      {!connectedAddress && (
        <>
          {showInjectedButton && (
            <button
              onClick={handleConnect}
              disabled={disabled}
              className={`
                w-full rounded-lg px-4 py-3 text-sm font-semibold
                transition-all duration-150
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                ${isEvm ? "bg-[#3b82f6] hover:bg-[#2563eb] text-white" : ""}
                ${isSol ? "bg-[#ab9ff2] hover:bg-[#9b8fe2] text-black" : ""}
                ${isTon ? "bg-[#0098ea] hover:bg-[#0088d0] text-white" : ""}
              `}
            >
              {isEvm && "Connect Wallet"}
              {isSol && "Connect Phantom"}
              {isTon && "Connect TON Wallet"}
            </button>
          )}

          {/* WalletConnect option (EVM only, when a project id is configured) */}
          {wcConfigured && (
            <button
              onClick={handleConnectWalletConnect}
              disabled={disabled}
              className={`
                w-full rounded-lg px-4 py-3 text-sm font-semibold
                transition-all duration-150
                border border-[#3b82f6] text-[#3b82f6] hover:bg-[#3b82f6]/10
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              Connect with WalletConnect
            </button>
          )}

          {/* Install prompt when extension not detected */}
          {showInstallPrompt && (
            <p className="text-xs text-muted text-center">
              {walletInfo.name} not detected.{" "}
              <a
                href={walletInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline hover:text-accent-hover"
              >
                Install {walletInfo.name}
              </a>
            </p>
          )}
        </>
      )}

      {/* Connected state */}
      {connectedAddress && (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
            <div className="h-2 w-2 rounded-full bg-success" />
            <span className="text-xs font-mono text-success">
              {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
            </span>
          </div>

          <button
            onClick={handleSend}
            disabled={disabled || sending}
            className={`
              w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white
              transition-all duration-150
              ${disabled || sending ? "opacity-50 cursor-not-allowed" : "hover:bg-accent-hover cursor-pointer"}
            `}
          >
            {sending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Sending...
              </span>
            ) : (
              `Pay $${amount.toFixed(2)} ${token.toUpperCase()}`
            )}
          </button>
        </>
      )}

      {/* WalletConnect docs link — with the EVM connect controls, ungated */}
      {isEvm && (
        <p className="text-xs text-muted text-center">
          New to WalletConnect?{" "}
          <a
            href="https://docs.walletconnect.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent-hover"
          >
            WalletConnect docs
          </a>
        </p>
      )}
    </div>
  );
}
