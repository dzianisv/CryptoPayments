import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend THIS vitest instance's expect (web's vitest 4.0.18) directly.
// Do NOT use `@testing-library/jest-dom/vitest`: that entry imports the
// bare `vitest` package, which from jest-dom's store location resolves to
// the workspace ROOT's vitest 3.2.4 (the API's), so the matchers land on
// the wrong expect instance and every toBeInTheDocument() fails with
// "Invalid Chai property" (issue #6101, CP F2). Importing `expect` here
// resolves from this file, i.e. web's vitest 4.0.18 — the instance the
// tests actually run under.
expect.extend(matchers);

// Mock window.Telegram for all tests
Object.defineProperty(window, "Telegram", {
  value: undefined,
  writable: true,
  configurable: true,
});

// Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(""),
  },
  writable: true,
  configurable: true,
});
