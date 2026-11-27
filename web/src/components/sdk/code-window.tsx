"use client";

import { useState, type ReactNode } from "react";

export type CodeTab = {
  label: string;
  copyText: string;
  content: ReactNode;
};

/**
 * Developer-style code panel: window chrome, optional language tabs,
 * copy button. Modeled on the code blocks used by the Coinbase and
 * Binance developer documentation.
 */
export function CodeWindow({
  tabs,
  className = "",
}: {
  tabs: CodeTab[];
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tabs[active].copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div
      className={`min-w-0 max-w-full overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0e] shadow-[0_16px_48px_-16px_rgba(0,0,0,0.8)] ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4">
        <span className="flex gap-1.5 py-3" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        </span>
        {tabs.length > 1 ? (
          <span className="flex gap-1" role="tablist" aria-label="Code sample language">
            {tabs.map((t, i) => (
              <button
                key={t.label}
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={`rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors ${
                  i === active
                    ? "bg-white/[0.07] text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </span>
        ) : (
          <span className="font-mono text-xs text-zinc-500">{tabs[0].label}</span>
        )}
        <button
          onClick={copy}
          aria-label="Copy code sample"
          className="ml-auto rounded-md px-2 py-1.5 font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6 text-zinc-200">
        {tabs[active].content}
      </pre>
    </div>
  );
}
