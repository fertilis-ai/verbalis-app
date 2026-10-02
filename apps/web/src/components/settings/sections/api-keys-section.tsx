import * as React from "react";
import { Eye, EyeOff, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settings-store";
import { useShallow } from "zustand/react/shallow";
import { getProviderLabel } from "@/lib/models";
import { isTauri } from "@/lib/storage";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsSectionLayout } from "../settings-section-layout";

export function ApiKeysSection() {
  const {
    apiKeys,
    setApiKey,
  } = useSettingsStore(
    useShallow((s) => ({
      apiKeys: s.apiKeys,
      setApiKey: s.setApiKey,
    }))
  );
  const [showKeys, setShowKeys] = React.useState<Record<string, boolean>>({});

  const providers = [
    { id: "anthropic" as const, placeholder: "sk-ant-..." },
    { id: "openai" as const, placeholder: "sk-..." },
    { id: "google" as const, placeholder: "AIza..." },
    { id: "openrouter" as const, placeholder: "sk-or-...", url: "https://openrouter.ai/keys" },
  ];

  return (
    <SettingsSectionLayout id="api-keys" icon={Key} title="API Keys" className="space-y-4">
      {providers.map((provider) => (
        <div key={provider.id}>
          <label className="text-sm font-medium">
            {getProviderLabel(provider.id)}
            {provider.url && (
              <button
                type="button"
                className="ml-1 text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                onClick={() => {
                  if (isTauri()) {
                    openUrl(provider.url!);
                  } else {
                    window.open(provider.url, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                (Get key)
              </button>
            )}
          </label>
          <div className="mt-1 flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKeys[provider.id] ? "text" : "password"}
                value={apiKeys[provider.id]}
                onChange={(e) => setApiKey(provider.id, e.target.value)}
                placeholder={provider.placeholder}
                className="pr-10"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute right-1 top-1"
                onClick={() =>
                  setShowKeys((s) => ({ ...s, [provider.id]: !s[provider.id] }))
                }
              >
                {showKeys[provider.id] ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        API keys are stored locally in your browser. In the desktop app, they are stored securely using the system keychain.
      </p>
    </SettingsSectionLayout>
  );
}
