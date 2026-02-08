import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchProviderModels, fetchAllProviderModels } from "./provider-models";

const mockAppFetch = vi.fn();

vi.mock("@/lib/http", () => ({
  appFetch: (...args: unknown[]) => mockAppFetch(...args),
}));

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

describe("fetchProviderModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("anthropic", () => {
    it("fetches and maps Anthropic models", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          data: [
            { id: "claude-3-opus", display_name: "Claude 3 Opus" },
            { id: "claude-3-sonnet" },
          ],
        })
      );

      const result = await fetchProviderModels("anthropic", "sk-test");
      expect(result.provider).toBe("anthropic");
      expect(result.models).toHaveLength(2);
      expect(result.models[0]).toEqual({
        id: "claude-3-opus",
        name: "Claude 3 Opus",
        provider: "anthropic",
      });
      expect(result.models[1]).toEqual({
        id: "claude-3-sonnet",
        name: "claude-3-sonnet",
        provider: "anthropic",
      });
    });

    it("sends correct headers", async () => {
      mockAppFetch.mockResolvedValue(jsonResponse({ data: [] }));
      await fetchProviderModels("anthropic", "  sk-key  ");
      expect(mockAppFetch).toHaveBeenCalledWith(
        expect.stringContaining("api.anthropic.com"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-api-key": "sk-key",
            "anthropic-version": "2023-06-01",
          }),
        })
      );
    });

    it("returns error on non-OK response", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({ error: { message: "Invalid API Key" } }, false, 401)
      );
      const result = await fetchProviderModels("anthropic", "bad-key");
      expect(result.error).toContain("401");
      expect(result.error).toContain("Invalid API Key");
      expect(result.models).toEqual([]);
    });

    it("returns error on fetch exception", async () => {
      mockAppFetch.mockRejectedValue(new Error("Network error"));
      const result = await fetchProviderModels("anthropic", "sk-test");
      expect(result.error).toContain("Network error");
      expect(result.models).toEqual([]);
    });
  });

  describe("openai", () => {
    it("fetches and filters OpenAI chat models", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          data: [
            { id: "gpt-4o" },
            { id: "gpt-4o-mini" },
            { id: "dall-e-3" },
            { id: "whisper-1" },
            { id: "text-embedding-3-small" },
            { id: "gpt-4o-realtime-preview" },
            { id: "o1-preview" },
            { id: "chatgpt-4o-latest" },
          ],
        })
      );

      const result = await fetchProviderModels("openai", "sk-test");
      expect(result.provider).toBe("openai");
      const ids = result.models.map((m) => m.id);
      expect(ids).toContain("gpt-4o");
      expect(ids).toContain("gpt-4o-mini");
      expect(ids).toContain("o1-preview");
      expect(ids).toContain("chatgpt-4o-latest");
      expect(ids).not.toContain("dall-e-3");
      expect(ids).not.toContain("whisper-1");
      expect(ids).not.toContain("text-embedding-3-small");
      expect(ids).not.toContain("gpt-4o-realtime-preview");
    });

    it("excludes audio models", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          data: [
            { id: "gpt-4o-audio-preview" },
            { id: "gpt-4o" },
          ],
        })
      );
      const result = await fetchProviderModels("openai", "sk-test");
      const ids = result.models.map((m) => m.id);
      expect(ids).toContain("gpt-4o");
      expect(ids).not.toContain("gpt-4o-audio-preview");
    });

    it("sends Authorization header", async () => {
      mockAppFetch.mockResolvedValue(jsonResponse({ data: [] }));
      await fetchProviderModels("openai", " sk-key ");
      expect(mockAppFetch).toHaveBeenCalledWith(
        expect.stringContaining("api.openai.com"),
        expect.objectContaining({
          headers: { Authorization: "Bearer sk-key" },
        })
      );
    });
  });

  describe("google", () => {
    it("fetches and filters Google generateContent models", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          models: [
            {
              name: "models/gemini-1.5-pro",
              displayName: "Gemini 1.5 Pro",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embedding-001",
              displayName: "Embedding 001",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        })
      );

      const result = await fetchProviderModels("google", "key-123");
      expect(result.provider).toBe("google");
      expect(result.models).toHaveLength(1);
      expect(result.models[0]).toEqual({
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        provider: "google",
      });
    });

    it("strips models/ prefix from id", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          models: [
            {
              name: "models/gemini-2.0-flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        })
      );
      const result = await fetchProviderModels("google", "key");
      expect(result.models[0].id).toBe("gemini-2.0-flash");
    });

    it("includes API key in URL", async () => {
      mockAppFetch.mockResolvedValue(jsonResponse({ models: [] }));
      await fetchProviderModels("google", " my-key ");
      expect(mockAppFetch).toHaveBeenCalledWith(
        expect.stringContaining("key=my-key")
      );
    });
  });

  describe("openrouter", () => {
    it("fetches OpenRouter models", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          data: [
            { id: "anthropic/claude-3", name: "Claude 3" },
            { id: "meta/llama-3" },
          ],
        })
      );

      const result = await fetchProviderModels("openrouter", "or-key");
      expect(result.provider).toBe("openrouter");
      expect(result.models).toHaveLength(2);
      expect(result.models[0].name).toBe("Claude 3");
      expect(result.models[1].name).toBe("meta/llama-3");
    });

    it("works without an API key", async () => {
      mockAppFetch.mockResolvedValue(jsonResponse({ data: [] }));
      const result = await fetchProviderModels("openrouter", "");
      expect(result.provider).toBe("openrouter");
      expect(result.models).toEqual([]);
    });
  });

  describe("unknown provider", () => {
    it("returns error for unknown provider", async () => {
      const result = await fetchProviderModels("unknown-provider", "key");
      expect(result.error).toContain("Unknown provider");
      expect(result.models).toEqual([]);
    });
  });

  describe("error response parsing", () => {
    it("extracts message from JSON error body", async () => {
      mockAppFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve(JSON.stringify({ message: "Forbidden" })),
      } as unknown as Response);
      const result = await fetchProviderModels("anthropic", "key");
      expect(result.error).toContain("403");
      expect(result.error).toContain("Forbidden");
    });

    it("returns plain text error body when short", async () => {
      mockAppFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      } as unknown as Response);
      const result = await fetchProviderModels("anthropic", "key");
      expect(result.error).toContain("500");
      expect(result.error).toContain("Internal Server Error");
    });

    it("falls back to HTTP status when body is long", async () => {
      mockAppFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("x".repeat(300)),
      } as unknown as Response);
      const result = await fetchProviderModels("anthropic", "key");
      expect(result.error).toBe("HTTP 500");
    });
  });
});

describe("fetchAllProviderModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches from all providers with keys", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [], models: [] }));

    const results = await fetchAllProviderModels({
      anthropic: "ak",
      openai: "ok",
      google: "gk",
    });

    // anthropic, openai, google, plus openrouter (always included)
    expect(results).toHaveLength(4);
  });

  it("always includes openrouter even without a key", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [], models: [] }));

    const results = await fetchAllProviderModels({});
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe("openrouter");
  });

  it("skips providers with empty/whitespace keys", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [], models: [] }));

    const results = await fetchAllProviderModels({
      anthropic: "  ",
      openai: "",
      google: "gk",
    });

    // google + openrouter
    expect(results).toHaveLength(2);
    const providers = results.map((r) => r.provider);
    expect(providers).toContain("google");
    expect(providers).toContain("openrouter");
  });
});
