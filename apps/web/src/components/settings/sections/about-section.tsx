import { Info } from "lucide-react";
import { SettingsSectionLayout } from "../settings-section-layout";

export function AboutSection() {
  return (
    <SettingsSectionLayout id="about" icon={Info} title="About" last>
      <div className="rounded-lg border border-border p-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Version</span>
          <span className="text-sm font-medium">0.1.0</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Build</span>
          <span className="text-sm font-medium">Development</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Runtime</span>
          <span className="text-sm font-medium">Tauri 2.9</span>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Verbalis is a local-first AI agent for non-technical users. All data is stored on your device.
      </p>
    </SettingsSectionLayout>
  );
}
