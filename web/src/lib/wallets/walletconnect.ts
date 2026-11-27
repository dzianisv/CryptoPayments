// WalletConnect v2 transport for EVM chains (AgentPod #6438, design v2).
//
// The WalletConnect EthereumProvider is loaded LAZILY via dynamic import()
// inside the connect flow only — a static import anywhere in the module
// graph breaks the static-export prerender (the provider and its AppKit
// modal are client-only). The project id is likewise read lazily inside
// functions, never at module top level.

import { EVM_CHAIN_IDS, type ChainId } from "../config";

/** Minimal structural view of the WalletConnect EthereumProvider: the
 *  EIP-1193 surface the ethers flow needs, without importing WC types. */
export interface WalletConnectProviderLike {
  connect: (opts?: { chains?: number[]; optionalChains?: number[] }) => Promise<void>;
  disconnect: () => Promise<void>;
  request: (args: {
    method: string;
    params?: Array<unknown> | Record<string, unknown>;
  }) => Promise<unknown>;
}

// All EVM chains the pay page supports, as numeric (eip155) chain ids:
// Base, Ethereum, Base Sepolia, Ethereum Sepolia.
const ALL_EVM_CHAIN_IDS: number[] = [8453, 1, 84532, 11155111];

const RPC_MAP: Record<string, string> = {
  "8453": "https://mainnet.base.org",
  "1": "https://ethereum-rpc.publicnode.com",
  "84532": "https://sepolia.base.org",
  "11155111": "https://rpc.sepolia.org",
};

function getProjectId(): string {
  return process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
}

export function isWalletConnectConfigured(): boolean {
  return getProjectId().length > 0;
}

// Cached init promise. Cleared by disconnectWalletConnect(): a provider
// instance is unusable after disconnect(), so the next connect re-inits.
let providerPromise: Promise<WalletConnectProviderLike> | null = null;

async function initProvider(): Promise<WalletConnectProviderLike> {
  if (!providerPromise) {
    providerPromise = (async () => {
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      const provider = await EthereumProvider.init({
        projectId: getProjectId(),
        optionalChains: [8453, 1, 84532, 11155111],
        showQrModal: true,
        metadata: {
          name: "AgentPod Pay",
          description: "Pay for your AgentPod plan with crypto",
          url: "https://pay.agentlabs.cc",
          icons: ["https://pay.agentlabs.cc/globe.svg"],
        },
        rpcMap: RPC_MAP,
      });
      return provider as unknown as WalletConnectProviderLike;
    })();
  }
  return providerPromise;
}

/**
 * Establish a WalletConnect session for the selected chain and return the
 * sessioned EIP-1193 provider. provider.connect() opens the QR modal and
 * establishes the session BEFORE the provider is returned — no request()
 * may be made before connect() resolves.
 */
export async function connectWalletConnect(
  chainId: ChainId,
): Promise<WalletConnectProviderLike> {
  const provider = await initProvider();
  const numericChainId = parseInt(EVM_CHAIN_IDS[chainId], 16);
  const optionalChains = ALL_EVM_CHAIN_IDS.filter((id) => id !== numericChainId);
  await provider.connect({ chains: [numericChainId], optionalChains });
  return provider;
}

/** Disconnect the current session (if any) and always clear the cache. */
export async function disconnectWalletConnect(): Promise<void> {
  if (!providerPromise) return;
  try {
    const provider = await providerPromise;
    await provider.disconnect();
  } catch {
    // A failed init/disconnect must not wedge the cache — cleared below.
  } finally {
    providerPromise = null;
  }
}
