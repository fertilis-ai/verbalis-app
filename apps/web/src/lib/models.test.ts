import { describe, it, expect } from "vitest";
import {
  LOCAL_MODEL_ID,
  PROVIDER_API_MAP,
  PROVIDER_BASE_URL_MAP,
  filterZdrModels,
  getActiveModels,
  getProviderLabel,
  type ProviderModel,
} from "./models";

describe("LOCAL_MODEL_ID", () => {
  it("equals 'local'", () => {
    expect(LOCAL_MODEL_ID).toBe("local");
  });
});

describe("PROVIDER_API_MAP", () => {
  it("maps every provider models can be discovered from", () => {
    for (const provider of ["anthropic", "openai", "google", "openrouter"]) {
      expect(PROVIDER_API_MAP[provider]).toBeTruthy();
    }
  });

  it("maps anthropic to anthropic-messages", () => {
    expect(PROVIDER_API_MAP.anthropic).toBe("anthropic-messages");
  });

  it("maps openai to openai-completions", () => {
    expect(PROVIDER_API_MAP.openai).toBe("openai-completions");
  });

  it("maps google to google-generative-ai", () => {
    expect(PROVIDER_API_MAP.google).toBe("google-generative-ai");
  });

  it("maps openrouter to openai-completions", () => {
    expect(PROVIDER_API_MAP.openrouter).toBe("openai-completions");
  });
});

describe("PROVIDER_BASE_URL_MAP", () => {
  it("has an openrouter entry", () => {
    expect(PROVIDER_BASE_URL_MAP.openrouter).toBeTruthy();
  });

  it("openrouter URL is a valid HTTPS URL", () => {
    expect(PROVIDER_BASE_URL_MAP.openrouter).toMatch(/^https:\/\//);
  });
});

describe("getActiveModels", () => {
  it("returns provided models when array is non-empty", () => {
    const custom: ProviderModel[] = [
      { id: "custom-1", name: "Custom", provider: "test" },
    ];
    expect(getActiveModels(custom)).toBe(custom);
  });

  it("returns nothing for an empty selection — never the MODEL_OPTIONS seeds", () => {
    expect(getActiveModels([])).toEqual([]);
  });

  it("returns nothing when given undefined", () => {
    expect(getActiveModels(undefined)).toEqual([]);
  });

  it("returns nothing when called with no arguments", () => {
    expect(getActiveModels()).toEqual([]);
  });
});

describe("getProviderLabel", () => {
  it("returns display names for known providers", () => {
    expect(getProviderLabel("openai")).toBe("OpenAI");
    expect(getProviderLabel("openrouter")).toBe("OpenRouter");
    expect(getProviderLabel("lmstudio")).toBe("LM Studio");
  });

  it("falls back to the provider id", () => {
    expect(getProviderLabel("mistral")).toBe("mistral");
  });
});

describe("filterZdrModels", () => {
  const models = [
    { id: "zdr", zdr: true },
    { id: "retains", zdr: false },
    { id: "unknown" },
  ];

  it("returns every model when ZDR-only is off", () => {
    expect(filterZdrModels(models, false, "")).toEqual(models);
  });

  it("hides only models known to lack a ZDR endpoint", () => {
    expect(filterZdrModels(models, true, "").map((m) => m.id)).toEqual(["zdr", "unknown"]);
  });

  it("keeps the current selection even without ZDR", () => {
    expect(filterZdrModels(models, true, "retains").map((m) => m.id)).toEqual([
      "zdr",
      "retains",
      "unknown",
    ]);
  });
});
