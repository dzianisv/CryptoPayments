import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the WalletConnect EthereumProvider at module level. The lib under
// test loads it via dynamic import(), so the mock factory's init is only
// invoked when connectWalletConnect() runs.
const wc = vi.hoisted(() => {
  const provider = {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    request: vi.fn(async () => null),
  };
  return { provider, init: vi.fn(async () => provider) };
});

vi.mock("@walletconnect/ethereum-provider", () => ({
  EthereumProvider: { init: wc.init },
}));

import {
  connectWalletConnect,
  disconnectWalletConnect,
  isWalletConnectConfigured,
} from "@/lib/wallets/walletconnect";

describe("walletconnect lib", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks drops call history but the init implementation must be
    // re-asserted so it keeps returning the fake provider.
    wc.init.mockResolvedValue(wc.provider);
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = "test-project-id";
    // Reset the module's provider cache between cases.
    await disconnectWalletConnect();
    vi.clearAllMocks();
    wc.init.mockResolvedValue(wc.provider);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  });

  it("isWalletConnectConfigured reflects the project id env var", () => {
    expect(isWalletConnectConfigured()).toBe(true);
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = "";
    expect(isWalletConnectConfigured()).toBe(false);
  });

  it("inits once with the project id and all EVM chains, then connect()s the selected chain before returning", async () => {
    const provider = await connectWalletConnect("base");

    expect(wc.init).toHaveBeenCalledTimes(1);
    const initOpts = wc.init.mock.calls[0][0] as unknown as {
      projectId: string;
      optionalChains: number[];
      showQrModal: boolean;
    };
    expect(initOpts.projectId).toBe("test-project-id");
    expect(initOpts.optionalChains).toEqual(
      expect.arrayContaining([8453, 1, 84532, 11155111]),
    );
    expect(initOpts.optionalChains).toHaveLength(4);
    expect(initOpts.showQrModal).toBe(true);

    // Session established by connect() with Base as the required chain,
    // before the provider is handed back — and no request() was made.
    expect(wc.provider.connect).toHaveBeenCalledTimes(1);
    expect(wc.provider.connect).toHaveBeenCalledWith({
      chains: [8453],
      optionalChains: expect.arrayContaining([1, 84532, 11155111]),
    });
    expect(wc.provider.request).not.toHaveBeenCalled();
    expect(provider).toBe(wc.provider);
  });

  it("requests Ethereum (chain 1) at connect time for the eth chain", async () => {
    await connectWalletConnect("eth");
    expect(wc.provider.connect).toHaveBeenCalledWith({
      chains: [1],
      optionalChains: expect.arrayContaining([8453, 84532, 11155111]),
    });
    expect(wc.provider.request).not.toHaveBeenCalled();
  });

  it("re-inits after disconnectWalletConnect clears the cached provider", async () => {
    await connectWalletConnect("base");
    expect(wc.init).toHaveBeenCalledTimes(1);

    await disconnectWalletConnect();
    expect(wc.provider.disconnect).toHaveBeenCalledTimes(1);

    await connectWalletConnect("base");
    expect(wc.init).toHaveBeenCalledTimes(2);
  });
});
