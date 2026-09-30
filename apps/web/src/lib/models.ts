/**
 * OpenRouter's per-model reasoning capability, copied verbatim from the
 * `reasoning` object in `GET /api/v1/models`. Stored raw rather than
 * pre-normalised so the mapping in `lib/reasoning.ts` can be corrected without
 * making everyone re-run model discovery.
 */
export interface OpenRouterReasoning {
  /** Reasoning cannot be turned off for this model. */
  mandatory?: boolean;
  default_enabled?: boolean;
  supports_max_tokens?: boolean;
  /** Effort names the model accepts, e.g. ["max","high","low"]. Absent = no discrete levels. */
  supported_efforts?: string[];
  default_effort?: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  provider: string;
  /** True when at least one OpenRouter endpoint for this model is zero-data-retention. */
  zdr?: boolean;
  /** OpenRouter reasoning capability; absent for other providers and for pre-existing entries. */
  reasoning?: OpenRouterReasoning;
}

/** An OpenRouter image-generation model (from /api/v1/images/models). */
export interface ImageProviderModel {
  id: string;
  name: string;
  /** True when the model accepts image input (supports editing via reference images). */
  supportsImageInput: boolean;
  /**
   * Whether the model has a zero-data-retention OpenRouter endpoint. Absent when
   * unknown (lists cached before this field existed, or the ZDR list failed to load).
   */
  zdr?: boolean;
}

/** An OpenRouter transcription model (from /api/v1/models?output_modalities=transcription). */
export interface TranscriptionProviderModel {
  id: string;
  name: string;
  /**
   * Whether the model has a zero-data-retention OpenRouter endpoint. Absent when
   * unknown (lists cached before this field existed, or the ZDR list failed to load).
   */
  zdr?: boolean;
}

/** An OpenRouter speech (text-to-speech) model (from /api/v1/models?output_modalities=speech). */
export interface SpeechProviderModel {
  id: string;
  name: string;
  /** Model-specific voice identifiers (from supported_voices); may be empty. */
  voices: string[];
  /**
   * Whether the model has a zero-data-retention OpenRouter endpoint. Absent when
   * unknown (lists cached before this field existed, or the ZDR list failed to load).
   */
  zdr?: boolean;
}

/**
 * The image/transcription/speech model options to show for the ZDR setting.
 * Only models known to lack a ZDR endpoint (`zdr: false`) are hidden, so a list
 * with unknown flags stays usable until Refresh; requests are ZDR-routed either
 * way. The current selection is always kept so its select never renders blank.
 */
export function filterZdrModels<T extends { id: string; zdr?: boolean }>(
  models: T[],
  zdrOnly: boolean,
  selectedId: string
): T[] {
  if (!zdrOnly) return models;
  return models.filter((m) => m.zdr !== false || m.id === selectedId);
}

export type ModelId = string;
export type ModelProvider = string;

export const LOCAL_MODEL_ID = "local" as const;
export type ChatModelId = string;

/** Display names for cloud and local LLM providers */
export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  openrouter: "OpenRouter",
  lmstudio: "LM Studio",
  ollama: "Ollama",
};

/** Display name for a provider id, falling back to the id itself */
export function getProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/** Maps provider name to pi-ai API type */
export const PROVIDER_API_MAP: Record<string, string> = {
  anthropic: "anthropic-messages",
  openai: "openai-completions",
  google: "google-generative-ai",
  openrouter: "openai-completions",
};

/** Maps provider name to the base URL used for models built outside pi-ai's registry */
export const PROVIDER_BASE_URL_MAP: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  // Same value as OPENROUTER_BASE_URL; not imported so this module stays dependency-free.
  openrouter: "https://openrouter.ai/api/v1",
};

/**
 * Returns the user's selected models. An empty selection means exactly that —
 * no models. This deliberately has no built-in fallback catalog: seeding one
 * made the settings and chat pickers list models the user never chose, which
 * reads as configured when nothing is. Models come from discovery only.
 */
export function getActiveModels(selectedModels?: ProviderModel[]): ProviderModel[] {
  return selectedModels ?? [];
}
