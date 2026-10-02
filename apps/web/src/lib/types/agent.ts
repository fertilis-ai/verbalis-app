export interface Agent {
  name: string;
  /** Optional model override. Undefined = the app's selected model. */
  model?: string;
  temperature: number;
  systemPrompt: string;
  /** Optional per-agent tool allowlist (tool names). Undefined = all tools. */
  tools?: string[];
}
