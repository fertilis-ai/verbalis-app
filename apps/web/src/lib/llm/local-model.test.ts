import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAppFetch } = vi.hoisted(() => ({ mockAppFetch: vi.fn() }));

vi.mock("@/lib/http", () => ({ appFetch: mockAppFetch }));

import { buildLocalModel, resolveLocalModel } from "./local-model";

const json = (body: unknown, ok = true) => ({ ok, json: async () => body });

beforeEach(() => mockAppFetch.mockReset());

describe("resolveLocalModel", () => {
  it("uses the configured model without asking the server", async () => {
    expect(await resolveLocalModel("lmstudio", "http://localhost:1234", "  qwen  ")).toBe("qwen");
    expect(mockAppFetch).not.toHaveBeenCalled();
  });

  it("takes the first model from the OpenAI-style /models list", async () => {
    mockAppFetch.mockResolvedValueOnce(json({ data: [{ id: "first" }, { id: "second" }] }));
    expect(await resolveLocalModel("lmstudio", "http://localhost:1234", "")).toBe("first");
    expect(mockAppFetch).toHaveBeenCalledWith("http://localhost:1234/v1/models");
  });

  it("falls back to Ollama's /api/tags", async () => {
    mockAppFetch
      .mockResolvedValueOnce(json({}, false))
      .mockResolvedValueOnce(json({ models: [{ name: "llama3" }] }));
    expect(await resolveLocalModel("ollama", "http://localhost:11434/", undefined)).toBe("llama3");
    expect(mockAppFetch).toHaveBeenLastCalledWith("http://localhost:11434/api/tags");
  });

  it("returns null when LM Studio lists no models", async () => {
    mockAppFetch.mockResolvedValueOnce(json({ data: [] }));
    expect(await resolveLocalModel("lmstudio", "http://localhost:1234")).toBeNull();
    expect(mockAppFetch).toHaveBeenCalledTimes(1);
  });

  it("returns null when the server is unreachable", async () => {
    mockAppFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await resolveLocalModel("ollama", "http://localhost:11434")).toBeNull();
  });
});

describe("buildLocalModel", () => {
  it("builds an OpenAI-completions model on the server's /v1 base URL", () => {
    expect(buildLocalModel({ provider: "ollama", baseUrl: "http://localhost:11434", model: "llama3" })).toMatchObject({
      id: "llama3",
      name: "llama3",
      api: "openai-completions",
      provider: "ollama",
      baseUrl: "http://localhost:11434/v1",
      reasoning: false,
      contextWindow: 128000,
      maxTokens: 32000,
    });
  });
});
