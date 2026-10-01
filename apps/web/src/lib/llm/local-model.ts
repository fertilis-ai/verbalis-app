import type { Model } from "@earendil-works/pi-ai";
import { appFetch } from "@/lib/http";
import { normalizeBaseUrl, buildOpenAiBaseUrl, buildOpenAiUrl } from "@/lib/url-utils";
import type { LocalLlmProvider } from "@/stores/settings-store";

/**
 * The model id to use on a local server: the configured one if set, otherwise
 * the first model the server lists (OpenAI-style `/models`, then Ollama's
 * `/api/tags`). Null when none can be found.
 */
export async function resolveLocalModel(provider: LocalLlmProvider, baseUrl: string, fallback?: string) {
  if (fallback?.trim()) return fallback.trim();
  try {
    const url = buildOpenAiUrl(baseUrl, "/models");
    const response = await appFetch(url);
    if (response.ok) {
      const data = (await response.json()) as { data?: Array<{ id?: string }> };
      const modelId = data?.data?.[0]?.id ?? null;
      if (modelId) return modelId;
    }
    if (provider === "ollama") {
      const ollamaUrl = `${normalizeBaseUrl(baseUrl)}/api/tags`;
      const ollamaResponse = await appFetch(ollamaUrl);
      if (!ollamaResponse.ok) return null;
      const data = (await ollamaResponse.json()) as { models?: Array<{ name?: string }> };
      return data?.models?.[0]?.name ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/** A pi-ai model for a local OpenAI-compatible server. */
export function buildLocalModel(params: { provider: LocalLlmProvider; baseUrl: string; model: string }): Model<"openai-completions"> {
  const baseUrl = buildOpenAiBaseUrl(params.baseUrl);
  return {
    id: params.model,
    name: params.model,
    api: "openai-completions",
    provider: params.provider,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
  };
}
