import { invoke, isTauri } from "@tauri-apps/api/core";
import { isLoggingEnabled } from "@/lib/logger";

/**
 * Selectively polyfill globalThis.fetch with Tauri's HTTP plugin fetch.
 * Routes remote HTTPS requests through Tauri's HTTP plugin (bypasses CORS),
 * while keeping everything else (relative URLs, localhost, Vite HMR, Tauri IPC)
 * on the original browser fetch.
 */
export async function initFetchPolyfill(): Promise<void> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    const originalFetch = globalThis.fetch;

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      // Route remote HTTPS requests through Tauri HTTP plugin (bypasses CORS)
      // Keep everything else (relative URLs, localhost, tauri.localhost) on native fetch
      try {
        const parsed = new URL(url, window.location.origin);
        if (
          parsed.protocol === "https:" &&
          parsed.hostname !== "localhost" &&
          !parsed.hostname.endsWith(".localhost") &&
          !parsed.hostname.startsWith("127.")
        ) {
          // Log POST request bodies (LLM API calls) only when the user has
          // explicitly enabled agent debug logging — bodies contain full
          // conversation content and must not hit disk by default.
          if (
            isLoggingEnabled() &&
            init?.body &&
            (!init.method || init.method.toUpperCase() === "POST")
          ) {
            const raw = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
            try { const pretty = JSON.stringify(JSON.parse(raw), null, 2); invoke("write_log_file", { filename: "api_request.txt", content: pretty }).catch(() => {}); } catch { invoke("write_log_file", { filename: "api_request.txt", content: raw }).catch(() => {}); }
          }
          return tauriFetch(input as Parameters<typeof tauriFetch>[0], init);
        }
      } catch {
        // URL parse failed — use original fetch
      }

      return originalFetch(input, init);
    }) as typeof globalThis.fetch;
  }
}

export async function appFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}
