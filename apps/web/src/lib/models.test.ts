import { describe, it, expect } from "vitest";
import {
  MODEL_OPTIONS,
  DEFAULT_MODEL_ID,
  LOCAL_MODEL_ID,
  PROVIDER_API_MAP,
  PROVIDER_BASE_URL_MAP,
  getActiveModels,
  type ProviderModel,
} from "./models";

describe("MODEL_OPTIONS", () => {
  it("is a non-empty array", () => {
    expect(MODEL_OPTIONS.length).toBeGreaterThan(0);
  });

  it("every model has required fields", () => {
    for (const model of MODEL_OPTIONS) {
      expect(model.id).toBeTruthy();
      expect(typeof model.id).toBe("string");
      expect(model.name).toBeTruthy();
      expect(typeof model.name).toBe("string");
      expect(model.provider).toBeTruthy();
      expect(typeof model.provider).toBe("string");
    }
  });

  it("has unique model ids", () => {
    const ids = MODEL_OPTIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes models from multiple providers", () => {
    const providers = new Set(MODEL_OPTIONS.map((m) => m.provider));
    expect(providers.size).toBeGreaterThan(1);
  });
});

describe("DEFAULT_MODEL_ID", () => {
  it("matches the first model option", () => {
    expect(DEFAULT_MODEL_ID).toBe(MODEL_OPTIONS[0].id);
  });

  it("is a valid model id", () => {
    const ids = MODEL_OPTIONS.map((m) => m.id);
    expect(ids).toContain(DEFAULT_MODEL_ID);
  });
});

describe("LOCAL_MODEL_ID", () => {
  it("equals 'local'", () => {
    expect(LOCAL_MODEL_ID).toBe("local");
  });
});

describe("PROVIDER_API_MAP", () => {
  it("maps every provider used in MODEL_OPTIONS", () => {
    const providers = new Set(MODEL_OPTIONS.map((m) => m.provider));
    for (const provider of providers) {
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

  it("falls back to MODEL_OPTIONS when given empty array", () => {
    expect(getActiveModels([])).toBe(MODEL_OPTIONS);
  });

  it("falls back to MODEL_OPTIONS when given undefined", () => {
    expect(getActiveModels(undefined)).toBe(MODEL_OPTIONS);
  });

  it("falls back to MODEL_OPTIONS when called with no arguments", () => {
    expect(getActiveModels()).toBe(MODEL_OPTIONS);
  });
});
