import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_MODEL_ID, type ChatModelId, type ProviderModel } from "@/lib/models";
import { fetchAllProviderModels } from "@/lib/provider-models";
import type { GuardrailsConfig } from "@/lib/guardrails/types";
import { DEFAULT_GUARDRAILS_CONFIG } from "@/lib/guardrails/types";
import { getPresetConfig, type UserModePreset } from "@/lib/guardrails/presets";
import { setLoggingEnabled } from "@/lib/logger";
import { storeApiKey } from "@/lib/keychain";
import { isTauri } from "@tauri-apps/api/core";
import type { HueId } from "@/lib/hue-presets";

export type Theme = "system" | "light" | "dark";
export type UserMode = "normal" | "advanced";
export type LocalLlmProvider = "lmstudio" | "ollama";

interface SettingsState {
  theme: Theme;
  hue: HueId;
  homeDir: string;
  workingDirectory: string;
  settingsDirectory: string;
  userMode: UserMode;
  yolo: boolean;
  sandboxed: boolean;
  guardrails: boolean;
  apiKeys: {
    anthropic: string;
    openai: string;
    google: string;
    openrouter: string;
  };
  localLLM: {
    enabled: boolean;
    provider: LocalLlmProvider;
    baseUrl: string;
    model: string;
  };
  defaultModel: ChatModelId;

  // Model discovery
  availableModels: ProviderModel[];
  selectedModels: ProviderModel[];
  modelFetchStatus: "idle" | "fetching" | "done" | "error";
  modelFetchError: string | null;

  // Enhanced guardrails configuration
  guardrailsConfig: GuardrailsConfig;

  // Debug settings
  agentDebugLogging: boolean;

  setTheme: (theme: Theme) => void;
  setHue: (hue: HueId) => void;
  setHomeDir: (dir: string) => void;
  setWorkingDirectory: (dir: string) => void;
  setSettingsDirectory: (dir: string) => void;
  setUserMode: (mode: UserMode) => void;
  setYolo: (yolo: boolean) => void;
  setSandboxed: (sandboxed: boolean) => void;
  setGuardrails: (guardrails: boolean) => void;
  setApiKey: (provider: "anthropic" | "openai" | "google" | "openrouter", key: string) => void;
  setLocalLLM: (updates: Partial<SettingsState["localLLM"]>) => void;
  setDefaultModel: (model: ChatModelId) => void;
  setAgentDebugLogging: (enabled: boolean) => void;

  // Model discovery actions
  setAvailableModels: (models: ProviderModel[]) => void;
  setSelectedModels: (models: ProviderModel[]) => void;
  addSelectedModels: (models: ProviderModel[]) => void;
  removeSelectedModels: (modelIds: string[]) => void;
  fetchModels: () => Promise<void>;

  // Guardrails config actions
  setGuardrailsConfig: (config: Partial<GuardrailsConfig>) => void;
  resetGuardrailsToDefaults: () => void;
  applyGuardrailsPreset: (preset: UserModePreset) => void;
  importGuardrailsConfig: (json: string) => boolean;
  exportGuardrailsConfig: () => string;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      hue: "neutral",
      homeDir: "",
      workingDirectory: "",
      settingsDirectory: "",
      userMode: "normal",
      yolo: false,
      sandboxed: true,
      guardrails: true,
      apiKeys: {
        anthropic: "",
        openai: "",
        google: "",
        openrouter: "",
      },
      localLLM: {
        enabled: false,
        provider: "lmstudio",
        baseUrl: "http://localhost:1234/v1",
        model: "",
      },
      defaultModel: DEFAULT_MODEL_ID,
      availableModels: [],
      selectedModels: [],
      modelFetchStatus: "idle" as const,
      modelFetchError: null,
      guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
      agentDebugLogging: false,

      setTheme: (theme) => set({ theme }),
      setHue: (hue) => set({ hue }),
      setHomeDir: (homeDir) => set({ homeDir }),
      setWorkingDirectory: (workingDirectory) => set({ workingDirectory }),
      setSettingsDirectory: (settingsDirectory) => set({ settingsDirectory }),
      setUserMode: (userMode) => set({ userMode }),
      setYolo: (yolo) => {
        set({ yolo });
        // Sync with guardrails config
        if (yolo) {
          set((state) => ({
            guardrailsConfig: { ...state.guardrailsConfig, enabled: false },
          }));
        }
      },
      setSandboxed: (sandboxed) => {
        set({ sandboxed });
        // Sync with guardrails config
        set((state) => ({
          guardrailsConfig: {
            ...state.guardrailsConfig,
            sandbox: { ...state.guardrailsConfig.sandbox, enabled: sandboxed },
          },
        }));
      },
      setGuardrails: (guardrails) => {
        set({ guardrails });
        // Sync with guardrails config
        set((state) => ({
          guardrailsConfig: { ...state.guardrailsConfig, enabled: guardrails },
        }));
      },
      setApiKey: (provider, key) => {
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        }));
        storeApiKey(provider, key).catch((err) => {
          console.warn("[settings] Failed to store key in keychain:", err);
        });
      },
      setLocalLLM: (updates) =>
        set((state) => ({
          localLLM: { ...state.localLLM, ...updates },
        })),
      setDefaultModel: (defaultModel) => set({ defaultModel }),
      setAgentDebugLogging: (agentDebugLogging) => {
        set({ agentDebugLogging });
        setLoggingEnabled(agentDebugLogging);
      },

      // Model discovery actions
      setAvailableModels: (availableModels) => set({ availableModels }),
      setSelectedModels: (selectedModels) => set({ selectedModels }),
      addSelectedModels: (models) =>
        set((state) => {
          const existingIds = new Set(state.selectedModels.map((m) => m.id));
          const newModels = models.filter((m) => !existingIds.has(m.id));
          return { selectedModels: [...state.selectedModels, ...newModels] };
        }),
      removeSelectedModels: (modelIds) =>
        set((state) => {
          const removeSet = new Set(modelIds);
          const remaining = state.selectedModels.filter((m) => !removeSet.has(m.id));
          // If the default model is being removed, reset to first remaining or seed default
          const defaultModel =
            removeSet.has(state.defaultModel) ? (remaining[0]?.id ?? DEFAULT_MODEL_ID) : state.defaultModel;
          return { selectedModels: remaining, defaultModel };
        }),
      fetchModels: async () => {
        set({ modelFetchStatus: "fetching", modelFetchError: null });
        try {
          const results = await fetchAllProviderModels(get().apiKeys);
          const allModels: ProviderModel[] = [];
          const errors: string[] = [];
          for (const r of results) {
            allModels.push(...r.models);
            if (r.error) errors.push(`${r.provider}: ${r.error}`);
          }
          set({
            availableModels: allModels,
            modelFetchStatus: errors.length > 0 && allModels.length === 0 ? "error" : "done",
            modelFetchError: errors.length > 0 ? errors.join("; ") : null,
          });
        } catch (e) {
          set({ modelFetchStatus: "error", modelFetchError: String(e) });
        }
      },

      // Guardrails config actions
      setGuardrailsConfig: (config) =>
        set((state) => ({
          guardrailsConfig: { ...state.guardrailsConfig, ...config },
          // Keep legacy fields in sync
          guardrails: config.enabled ?? state.guardrailsConfig.enabled,
          sandboxed: config.sandbox?.enabled ?? state.guardrailsConfig.sandbox.enabled,
        })),

      resetGuardrailsToDefaults: () =>
        set({
          guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
          guardrails: DEFAULT_GUARDRAILS_CONFIG.enabled,
          sandboxed: DEFAULT_GUARDRAILS_CONFIG.sandbox.enabled,
          yolo: false,
        }),

      applyGuardrailsPreset: (preset) => {
        const presetConfig = getPresetConfig(preset);
        set({
          guardrailsConfig: presetConfig,
          guardrails: presetConfig.enabled,
          sandboxed: presetConfig.sandbox.enabled,
          yolo: preset === "yolo",
          userMode: preset === "normal" ? "normal" : "advanced",
        });
      },

      importGuardrailsConfig: (json) => {
        try {
          const config = JSON.parse(json) as GuardrailsConfig;
          // Basic validation
          if (typeof config.enabled !== "boolean") return false;
          if (!config.categoryConfirmation) return false;

          set({
            guardrailsConfig: { ...DEFAULT_GUARDRAILS_CONFIG, ...config },
            guardrails: config.enabled,
            sandboxed: config.sandbox?.enabled ?? true,
            yolo: !config.enabled,
          });
          return true;
        } catch {
          return false;
        }
      },

      exportGuardrailsConfig: () => {
        return JSON.stringify(get().guardrailsConfig, null, 2);
      },
    }),
    {
      name: "sapio-settings",
      partialize: (state) => ({
        theme: state.theme,
        hue: state.hue,
        workingDirectory: state.workingDirectory,
        settingsDirectory: state.settingsDirectory,
        userMode: state.userMode,
        // In Tauri mode, apiKeys are stored in the OS keychain — not localStorage
        ...(isTauri() ? {} : { apiKeys: state.apiKeys }),
        localLLM: state.localLLM,
        defaultModel: state.defaultModel,
        availableModels: state.availableModels,
        selectedModels: state.selectedModels,
        guardrailsConfig: state.guardrailsConfig,
        agentDebugLogging: state.agentDebugLogging,
      }),
      onRehydrateStorage: () => (state) => {
        // Sync the logging enabled state when the store is rehydrated from localStorage
        if (state) {
          setLoggingEnabled(state.agentDebugLogging);
        }
      },
    }
  )
);
