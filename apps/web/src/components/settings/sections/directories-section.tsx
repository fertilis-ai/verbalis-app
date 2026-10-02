import { FolderOpen, FolderCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settings-store";
import { useShallow } from "zustand/react/shallow";
import { isTauri } from "@/lib/storage";
import { SettingsSectionLayout } from "../settings-section-layout";

export function DirectoriesSection() {
  const {
    homeDir,
    workingDirectory,
    setWorkingDirectory,
    settingsDirectory,
    setSettingsDirectory,
  } = useSettingsStore(
    useShallow((s) => ({
      homeDir: s.homeDir,
      workingDirectory: s.workingDirectory,
      setWorkingDirectory: s.setWorkingDirectory,
      settingsDirectory: s.settingsDirectory,
      setSettingsDirectory: s.setSettingsDirectory,
    }))
  );

  const handlePickDirectory = async (setter: (dir: string) => void, current: string) => {
    if (!isTauri()) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, defaultPath: current || undefined });
    if (selected) setter(selected as string);
  };

  return (
    <SettingsSectionLayout id="directories" icon={FolderCog} title="Directories" className="space-y-4">
      <div>
        <label className="text-sm font-medium">Working Directory</label>
        <div className="mt-1 flex gap-2">
          <Input
            value={workingDirectory}
            onChange={(e) => setWorkingDirectory(e.target.value)}
            placeholder={homeDir ? `${homeDir}/Projects` : "~/Projects"}
          />
          <Button
            variant="outline"
            size="icon"
            disabled={!isTauri()}
            onClick={() => handlePickDirectory(setWorkingDirectory, workingDirectory)}
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The directory shown in the Files browser
        </p>
      </div>
      <div>
        <label className="text-sm font-medium">Settings Directory</label>
        <div className="mt-1 flex gap-2">
          <Input
            value={settingsDirectory}
            onChange={(e) => setSettingsDirectory(e.target.value)}
            placeholder={homeDir ? `${homeDir}/.verbalis-app` : "~/.verbalis-app"}
          />
          <Button
            variant="outline"
            size="icon"
            disabled={!isTauri()}
            onClick={() => handlePickDirectory(setSettingsDirectory, settingsDirectory)}
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Where Verbalis stores its configuration and data
        </p>
      </div>
    </SettingsSectionLayout>
  );
}
