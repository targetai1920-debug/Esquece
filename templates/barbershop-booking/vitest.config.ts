import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js resolves these via its own bundler condition (empty on the
      // server). vitest doesn't run through that bundler, so without this
      // alias any transitive import of a "server-only"-marked module
      // (appsScriptClient.ts, admin/auth.ts) throws unconditionally.
      "server-only": path.resolve(__dirname, "./tests/stubs/empty.ts"),
      "client-only": path.resolve(__dirname, "./tests/stubs/empty.ts"),
    },
  },
});
