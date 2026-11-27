import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://pay.agentlabs.cc"),
  title: "Pay with Crypto - OpenClaw",
  description: "Pay for your OpenClaw subscription with USDC or USDT",
  keywords: [
    "crypto payments",
    "USDC",
    "USDT",
    "Pay by AgentLabs",
    "crypto payments SDK",
  ],
  openGraph: {
    type: "website",
    siteName: "Pay by AgentLabs",
    title: "Pay by AgentLabs — Pay with Crypto",
    description:
      "Pay with USDC or USDT. Pay by AgentLabs is a free open-source crypto payments SDK with no platform fees: https://pay.agentlabs.cc/sdk",
    url: "https://pay.agentlabs.cc",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pay by AgentLabs — Pay with Crypto",
    description:
      "Pay with USDC or USDT. Free open-source crypto payments SDK, no platform fees.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
