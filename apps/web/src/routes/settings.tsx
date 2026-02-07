import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";
import { SettingsSidebar, type SettingsSection } from "@/components/settings/settings-sidebar";
import { SettingsView } from "@/components/settings/settings-view";
import { useSettingsStore } from "@/stores/settings-store";
import { isTauri } from "@/lib/storage";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [selectedSection, setSelectedSection] = React.useState<SettingsSection>("appearance");
  const { homeDir, setHomeDir, settingsDirectory, setSettingsDirectory, workingDirectory, setWorkingDirectory } = useSettingsStore();

  React.useEffect(() => {
    if (homeDir) return; // already resolved

    const resolve = async () => {
      let resolved = "";
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        try {
          resolved = await invoke<string>("get_home_dir");
        } catch {
          resolved = "/Users";
        }
      } else {
        resolved = "/Users";
      }
      setHomeDir(resolved);
      if (!settingsDirectory || settingsDirectory === "~/.sapio-app") {
        setSettingsDirectory(`${resolved}/.sapio-app`);
      }
      if (!workingDirectory || workingDirectory === "~/Projects") {
        setWorkingDirectory(`${resolved}/Projects`);
      }
    };
    resolve();
  }, [homeDir, setHomeDir, settingsDirectory, setSettingsDirectory, workingDirectory, setWorkingDirectory]);

  return (
    <AppLayout
      section="settings"
      leftPane={
        <SettingsSidebar
          selectedSection={selectedSection}
          onSelectSection={setSelectedSection}
        />
      }
    >
      <SettingsView
        selectedSection={selectedSection}
        onSelectSection={setSelectedSection}
      />
    </AppLayout>
  );
}
