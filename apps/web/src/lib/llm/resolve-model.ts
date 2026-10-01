import { getModel, type Api, type Model } from "@earendil-works/pi-ai";
import { getActiveModels, PROVIDER_API_MAP, PROVIDER_BASE_URL_MAP, type ProviderModel } from "@/lib/models";
import { getEffortCapability, type EffortCapability } from "@/lib/reasoning";
import { openRouterCompat, openRouterHeaders } from "@/lib/openrouter";

export interface ResolvedModel {
  modelObj: Model<Api>;
  provider: string;
  apiKey: string;
  capability: EffortCapability | null;
}

/**
 * pi-ai's registry lookup. `getModel` is typed against literal provider/id
 * unions, but ids here come from settings at runtime, and an unknown pair
 * returns `undefined`.
 */
function lookupRegistryModel(provider: string, modelId: string): Model<Api> | undefined {
  return (getModel as (provider: string, modelId: string) => Model<Api> | undefined)(provider, modelId);
}

/** Resolve a model ID to its pi-ai Model object, provider, and API key. */
export function resolveModelObject(
  modelId: string,
  apiKeys: Record<string, string>,
  selectedModels?: ProviderModel[],
  zdr = false
): ResolvedModel | null {
  const active = getActiveModels(selectedModels);
  const entry = active.find((m) => m.id === modelId);
  if (!entry) return null;

  const apiKey = apiKeys[entry.provider];
  if (!apiKey) return null;

  // Reasoning comes from OpenRouter's per-model metadata and nothing else, and
  // is always stamped onto the model — in both directions.
  //
  // Stamping the positive case is what makes the request carry the effort at
  // all: pi-ai's OpenRouter branch is gated on `model.reasoning`, so a model
  // built with `reasoning: false` drops the option however the picker looked.
  //
  // Overwriting the negative case matters just as much. pi-ai's registry marks
  // 167 OpenRouter ids `reasoning: true` with a map of its own; for a model that
  // exposes no discrete levels (93 live ids, 21 of them `mandatory`) that branch
  // takes its `else` and sends `reasoning: { effort: "none" }`, silently
  // disabling reasoning on a model the user got no picker for. `reasoning:
  // false` sends no reasoning parameter instead, leaving the provider default.
  // Thinking output is unaffected — pi-ai parses it without consulting this flag.
  const capability = getEffortCapability(entry);
  const reasoningFields = capability
    ? { reasoning: true as const, thinkingLevelMap: capability.thinkingLevelMap }
    : { reasoning: false as const, thinkingLevelMap: undefined };

  // Try pi-ai's getModel() first (gives full config with cost/context data)
  const registryModel = lookupRegistryModel(entry.provider, modelId);
  if (registryModel) {
    // OpenRouter needs explicit auth header (Tauri fetch may strip SDK-managed auth on redirect)
    if (entry.provider === "openrouter") {
      return {
        modelObj: {
          ...registryModel,
          ...reasoningFields,
          headers: { ...registryModel.headers, ...openRouterHeaders(apiKey) },
          compat: openRouterCompat(zdr),
        },
        provider: entry.provider,
        apiKey,
        capability,
      };
    }
    return { modelObj: registryModel, provider: entry.provider, apiKey, capability };
  }

  const api = PROVIDER_API_MAP[entry.provider];
  if (!api) return null;

  const baseUrl = PROVIDER_BASE_URL_MAP[entry.provider] ?? "";
  const modelObj: Model<Api> = {
    id: modelId,
    name: entry.name,
    api: api as Api,
    provider: entry.provider,
    baseUrl,
    ...reasoningFields,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };

  // Add explicit auth header for OpenRouter (Tauri fetch may strip SDK-managed auth on redirect)
  if (entry.provider === "openrouter") {
    modelObj.headers = openRouterHeaders(apiKey);
    modelObj.compat = openRouterCompat(zdr);
  }

  return { modelObj, provider: entry.provider, apiKey, capability };
}

/** The message shown in place of a reply when `resolveModelObject` returns null. */
export function unresolvedModelMessage(modelId: string, selectedModels?: ProviderModel[]): string {
  const entry = getActiveModels(selectedModels).find((m) => m.id === modelId);
  if (entry) return `Please configure a ${entry.provider} API key in Settings to use the chat.`;
  return modelId
    ? `Unknown model: ${modelId}. Please select a valid model in Settings.`
    : "No model selected. Choose one under Settings → Models.";
}
