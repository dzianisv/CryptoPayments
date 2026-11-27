// EVM wallet integration via ethers.js v6 (works with any EIP-1193 wallet)

import {
  BrowserProvider,
  Contract,
  parseUnits,
  type Eip1193Provider,
  type Signer,
} from "ethers";
import { ERC20_ABI, EVM_CHAIN_IDS, EVM_CHAIN_PARAMS, type ChainId } from "../config";

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export function isEvmAvailable(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

/** Check if a wallet error is "chain not recognized" (code 4902).
 *  ethers.js v6 wraps the raw provider error in UNKNOWN_ERROR,
 *  so we also check data.originalError.code. */
function isChainNotAddedError(err: unknown): boolean {
  const e = err as { code?: number; data?: { originalError?: { code?: number } } };
  if (e.code === 4902) return true;
  if (e.data?.originalError?.code === 4902) return true;
  // Also match the error message as a last resort
  if (err instanceof Error && err.message.includes("Unrecognized chain ID")) return true;
  return false;
}

export async function connectEvm(
  chainId: ChainId,
  eip1193?: Eip1193Provider,
): Promise<{ signer: Signer; address: string }> {
  // An explicit EIP-1193 provider (e.g. WalletConnect) wins; the default is
  // the injected window.ethereum. The "No EVM wallet detected" throw applies
  // only when neither is available.
  const injected =
    eip1193 ?? (typeof window !== "undefined" ? window.ethereum : undefined);
  if (!injected) throw new Error("No EVM wallet detected");

  const provider = new BrowserProvider(injected);
  await provider.send("eth_requestAccounts", []);

  // Switch to correct chain
  const targetChainId = EVM_CHAIN_IDS[chainId];
  if (targetChainId) {
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: targetChainId }]);
    } catch (err: unknown) {
      if (isChainNotAddedError(err)) {
        // Try to add the chain if we have params for it
        const chainParams = EVM_CHAIN_PARAMS[chainId];
        if (chainParams) {
          await provider.send("wallet_addEthereumChain", [chainParams]);
        } else {
          throw new Error(`Please add ${chainId} network to your wallet`);
        }
      } else {
        throw err;
      }
    }
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { signer, address };
}

export async function sendEvmTransfer(
  signer: Signer,
  tokenAddress: string,
  toAddress: string,
  amountUsd: number,
): Promise<string> {
  if (tokenAddress === "0x" || !tokenAddress) {
    throw new Error("Token not available on this chain");
  }

  const amount = parseUnits(amountUsd.toString(), 6); // USDC/USDT = 6 decimals
  const contract = new Contract(tokenAddress, ERC20_ABI, signer);
  const tx = await contract.transfer(toAddress, amount);
  return tx.hash;
}
