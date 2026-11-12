export interface Config {
  port: number;
  /** Postgres connection string for the self-hosted CNPG Cluster (#6101).
   *  Replaces the Supabase project URL + service-role key. */
  databaseUrl: string;
  wallets: {
    base: string;
    eth: string;
    ton: string;
    sol: string;
    base_sepolia: string;
    eth_sepolia: string;
  };
  rpc: {
    base: string;
    eth: string;
    sol: string;
    ton: string;
    base_sepolia: string;
    eth_sepolia: string;
  };
  prices: {
    /** Primary key: the byok plan id used everywhere else (bot PLANS, SPA ?plan=byok).
     *  Sourced from PRICE_BYOK, falling back to PRICE_STARTER for the old env only;
     *  the new deployment sets PRICE_BYOK=5 and does NOT set PRICE_STARTER. */
    byok: number;
    /** Backwards-compatible alias with the same value as byok, so the SPA
     *  fallback `prices[plan] ?? prices.starter` can never again show a stale $10. */
    starter: number;
    pro: number;
    max: number;
  };
  /** Telegram bot token — required for initData verification in Mini App mode */
  telegramBotToken: string;
  /** Shared API key for bot-to-payment-service calls */
  apiKey: string;
  /** HMAC secret for webhook callbacks to OpenClawBot */
  callbackSecret: string;
  /** Shared secret for signed checkout intents. Defaults to callbackSecret. */
  checkoutSecret: string;
  /** Base URL for the payment page (for generating links) */
  baseUrl: string;
}

/** Read an env var with an optional fallback (Deno + Node compatible). */
const env = (key: string, fallback = ""): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (g.Deno?.env?.get) return g.Deno.env.get(key) ?? fallback;
  return g.process?.env?.[key] ?? fallback;
};

export function loadConfig(): Config {
  return {
    port: Number(env("PORT")) || 3003,
    databaseUrl: env("DATABASE_URL"),
    wallets: {
      base: env("WALLET_BASE"),
      eth: env("WALLET_ETH"),
      ton: env("WALLET_TON"),
      sol: env("WALLET_SOL"),
      base_sepolia: env("WALLET_BASE_SEPOLIA", env("WALLET_BASE")),
      eth_sepolia: env("WALLET_ETH_SEPOLIA", env("WALLET_ETH")),
    },
    rpc: {
      base: env("RPC_BASE", "https://mainnet.base.org"),
      eth: env("RPC_ETH", "https://cloudflare-eth.com"),
      sol: env("RPC_SOL", "https://api.mainnet-beta.solana.com"),
      ton: env("RPC_TON", "https://toncenter.com/api/v3"),
      base_sepolia: env("RPC_BASE_SEPOLIA", "https://sepolia.base.org"),
      eth_sepolia: env("RPC_ETH_SEPOLIA", "https://rpc.sepolia.org"),
    },
    prices: {
      // byok first: PRICE_BYOK=5 in the new deployment; PRICE_STARTER is only
      // the fallback for the old env (which set PRICE_STARTER=10 by default).
      // starter is emitted as an alias with the same value (see the type above).
      byok: Number(env("PRICE_BYOK", env("PRICE_STARTER"))) || 5,
      starter: Number(env("PRICE_BYOK", env("PRICE_STARTER"))) || 5,
      pro: Number(env("PRICE_PRO")) || 25,
      max: Number(env("PRICE_MAX")) || 100,
    },
    telegramBotToken: env("TELEGRAM_BOT_TOKEN"),
    apiKey: env("API_KEY"),
    callbackSecret: env("CALLBACK_SECRET"),
    checkoutSecret: env("CHECKOUT_SECRET", env("CALLBACK_SECRET")),
    baseUrl: env("BASE_URL", "https://pay.openclaw.ai"),
  };
}

/** Supported chain identifiers */
export type ChainId = "base" | "eth" | "ton" | "sol" | "base_sepolia" | "eth_sepolia";

/** Token contract/mint addresses per chain (all 6 decimals) */
export const TOKEN_ADDRESSES: Record<ChainId, { usdt: string; usdc: string }> = {
  base: {
    usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  eth: {
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  ton: {
    usdt: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
    usdc: "EQCxlMUk0_5_TABhCHdXqHEVjYpOCnFBkKpKGRpMpech0diD",
  },
  sol: {
    usdt: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  base_sepolia: {
    usdt: "0x", // No official USDT on Base Sepolia — placeholder
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Circle testnet USDC
  },
  eth_sepolia: {
    usdt: "0x", // No official USDT on Eth Sepolia — placeholder
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Circle testnet USDC
  },
};

export type TokenId = "usdt" | "usdc";
