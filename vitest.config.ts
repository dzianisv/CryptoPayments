import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    exclude: ["web/**", "mcp/**", "node_modules/**"],
  },
});
