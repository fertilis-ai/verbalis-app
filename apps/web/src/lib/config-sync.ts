/**
 * Config Sync
 *
 * Subscribes to the Zustand settings store and writes changes to ~/.sapio/config.yaml (debounced).
 * On startup, loads from config.yaml to hydrate the store.
 * In browser mode, this module is a no-op.
 */

import YAML from "yaml";
import { isTauri, readFile, writeFile, pathExists, getAppDataDir } from "@/lib/storage";
import { useSettingsStore } from "@/stores/settings-store";
import { setLoggingEnabled } from "@/lib/logger";
import type { HueId } from "@/lib/hue-presets";
import type { ChatModelId } from "@/lib/models";
import type { GuardrailsConfig } from "@/lib/guardrails/types";
import type { UserMode, Theme, LocalLlmProvider } from "@/stores/settings-store";

/** The subset of settings state persisted to config.yaml */
interface ConfigYaml {
  theme: Theme;
  hue: HueId;
  workingDirectory: string;
  settingsDirectory: string;
  userMode: UserMode;
  apiKeys: {
    anthropic: string;
    openai: string;
    google: string;
  };
  localLLM: {
    enabled: boolean;
    provider: LocalLlmProvider;
    baseUrl: string;
    model: string;
  };
  defaultModel: ChatModelId;
  guardrailsConfig: GuardrailsConfig;
  agentDebugLogging: boolean;
}

/** Pick persistable fields from the store */
function extractConfigFromStore(): ConfigYaml {
  const s = useSettingsStore.getState();
  return {
    theme: s.theme,
    hue: s.hue,
    workingDirectory: s.workingDirectory,
    settingsDirectory: s.settingsDirectory,
    userMode: s.userMode,
    apiKeys: { ...s.apiKeys },
    localLLM: { ...s.localLLM },
    defaultModel: s.defaultModel,
    guardrailsConfig: s.guardrailsConfig,
    agentDebugLogging: s.agentDebugLogging,
  };
}

async function getConfigPath(): Promise<string> {
  const dir = await getAppDataDir();
  return `${dir}/config.yaml`;
}

async function writeConfigToFile(): Promise<void> {
  const config = extractConfigFromStore();
  const yaml = YAML.stringify(config);
  const configPath = await getConfigPath();
  await writeFile(configPath, yaml);
  lastKnownContent = yaml;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastKnownContent: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let isPatchingFromFile = false;

function debouncedWriteConfig(): void {
  if (isPatchingFromFile) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    writeConfigToFile().catch((err) => {
      console.warn("[config-sync] Failed to write config.yaml:", err);
    });
  }, 500);
}

async function loadConfigFromFile(providedContent?: string): Promise<void> {
  const configPath = await getConfigPath();

  if (!(await pathExists(configPath))) {
    // No config file yet — write current store state as initial config
    await writeConfigToFile();
    return;
  }

  try {
    const content = providedContent ?? (await readFile(configPath));
    const parsed = YAML.parse(content) as Partial<ConfigYaml>;
    if (!parsed || typeof parsed !== "object") return;

    isPatchingFromFile = true;
    try {
      const store = useSettingsStore.getState();

      // Patch store field-by-field (only set fields that exist in the file)
      if (parsed.theme !== undefined) store.setTheme(parsed.theme);
      if (parsed.hue !== undefined) store.setHue(parsed.hue);
      if (parsed.workingDirectory !== undefined) store.setWorkingDirectory(parsed.workingDirectory);
      if (parsed.settingsDirectory !== undefined) store.setSettingsDirectory(parsed.settingsDirectory);
      if (parsed.userMode !== undefined) store.setUserMode(parsed.userMode);
      if (parsed.apiKeys !== undefined) {
        if (parsed.apiKeys.anthropic !== undefined) store.setApiKey("anthropic", parsed.apiKeys.anthropic);
        if (parsed.apiKeys.openai !== undefined) store.setApiKey("openai", parsed.apiKeys.openai);
        if (parsed.apiKeys.google !== undefined) store.setApiKey("google", parsed.apiKeys.google);
      }
      if (parsed.localLLM !== undefined) store.setLocalLLM(parsed.localLLM);
      if (parsed.defaultModel !== undefined) store.setDefaultModel(parsed.defaultModel);
      if (parsed.guardrailsConfig !== undefined) {
        store.setGuardrailsConfig(parsed.guardrailsConfig);
        // Re-sync legacy derived fields
        const gc = parsed.guardrailsConfig;
        if (gc.enabled !== undefined) store.setGuardrails(gc.enabled);
        if (gc.sandbox?.enabled !== undefined) store.setSandboxed(gc.sandbox.enabled);
        store.setYolo(gc.enabled === false);
      }
      if (parsed.agentDebugLogging !== undefined) {
        store.setAgentDebugLogging(parsed.agentDebugLogging);
        setLoggingEnabled(parsed.agentDebugLogging);
      }

      lastKnownContent = content;
    } finally {
      isPatchingFromFile = false;
    }
  } catch (err) {
    console.warn("[config-sync] Failed to parse config.yaml, using defaults:", err);
  }
}

async function pollForFileChanges(): Promise<void> {
  try {
    const configPath = await getConfigPath();
    if (!(await pathExists(configPath))) return;
    const content = await readFile(configPath);
    if (content !== lastKnownContent) {
      await loadConfigFromFile(content);
    }
  } catch {
    // File might be mid-write by external editor; next poll catches it
  }
}

let unsubscribe: (() => void) | null = null;

/**
 * Initialize config sync.
 * - In browser mode: no-op.
 * - In Tauri mode: loads config.yaml into store, then subscribes to store changes.
 */
export async function initConfigSync(): Promise<void> {
  if (!isTauri()) return;

  await loadConfigFromFile();

  // Subscribe to store changes — write config.yaml on every change (debounced)
  unsubscribe = useSettingsStore.subscribe(debouncedWriteConfig);

  // Poll for external changes to config.yaml every 2s
  pollTimer = setInterval(() => {
    pollForFileChanges();
  }, 2000);
}

/** Tear down the subscription and polling (useful for testing) */
export function stopConfigSync(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  lastKnownContent = null;
  isPatchingFromFile = false;
}
