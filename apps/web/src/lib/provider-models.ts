import { appFetch } from "@/lib/http";
import type { ImageProviderModel, ProviderModel, TranscriptionProviderModel } from "@/lib/models";

export interface FetchModelsResult {
  provider: string;
  models: ProviderModel[];
  error?: string;
}

/** Prefixes that indicate an OpenAI chat model */
const OPENAI_CHAT_PREFIXES = ["gpt-", "o1-", "o3-", "o4-", "chatgpt-"];
/** Substrings that indicate a non-chat OpenAI model */
const OPENAI_EXCLUDE_PATTERNS = ["-realtime-", "-audio-", "-search-"];
const OPENAI_EXCLUDE_PREFIXES = ["embedding", "whisper", "tts", "dall-e", "moderation", "text-embedding"];

function isOpenAiChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (OPENAI_EXCLUDE_PATTERNS.some((p) => lower.includes(p))) return false;
  if (OPENAI_EXCLUDE_PREFIXES.some((p) => lower.startsWith(p))) return false;
  return OPENAI_CHAT_PREFIXES.some((p) => lower.startsWith(p));
}

/** Read error detail from a non-OK response */
async function readErrorBody(resp: Response): Promise<string> {
  try {
    const body = await resp.text();
    // Try to extract a message from JSON error responses
    try {
      const json = JSON.parse(body) as { error?: { message?: string }; message?: string };
      const msg = json.error?.message ?? json.message;
      if (msg) return `HTTP ${resp.status}: ${msg}`;
    } catch {
      // not JSON
    }
    if (body.length > 0 && body.length < 200) return `HTTP ${resp.status}: ${body}`;
  } catch {
    // couldn't read body
  }
  return `HTTP ${resp.status}`;
}

async function fetchAnthropic(apiKey: string): Promise<FetchModelsResult> {
  try {
    const resp = await appFetch("https://api.anthropic.com/v1/models?limit=1000", {
      headers: {
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    if (!resp.ok) return { provider: "anthropic", models: [], error: await readErrorBody(resp) };
    const data = (await resp.json()) as { data?: Array<{ id: string; display_name?: string }> };
    const models: ProviderModel[] = (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.display_name ?? m.id,
      provider: "anthropic",
    }));
    return { provider: "anthropic", models };
  } catch (e) {
    return { provider: "anthropic", models: [], error: String(e) };
  }
}

async function fetchOpenAI(apiKey: string): Promise<FetchModelsResult> {
  try {
    const resp = await appFetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (!resp.ok) return { provider: "openai", models: [], error: await readErrorBody(resp) };
    const data = (await resp.json()) as { data?: Array<{ id: string }> };
    const models: ProviderModel[] = (data.data ?? [])
      .filter((m) => isOpenAiChatModel(m.id))
      .map((m) => ({ id: m.id, name: m.id, provider: "openai" }));
    return { provider: "openai", models };
  } catch (e) {
    return { provider: "openai", models: [], error: String(e) };
  }
}

async function fetchGoogle(apiKey: string): Promise<FetchModelsResult> {
  try {
    const resp = await appFetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}&pageSize=1000`
    );
    if (!resp.ok) return { provider: "google", models: [], error: await readErrorBody(resp) };
    const data = (await resp.json()) as {
      models?: Array<{
        name: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const models: ProviderModel[] = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({
        id: m.name.replace(/^models\//, ""),
        name: m.displayName ?? m.name.replace(/^models\//, ""),
        provider: "google",
      }));
    return { provider: "google", models };
  } catch (e) {
    return { provider: "google", models: [], error: String(e) };
  }
}

async function fetchOpenRouter(apiKey?: string): Promise<FetchModelsResult> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
    const resp = await appFetch("https://openrouter.ai/api/v1/models", { headers });
    if (!resp.ok) return { provider: "openrouter", models: [], error: await readErrorBody(resp) };
    const data = (await resp.json()) as { data?: Array<{ id: string; name?: string }> };
    const models: ProviderModel[] = (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      provider: "openrouter",
    }));
    return { provider: "openrouter", models };
  } catch (e) {
    return { provider: "openrouter", models: [], error: String(e) };
  }
}

export interface FetchImageModelsResult {
  models: ImageProviderModel[];
  error?: string;
}

/** Fetch image-generation models from OpenRouter's dedicated Image API. */
export async function fetchOpenRouterImageModels(apiKey?: string): Promise<FetchImageModelsResult> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
    const resp = await appFetch("https://openrouter.ai/api/v1/images/models", { headers });
    if (!resp.ok) return { models: [], error: await readErrorBody(resp) };
    const data = (await resp.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        architecture?: { input_modalities?: string[]; output_modalities?: string[] };
      }>;
    };
    const models: ImageProviderModel[] = (data.data ?? [])
      .filter((m) => m.architecture?.output_modalities?.includes("image") ?? true)
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        supportsImageInput: m.architecture?.input_modalities?.includes("image") ?? false,
      }));
    return { models };
  } catch (e) {
    return { models: [], error: String(e) };
  }
}

export interface FetchTranscriptionModelsResult {
  models: TranscriptionProviderModel[];
  error?: string;
}

/** Fetch transcription-capable (speech-to-text) models from OpenRouter. */
export async function fetchOpenRouterTranscriptionModels(
  apiKey?: string
): Promise<FetchTranscriptionModelsResult> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
    const resp = await appFetch(
      "https://openrouter.ai/api/v1/models?output_modalities=transcription",
      { headers }
    );
    if (!resp.ok) return { models: [], error: await readErrorBody(resp) };
    const data = (await resp.json()) as { data?: Array<{ id: string; name?: string }> };
    const models: TranscriptionProviderModel[] = (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
    }));
    return { models };
  } catch (e) {
    return { models: [], error: String(e) };
  }
}

export async function fetchProviderModels(
  provider: string,
  apiKey: string
): Promise<FetchModelsResult> {
  switch (provider) {
    case "anthropic":
      return fetchAnthropic(apiKey);
    case "openai":
      return fetchOpenAI(apiKey);
    case "google":
      return fetchGoogle(apiKey);
    case "openrouter":
      return fetchOpenRouter(apiKey || undefined);
    default:
      return { provider, models: [], error: `Unknown provider: ${provider}` };
  }
}

export async function fetchAllProviderModels(
  apiKeys: Record<string, string>
): Promise<FetchModelsResult[]> {
  const providers = ["anthropic", "openai", "google", "openrouter"] as const;
  const promises = providers
    .filter((p) => p === "openrouter" || apiKeys[p]?.trim())
    .map((p) => fetchProviderModels(p, apiKeys[p] ?? ""));
  return Promise.all(promises);
}
