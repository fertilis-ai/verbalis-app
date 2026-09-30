import { appFetch } from "@/lib/http";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Auth header for OpenRouter; empty when there is no key (model listing works unauthenticated). */
export function openRouterHeaders(apiKey?: string): Record<string, string> {
  const key = apiKey?.trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/**
 * Add OpenRouter's `provider` preference to a request body: with `zdr`, the
 * request routes only to Zero Data Retention endpoints (and fails with
 * no-endpoints rather than falling back to one that retains data).
 */
export function withZdr<T extends object>(body: T, zdr: boolean | undefined): T {
  return zdr ? { ...body, provider: { zdr: true } } : body;
}

/**
 * pi-ai `compat` settings for OpenRouter chat models. With `zdr`, pi-ai sends
 * the same Zero Data Retention routing preference as `withZdr`.
 */
export function openRouterCompat(zdr: boolean) {
  return {
    supportsStore: false,
    supportsDeveloperRole: false,
    ...(zdr ? { openRouterRouting: { zdr: true } } : {}),
  };
}

/**
 * Call an OpenRouter API path (relative to OPENROUTER_BASE_URL). A `body` makes
 * it a JSON POST, with `zdr` applied; otherwise it is a GET. Returns the raw
 * response — callers decide how to handle a non-OK status.
 */
export function openRouterFetch(
  path: string,
  opts: { apiKey?: string; zdr?: boolean; body?: object; signal?: AbortSignal } = {}
): Promise<Response> {
  const headers = openRouterHeaders(opts.apiKey);
  const init: RequestInit = opts.body
    ? {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(withZdr(opts.body, opts.zdr)),
      }
    : { headers };
  if (opts.signal) init.signal = opts.signal;
  return appFetch(`${OPENROUTER_BASE_URL}${path}`, init);
}
