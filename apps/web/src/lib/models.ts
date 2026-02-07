export const MODEL_OPTIONS = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "anthropic" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "google" },
] as const;

export type ModelOption = (typeof MODEL_OPTIONS)[number];
export type ModelId = ModelOption["id"];
export type ModelProvider = ModelOption["provider"];

export const DEFAULT_MODEL_ID: ModelId = MODEL_OPTIONS[0].id;
export const LOCAL_MODEL_ID = "local" as const;
export type ChatModelId = ModelId | typeof LOCAL_MODEL_ID;
