import { Bug } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { isTauri } from "@/lib/storage";
import { SettingsSectionLayout } from "../settings-section-layout";

export function DebugSection() {
  const {
    homeDir,
    agentDebugLogging,
    setAgentDebugLogging,
  } = useSettingsStore();

  // Only show in Tauri (desktop) environment
  if (!isTauri()) {
    return null;
  }

  return (
    <SettingsSectionLayout id="debug" icon={Bug} title="Debug" className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agentDebugLogging}
          onChange={(e) => setAgentDebugLogging(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <div className="flex-1">
          <span className="text-sm">Debug Logging</span>
          <p className="text-xs text-muted-foreground">
            Write detailed agent execution logs to {homeDir || "~"}/.verbalis/logs/
          </p>
        </div>
      </label>
    </SettingsSectionLayout>
  );
}
