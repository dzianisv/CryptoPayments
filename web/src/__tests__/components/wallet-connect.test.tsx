import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WalletConnect } from "@/components/wallet-connect";
import type { StatusType } from "@/components/status-message";

// Mock wallet modules
vi.mock("@/lib/wallets/evm", () => ({
  isEvmAvailable: vi.fn(() => false),
  connectEvm: vi.fn(),
  sendEvmTransfer: vi.fn(),
}));

vi.mock("@/lib/wallets/walletconnect", () => ({
  isWalletConnectConfigured: vi.fn(() => false),
  connectWalletConnect: vi.fn(),
  disconnectWalletConnect: vi.fn(async () => {}),
}));

vi.mock("@/lib/wallets/solana", () => ({
  isSolanaAvailable: vi.fn(() => false),
  connectSolana: vi.fn(),
  sendSolanaTransfer: vi.fn(),
}));

vi.mock("@/lib/wallets/ton", () => ({
  isTonAvailable: vi.fn(() => true),
  buildTonTransferMessage: vi.fn(() => ({
    validUntil: 1234567890,
    messages: [{ address: "EQ...", amount: "50000000", payload: "base64boc" }],
  })),
}));

// Mock TonConnect hooks
const mockOpenModal = vi.fn();
const mockSendTransaction = vi.fn();
let mockTonAddress = "";

vi.mock("@tonconnect/ui-react", () => ({
  useTonConnectUI: () => [
    { openModal: mockOpenModal, sendTransaction: mockSendTransaction },
    vi.fn(),
  ],
  useTonAddress: () => mockTonAddress,
  TonConnectUIProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { isEvmAvailable, connectEvm, sendEvmTransfer } from "@/lib/wallets/evm";
import {
  isWalletConnectConfigured,
  connectWalletConnect,
  disconnectWalletConnect,
} from "@/lib/wallets/walletconnect";
import { isSolanaAvailable, connectSolana, sendSolanaTransfer } from "@/lib/wallets/solana";
import { buildTonTransferMessage } from "@/lib/wallets/ton";

const defaultProps = {
  chain: "base" as const,
  token: "usdc" as const,
  tokenAddress: "0xToken",
  walletAddress: "0xWallet",
  amount: 10,
  onTxSent: vi.fn(),
  onStatus: vi.fn(),
};

describe("WalletConnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWalletConnectConfigured).mockReturnValue(false);
    mockTonAddress = "";
  });

  it("always shows Connect Wallet button for EVM chains", () => {
    vi.mocked(isEvmAvailable).mockReturnValue(false);
    render(<WalletConnect {...defaultProps} chain="base" />);
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });

  it("shows install prompt when EVM wallet is not detected", () => {
    vi.mocked(isEvmAvailable).mockReturnValue(false);
    render(<WalletConnect {...defaultProps} chain="base" />);
    expect(screen.getByText(/EVM wallet not detected/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Install EVM wallet/i })).toHaveAttribute(
      "href",
      "https://metamask.io/download/",
    );
  });

  it("opens install page when clicking connect without extension", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(false);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<WalletConnect {...defaultProps} chain="base" />);
    await user.click(screen.getByText("Connect Wallet"));

    expect(openSpy).toHaveBeenCalledWith(
      "https://metamask.io/download/",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("does not show install prompt when EVM wallet is available", () => {
    vi.mocked(isEvmAvailable).mockReturnValue(true);
    render(<WalletConnect {...defaultProps} chain="base" />);
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
    expect(screen.queryByText(/EVM wallet not detected/i)).not.toBeInTheDocument();
  });

  it("always shows Connect Phantom button for Solana", () => {
    vi.mocked(isSolanaAvailable).mockReturnValue(false);
    render(<WalletConnect {...defaultProps} chain="sol" />);
    expect(screen.getByText("Connect Phantom")).toBeInTheDocument();
    expect(screen.getByText(/Phantom not detected/i)).toBeInTheDocument();
  });

  it("shows Connect Phantom without install prompt when Phantom is available", () => {
    vi.mocked(isSolanaAvailable).mockReturnValue(true);
    render(<WalletConnect {...defaultProps} chain="sol" />);
    expect(screen.getByText("Connect Phantom")).toBeInTheDocument();
    expect(screen.queryByText(/Phantom not detected/i)).not.toBeInTheDocument();
  });

  it("shows Connect TON Wallet button for TON chain", () => {
    render(<WalletConnect {...defaultProps} chain="ton" />);
    expect(screen.getByText("Connect TON Wallet")).toBeInTheDocument();
  });

  it("does not show install prompt for TON (uses TonConnect QR)", () => {
    render(<WalletConnect {...defaultProps} chain="ton" />);
    expect(screen.queryByText(/Tonkeeper not detected/i)).not.toBeInTheDocument();
  });

  it("connects EVM wallet and shows address on click", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(true);
    vi.mocked(connectEvm).mockResolvedValue({
      signer: {} as any,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });

    const onStatus = vi.fn();
    render(<WalletConnect {...defaultProps} chain="base" onStatus={onStatus} />);

    await user.click(screen.getByText("Connect Wallet"));
    expect(connectEvm).toHaveBeenCalledWith("base");
    expect(onStatus).toHaveBeenCalledWith("pending", expect.stringContaining("0x1234"));
  });

  it("shows error when EVM connection fails", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(true);
    vi.mocked(connectEvm).mockRejectedValue(new Error("Unknown wallet error"));

    const onStatus = vi.fn();
    render(<WalletConnect {...defaultProps} chain="base" onStatus={onStatus} />);

    await user.click(screen.getByText("Connect Wallet"));
    expect(onStatus).toHaveBeenCalledWith("error", "Unknown wallet error");
  });

  it("connects Phantom and shows address on click", async () => {
    const user = userEvent.setup();
    vi.mocked(isSolanaAvailable).mockReturnValue(true);
    vi.mocked(connectSolana).mockResolvedValue({
      publicKey: {} as any,
      address: "SoLANAAddress123456789012345678901234567890",
    });

    const onStatus = vi.fn();
    render(<WalletConnect {...defaultProps} chain="sol" onStatus={onStatus} />);

    await user.click(screen.getByText("Connect Phantom"));
    expect(connectSolana).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith("pending", expect.stringContaining("SoLANA"));
  });

  it("disables connect button when disabled prop is true", () => {
    vi.mocked(isEvmAvailable).mockReturnValue(true);
    render(<WalletConnect {...defaultProps} chain="base" disabled />);
    expect(screen.getByText("Connect Wallet")).toBeDisabled();
  });

  it("sends EVM payment after connecting", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(true);
    const mockSigner = { mock: true };
    vi.mocked(connectEvm).mockResolvedValue({
      signer: mockSigner as any,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });
    vi.mocked(sendEvmTransfer).mockResolvedValue("0xTxHash123");

    const onTxSent = vi.fn();
    const onStatus = vi.fn();
    render(
      <WalletConnect
        {...defaultProps}
        chain="base"
        onTxSent={onTxSent}
        onStatus={onStatus}
      />,
    );

    // Connect
    await user.click(screen.getByText("Connect Wallet"));

    // Send
    await user.click(screen.getByText("Pay $10.00 USDC"));
    expect(sendEvmTransfer).toHaveBeenCalledWith(mockSigner, "0xToken", "0xWallet", 10);
    expect(onTxSent).toHaveBeenCalledWith("0xTxHash123");
  });

  it("shows error when send fails", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(true);
    vi.mocked(connectEvm).mockResolvedValue({
      signer: {} as any,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });
    vi.mocked(sendEvmTransfer).mockRejectedValue(new Error("Insufficient balance"));

    const onStatus = vi.fn();
    render(<WalletConnect {...defaultProps} chain="base" onStatus={onStatus} />);

    await user.click(screen.getByText("Connect Wallet"));
    await user.click(screen.getByText("Pay $10.00 USDC"));
    expect(onStatus).toHaveBeenCalledWith("error", "Insufficient balance");
  });

  it("resets wallet state when chain changes", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(true);
    vi.mocked(connectEvm).mockResolvedValue({
      signer: {} as any,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });

    const { rerender } = render(<WalletConnect {...defaultProps} chain="base" />);

    // Connect on Base
    await user.click(screen.getByText("Connect Wallet"));
    expect(screen.getByText(/0x1234/)).toBeInTheDocument();

    // Switch to Solana — connected state should reset
    vi.mocked(isSolanaAvailable).mockReturnValue(false);
    rerender(<WalletConnect {...defaultProps} chain="sol" />);
    expect(screen.queryByText(/0x1234/)).not.toBeInTheDocument();
    expect(screen.getByText("Connect Phantom")).toBeInTheDocument();
  });

  it("shows friendly error for user rejection (ACTION_REJECTED)", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(true);
    vi.mocked(connectEvm).mockResolvedValue({
      signer: {} as any,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });
    vi.mocked(sendEvmTransfer).mockRejectedValue(
      new Error('user rejected action (action="sendTransaction", reason="rejected", code=ACTION_REJECTED, version=6.16.0)'),
    );

    const onStatus = vi.fn();
    render(<WalletConnect {...defaultProps} chain="base" onStatus={onStatus} />);

    await user.click(screen.getByText("Connect Wallet"));
    await user.click(screen.getByText("Pay $10.00 USDC"));
    expect(onStatus).toHaveBeenCalledWith("error", "Transaction cancelled");
  });

  it("shows friendly error for insufficient funds", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(true);
    vi.mocked(connectEvm).mockResolvedValue({
      signer: {} as any,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });
    vi.mocked(sendEvmTransfer).mockRejectedValue(
      new Error("insufficient funds for intrinsic transaction cost (code=INSUFFICIENT_FUNDS)"),
    );

    const onStatus = vi.fn();
    render(<WalletConnect {...defaultProps} chain="base" onStatus={onStatus} />);

    await user.click(screen.getByText("Connect Wallet"));
    await user.click(screen.getByText("Pay $10.00 USDC"));
    expect(onStatus).toHaveBeenCalledWith("error", "Insufficient funds for gas fees");
  });

  it("shows friendly error for ERC20 transfer amount exceeds balance", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(true);
    vi.mocked(connectEvm).mockResolvedValue({
      signer: {} as any,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });
    vi.mocked(sendEvmTransfer).mockRejectedValue(
      new Error(
        'execution reverted: "ERC20: transfer amount exceeds balance" (action="estimateGas", code=CALL_EXCEPTION)',
      ),
    );

    const onStatus = vi.fn();
    render(<WalletConnect {...defaultProps} chain="base" onStatus={onStatus} />);

    await user.click(screen.getByText("Connect Wallet"));
    await user.click(screen.getByText("Pay $10.00 USDC"));
    expect(onStatus).toHaveBeenCalledWith(
      "error",
      "Insufficient token balance. Please fund your wallet and try again.",
    );
  });

  // --- WalletConnect tests ---

  it("hides the WalletConnect button when WalletConnect is not configured", () => {
    vi.mocked(isEvmAvailable).mockReturnValue(false);
    vi.mocked(isWalletConnectConfigured).mockReturnValue(false);
    render(<WalletConnect {...defaultProps} chain="base" />);
    expect(screen.queryByText("Connect with WalletConnect")).not.toBeInTheDocument();
  });

  it("shows the WalletConnect button when configured, even with no injected wallet and no install prompt", () => {
    vi.mocked(isEvmAvailable).mockReturnValue(false);
    vi.mocked(isWalletConnectConfigured).mockReturnValue(true);
    render(<WalletConnect {...defaultProps} chain="base" />);
    expect(screen.getByText("Connect with WalletConnect")).toBeInTheDocument();
    // The injected button is a dead end here (no extension) — hidden.
    expect(screen.queryByText("Connect Wallet")).not.toBeInTheDocument();
    expect(screen.queryByText(/not detected/i)).not.toBeInTheDocument();
  });

  it("connects via WalletConnect and shows address + Pay button", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(false);
    vi.mocked(isWalletConnectConfigured).mockReturnValue(true);
    const wcProvider = { request: vi.fn() };
    vi.mocked(connectWalletConnect).mockResolvedValue(wcProvider as any);
    vi.mocked(connectEvm).mockResolvedValue({
      signer: {} as any,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });

    const onStatus = vi.fn();
    render(<WalletConnect {...defaultProps} chain="base" onStatus={onStatus} />);

    await user.click(screen.getByText("Connect with WalletConnect"));
    expect(connectWalletConnect).toHaveBeenCalledWith("base");
    expect(connectEvm).toHaveBeenCalledWith("base", wcProvider);
    expect(onStatus).toHaveBeenCalledWith("pending", expect.stringContaining("0x1234"));
    expect(screen.getByText("Pay $10.00 USDC")).toBeInTheDocument();
  });

  it("disconnects the WalletConnect session when the chain changes", async () => {
    const user = userEvent.setup();
    vi.mocked(isEvmAvailable).mockReturnValue(false);
    vi.mocked(isWalletConnectConfigured).mockReturnValue(true);
    vi.mocked(connectWalletConnect).mockResolvedValue({ request: vi.fn() } as any);
    vi.mocked(connectEvm).mockResolvedValue({
      signer: {} as any,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });

    const { rerender } = render(<WalletConnect {...defaultProps} chain="base" />);
    await user.click(screen.getByText("Connect with WalletConnect"));
    expect(screen.getByText(/0x1234/)).toBeInTheDocument();

    rerender(<WalletConnect {...defaultProps} chain="eth" />);
    expect(disconnectWalletConnect).toHaveBeenCalled();
    expect(screen.queryByText(/0x1234/)).not.toBeInTheDocument();
  });

  it("shows the WalletConnect docs link for EVM chains when not configured", () => {
    vi.mocked(isWalletConnectConfigured).mockReturnValue(false);
    render(<WalletConnect {...defaultProps} chain="base" />);
    const link = screen.getByRole("link", { name: /WalletConnect docs/i });
    expect(link).toHaveAttribute("href", "https://docs.walletconnect.com/");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows the WalletConnect docs link for EVM chains when configured", () => {
    vi.mocked(isWalletConnectConfigured).mockReturnValue(true);
    render(<WalletConnect {...defaultProps} chain="base" />);
    const link = screen.getByRole("link", { name: /WalletConnect docs/i });
    expect(link).toHaveAttribute("href", "https://docs.walletconnect.com/");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not show the WalletConnect docs link for non-EVM chains", () => {
    render(<WalletConnect {...defaultProps} chain="sol" />);
    expect(
      screen.queryByRole("link", { name: /WalletConnect docs/i }),
    ).not.toBeInTheDocument();
  });

  // --- TON Connect tests ---

  it("opens TonConnect modal when clicking Connect TON Wallet", async () => {
    const user = userEvent.setup();
    render(<WalletConnect {...defaultProps} chain="ton" />);

    await user.click(screen.getByText("Connect TON Wallet"));
    expect(mockOpenModal).toHaveBeenCalled();
  });

  it("shows connected TON address from TonConnect hook", () => {
    mockTonAddress = "0:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    render(<WalletConnect {...defaultProps} chain="ton" />);

    // Should show truncated address and Pay button
    expect(screen.getByText(/0:1234/)).toBeInTheDocument();
    expect(screen.getByText("Pay $10.00 USDC")).toBeInTheDocument();
  });

  it("sends TON jetton transfer via TonConnect", async () => {
    const user = userEvent.setup();
    mockTonAddress = "0:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    mockSendTransaction.mockResolvedValue({ boc: "te6cckEBAQEA..." });

    const onTxSent = vi.fn();
    render(
      <WalletConnect
        {...defaultProps}
        chain="ton"
        tokenAddress="EQJettonAddr"
        walletAddress="EQDestAddr"
        onTxSent={onTxSent}
      />,
    );

    // Should already show connected state from tonAddress hook
    await user.click(screen.getByText("Pay $10.00 USDC"));

    expect(buildTonTransferMessage).toHaveBeenCalledWith({
      jettonAddress: "EQJettonAddr",
      toAddress: "EQDestAddr",
      amountUsd: 10,
    });
    expect(mockSendTransaction).toHaveBeenCalledWith({
      validUntil: 1234567890,
      messages: [{ address: "EQ...", amount: "50000000", payload: "base64boc" }],
    });
    expect(onTxSent).toHaveBeenCalledWith("te6cckEBAQEA...");
  });

  it("shows friendly error when TON transaction is rejected", async () => {
    const user = userEvent.setup();
    mockTonAddress = "0:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    mockSendTransaction.mockRejectedValue(new Error("User rejected the transaction"));

    const onStatus = vi.fn();
    render(
      <WalletConnect {...defaultProps} chain="ton" onStatus={onStatus} />,
    );

    await user.click(screen.getByText("Pay $10.00 USDC"));
    expect(onStatus).toHaveBeenCalledWith("error", "Transaction cancelled");
  });
});
