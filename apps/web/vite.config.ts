import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { builtinModules } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

// Provide empty stub modules for Node.js builtins so the build succeeds
// AND the output loads in a browser/webview (no unresolvable bare specifiers).
// Uses Rollup's syntheticNamedExports so `import { Readable } from "stream"`
// resolves to a no-op function via the Proxy default export.
//
// Why not alternatives: `rollupOptions.external` leaves bare specifiers like
// `from"stream"` in the output, which can't resolve in a webview (blank
// screen in the Tauri app); `vite-plugin-node-polyfills` fails on CommonJS
// subpath resolution (e.g. `fs/promises`). The deps that pull these in
// (pi-ai/pi-agent-core) only touch Node builtins on code paths the webview
// never executes — each stubbed property warns at runtime if actually called.
function nodeStubsPlugin(): Plugin {
  // Modules with real npm polyfills installed — let Vite resolve them normally
  const exclude = new Set(["buffer"]);

  const stubs = new Set([
    ...builtinModules.filter((m) => !exclude.has(m)),
    ...builtinModules.filter((m) => !exclude.has(m)).map((m) => `node:${m}`),
    "fs/promises",
    "util/types",
    // Optional peer dep pulled in transitively (pi-ai → @mistralai/mistralai v2
    // observability). It is not installed and the app never uses Mistral, so the
    // import would otherwise leave an unresolvable named export and fail the build.
    "@opentelemetry/api",
  ]);

  return {
    name: "node-stubs",
    enforce: "pre",
    resolveId(source) {
      if (stubs.has(source)) {
        return `\0node-stub:${source}`;
      }
    },
    load(id) {
      if (id.startsWith("\0node-stub:")) {
        const moduleName = JSON.stringify(id.slice("\0node-stub:".length));
        return {
          code: [
            `const moduleName = ${moduleName};`,
            "function noop() {}",
            // Warn when a stubbed API is actually *called* (not merely
            // imported), so real Node usage in the webview surfaces instead
            // of failing silently.
            "const warners = new Map();",
            "function warner(prop) {",
            "  if (!warners.has(prop)) {",
            "    warners.set(prop, function stub() {",
            "      console.warn(`[node-stub] ${moduleName}.${String(prop)}() called in webview — this is a no-op`);",
            "      return noop;",
            "    });",
            "  }",
            "  return warners.get(prop);",
            "}",
            "const handler = {",
            "  get(_, p) { return typeof p === 'symbol' ? undefined : warner(p); },",
            "  apply() { return noop; },",
            "  construct() { return {}; },",
            "};",
            "export default new Proxy(noop, handler);",
          ].join("\n"),
          syntheticNamedExports: "default",
        };
      }
    },
  };
}

export default defineConfig({
  plugins: [nodeStubsPlugin(), tailwindcss(), tanstackRouter({}), react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: /^shiki$/, replacement: "shiki/bundle/full" },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Keep individual language grammars and themes as lazy chunks
          if (id.includes("@shikijs/langs") || id.includes("@shikijs/themes"))
            return;
          if (id.includes("shiki") || id.includes("@shikijs")) return "shiki";
          if (id.includes("streamdown")) return "shiki";
          if (
            id.includes("pi-ai") ||
            id.includes("pi-agent") ||
            id.includes("pi-coding")
          )
            return "pi";
          if (id.includes("@tanstack")) return "tanstack";
          if (
            id.includes("@radix-ui") ||
            id.includes("@base-ui") ||
            id.includes("class-variance-authority") ||
            id.includes("lucide-react")
          )
            return "ui";
        },
      },
    },
  },
  server: {
    port: 3001,
  },
});
