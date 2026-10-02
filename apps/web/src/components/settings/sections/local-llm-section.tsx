import { Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settings-store";
import { useShallow } from "zustand/react/shallow";
import { SettingsSectionLayout } from "../settings-section-layout";

export function LocalLlmSection() {
  const {
    localLLM,
    setLocalLLM,
  } = useSettingsStore(
    useShallow((s) => ({
      localLLM: s.localLLM,
      setLocalLLM: s.setLocalLLM,
    }))
  );
  const baseDefaults = {
    lmstudio: "http://localhost:1234/v1",
    ollama: "http://localhost:11434/v1",
  } as const;

  const handleProviderChange = (provider: typeof localLLM.provider) => {
    const shouldSwap =
      localLLM.baseUrl.trim().length === 0 ||
      localLLM.baseUrl.trim() === baseDefaults[localLLM.provider];
    setLocalLLM({
      provider,
      baseUrl: shouldSwap ? baseDefaults[provider] : localLLM.baseUrl,
    });
  };

  return (
    <SettingsSectionLayout id="local-llm" icon={Server} title="Local LLM" className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={localLLM.enabled}
          onChange={(e) => setLocalLLM({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-input"
        />
        <div>
          <span className="text-sm">Enable Local Provider</span>
          <p className="text-xs text-muted-foreground">
            Use LM Studio or Ollama for on-device inference
          </p>
        </div>
      </label>

      <div>
        <label className="text-sm font-medium">Provider</label>
        <div className="mt-2 flex gap-2">
          <Button
            variant={localLLM.provider === "lmstudio" ? "secondary" : "outline"}
            onClick={() => handleProviderChange("lmstudio")}
          >
            LM Studio
          </Button>
          <Button
            variant={localLLM.provider === "ollama" ? "secondary" : "outline"}
            onClick={() => handleProviderChange("ollama")}
          >
            Ollama
          </Button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Base URL</label>
        <div className="mt-1">
          <Input
            value={localLLM.baseUrl}
            onChange={(e) => setLocalLLM({ baseUrl: e.target.value })}
            placeholder={baseDefaults[localLLM.provider]}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          LM Studio default: {baseDefaults.lmstudio} · Ollama default: {baseDefaults.ollama}
        </p>
      </div>

      <div>
        <label className="text-sm font-medium">Model</label>
        <div className="mt-1">
          <Input
            value={localLLM.model}
            onChange={(e) => setLocalLLM({ model: e.target.value })}
            placeholder={localLLM.provider === "lmstudio" ? "llama-3.1-8b-instruct" : "llama3.1"}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional. Leave blank to use the provider default.
        </p>
      </div>
    </SettingsSectionLayout>
  );
}
