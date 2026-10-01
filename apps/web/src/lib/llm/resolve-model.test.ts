import { describe, it, expect } from "vitest";
import { getModel } from "@earendil-works/pi-ai";
import type { ProviderModel } from "@/lib/models";
import { openRouterCompat } from "@/lib/openrouter";
import { resolveModelObject, unresolvedModelMessage } from "./resolve-model";

const REGISTRY_ID = "claude-sonnet-4-20250514";
const anthropic: ProviderModel = { id: REGISTRY_ID, name: "Claude Sonnet 4", provider: "anthropic" };
const custom: ProviderModel = { id: "vendor/not-in-registry", name: "Custom", provider: "openrouter" };
const keys = { anthropic: "sk-ant", openrouter: "sk-or" };

describe("resolveModelObject", () => {
  it("returns null for a model that isn't selected", () => {
    expect(resolveModelObject("nope", keys, [anthropic])).toBeNull();
  });

  it("returns null without an API key for the model's provider", () => {
    expect(resolveModelObject(REGISTRY_ID, { openrouter: "sk-or" }, [anthropic])).toBeNull();
  });

  it("uses pi-ai's registry model as is for non-OpenRouter providers", () => {
    const resolved = resolveModelObject(REGISTRY_ID, keys, [anthropic]);
    expect(resolved?.modelObj).toBe(getModel("anthropic", REGISTRY_ID));
    expect(resolved).toMatchObject({ provider: "anthropic", apiKey: "sk-ant", capability: null });
  });

  it("builds an OpenRouter model outside the registry with auth, routing and no reasoning", () => {
    const resolved = resolveModelObject(custom.id, keys, [custom], true);
    expect(resolved?.modelObj).toMatchObject({
      id: custom.id,
      name: "Custom",
      api: "openai-completions",
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      reasoning: false,
      headers: { Authorization: "Bearer sk-or" },
      compat: openRouterCompat(true),
    });
    expect(resolved?.modelObj.thinkingLevelMap).toBeUndefined();
  });

  it("stamps reasoning and the level map from OpenRouter's effort metadata", () => {
    const reasoner = { ...custom, reasoning: { supported_efforts: ["low", "high"] } };
    const resolved = resolveModelObject(custom.id, keys, [reasoner]);
    expect(resolved?.capability).not.toBeNull();
    expect(resolved?.modelObj.reasoning).toBe(true);
    expect(resolved?.modelObj.thinkingLevelMap).toEqual(resolved?.capability?.thinkingLevelMap);
  });

  it("returns null for a provider with no API mapping outside the registry", () => {
    const unknown: ProviderModel = { id: "x", name: "X", provider: "mystery" };
    expect(resolveModelObject("x", { mystery: "k" }, [unknown])).toBeNull();
  });
});

describe("unresolvedModelMessage", () => {
  it("asks for an API key when the model is selected", () => {
    expect(unresolvedModelMessage(REGISTRY_ID, [anthropic])).toBe(
      "Please configure a anthropic API key in Settings to use the chat."
    );
  });

  it("names an unknown model", () => {
    expect(unresolvedModelMessage("gone", [anthropic])).toBe(
      "Unknown model: gone. Please select a valid model in Settings."
    );
  });

  it("points to settings when no model is selected", () => {
    expect(unresolvedModelMessage("", [])).toBe("No model selected. Choose one under Settings → Models.");
  });
});
