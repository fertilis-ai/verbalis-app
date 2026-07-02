export interface ProviderModel {
  id: string;
  name: string;
  provider: string;
}

/** An OpenRouter image-generation model (from /api/v1/images/models). */
export interface ImageProviderModel {
  id: string;
  name: string;
  /** True when the model accepts image input (supports editing via reference images). */
  supportsImageInput: boolean;
}

/** An OpenRouter transcription model (from /api/v1/models?output_modalities=transcription). */
export interface TranscriptionProviderModel {
  id: string;
  name: string;
}

/** An OpenRouter speech (text-to-speech) model (from /api/v1/models?output_modalities=speech). */
export interface SpeechProviderModel {
  id: string;
  name: string;
  /** Model-specific voice identifiers (from supported_voices); may be empty. */
  voices: string[];
}

export const MODEL_OPTIONS: ProviderModel[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "anthropic" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "google" },
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "openrouter" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "openrouter" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", provider: "openrouter" },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", provider: "openrouter" },
];

export type ModelId = string;
export type ModelProvider = string;

export const DEFAULT_MODEL_ID: ModelId = MODEL_OPTIONS[0].id;
export const LOCAL_MODEL_ID = "local" as const;
export type ChatModelId = string;

/** Maps provider name to pi-ai API type */
export const PROVIDER_API_MAP: Record<string, string> = {
  anthropic: "anthropic-messages",
  openai: "openai-completions",
  google: "google-generative-ai",
  openrouter: "openai-completions",
};

/** Maps provider name to base URL (only needed for providers that don't use the default) */
export const PROVIDER_BASE_URL_MAP: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
};

/**
 * Returns the active model list from the given selectedModels array,
 * falling back to MODEL_OPTIONS if empty.
 */
export function getActiveModels(selectedModels?: ProviderModel[]): ProviderModel[] {
  if (selectedModels && selectedModels.length > 0) return selectedModels;
  return MODEL_OPTIONS;
}
