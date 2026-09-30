import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OPENROUTER_BASE_URL,
  openRouterCompat,
  openRouterFetch,
  openRouterHeaders,
  withZdr,
} from "./openrouter";

const mockAppFetch = vi.fn();

vi.mock("@/lib/http", () => ({
  appFetch: (...args: unknown[]) => mockAppFetch(...args),
}));

describe("openRouterHeaders", () => {
  it("returns a trimmed bearer token", () => {
    expect(openRouterHeaders(" sk-or-key ")).toEqual({ Authorization: "Bearer sk-or-key" });
  });

  it("returns no headers without a key", () => {
    expect(openRouterHeaders()).toEqual({});
    expect(openRouterHeaders("   ")).toEqual({});
  });
});

describe("withZdr", () => {
  it("adds the ZDR provider preference when enabled", () => {
    expect(withZdr({ model: "m" }, true)).toEqual({ model: "m", provider: { zdr: true } });
  });

  it("leaves the body untouched when disabled", () => {
    expect(withZdr({ model: "m" }, false)).toEqual({ model: "m" });
    expect(withZdr({ model: "m" }, undefined)).toEqual({ model: "m" });
  });
});

describe("openRouterCompat", () => {
  it("sets ZDR routing only when enabled", () => {
    expect(openRouterCompat(true).openRouterRouting).toEqual({ zdr: true });
    expect(openRouterCompat(false)).not.toHaveProperty("openRouterRouting");
  });
});

describe("openRouterFetch", () => {
  beforeEach(() => {
    mockAppFetch.mockReset();
    mockAppFetch.mockResolvedValue(new Response("{}"));
  });

  it("sends a GET with only the auth header when there is no body", async () => {
    await openRouterFetch("/models", { apiKey: "k" });
    expect(mockAppFetch).toHaveBeenCalledWith(`${OPENROUTER_BASE_URL}/models`, {
      headers: { Authorization: "Bearer k" },
    });
  });

  it("sends an unauthenticated GET without a key", async () => {
    await openRouterFetch("/models");
    expect(mockAppFetch).toHaveBeenCalledWith(`${OPENROUTER_BASE_URL}/models`, { headers: {} });
  });

  it("sends a JSON POST with ZDR applied to the body", async () => {
    const signal = new AbortController().signal;
    await openRouterFetch("/images", { apiKey: "k", zdr: true, body: { model: "m" }, signal });
    const [url, init] = mockAppFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${OPENROUTER_BASE_URL}/images`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer k", "Content-Type": "application/json" });
    expect(init.signal).toBe(signal);
    expect(JSON.parse(init.body as string)).toEqual({ model: "m", provider: { zdr: true } });
  });

  it("returns non-OK responses without throwing", async () => {
    mockAppFetch.mockResolvedValue(new Response("nope", { status: 401 }));
    const resp = await openRouterFetch("/models");
    expect(resp.status).toBe(401);
  });
});
