import { isTauri } from "@tauri-apps/api/core";

export async function appFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}
