import { Bot } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useShallow } from "zustand/react/shallow";
import { SettingsSectionLayout } from "../settings-section-layout";

export function AgentSection() {
  const {
    allowSelfEnhancement,
    setAllowSelfEnhancement,
  } = useSettingsStore(
    useShallow((s) => ({
      allowSelfEnhancement: s.allowSelfEnhancement,
      setAllowSelfEnhancement: s.setAllowSelfEnhancement,
    }))
  );

  return (
    <SettingsSectionLayout id="agent" icon={Bot} title="Agent" className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={allowSelfEnhancement}
          onChange={(e) => setAllowSelfEnhancement(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <div className="flex-1">
          <span className="text-sm">Allow Self-Enhancement</span>
          <p className="text-xs text-muted-foreground">
            Let the agent create and edit its own Toolbox files (prompts, memories,
            agents, skills, workflows). Writes and deletes still require confirmation.
          </p>
        </div>
      </label>
    </SettingsSectionLayout>
  );
}
