import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/stores/**/*.ts",
        "src/components/**/*.tsx",
      ],
      exclude: [
        "**/*.test.*",
        "src/test/**",
        "src/routes/**",
        "src/main.tsx",
        "src/app.tsx",
        "src/vite-env.d.ts",
        "src/components/ui/**",
        "**/routeTree.gen.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
