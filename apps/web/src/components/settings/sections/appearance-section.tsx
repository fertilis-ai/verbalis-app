import { Moon, Sun, Monitor, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settings-store";
import { useTheme } from "@/components/theme-provider";
import { HUE_PRESETS } from "@/lib/hue-presets";
import { SettingsSectionLayout } from "../settings-section-layout";

export function AppearanceSection() {
  const { setTheme, theme, resolvedTheme } = useTheme();
  const { hue, setHue } = useSettingsStore();
  const mode = resolvedTheme === "dark" ? "dark" : "light";
  const selectedPreset = HUE_PRESETS.find((p) => p.id === hue);

  return (
    <SettingsSectionLayout id="appearance" icon={Palette} title="Appearance" className="space-y-6">
      <div>
        <label className="text-sm font-medium">Theme</label>
        <div className="mt-2 flex gap-2">
          <Button
            variant={theme === "light" ? "secondary" : "outline"}
            onClick={() => setTheme("light")}
            className="gap-2"
          >
            <Sun className="h-4 w-4" />
            Light
          </Button>
          <Button
            variant={theme === "dark" ? "secondary" : "outline"}
            onClick={() => setTheme("dark")}
            className="gap-2"
          >
            <Moon className="h-4 w-4" />
            Dark
          </Button>
          <Button
            variant={theme === "system" ? "secondary" : "outline"}
            onClick={() => setTheme("system")}
            className="gap-2"
          >
            <Monitor className="h-4 w-4" />
            System
          </Button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Hue</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {HUE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setHue(preset.id)}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                hue === preset.id ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""
              }`}
              title={preset.label}
            >
              {preset.id === "neutral" ? (
                <svg width="24" height="24" viewBox="0 0 24 24" className="rounded-full">
                  <circle cx="12" cy="12" r="12" fill={mode === "dark" ? "#525252" : "#d4d4d4"} />
                  <line x1="4" y1="20" x2="20" y2="4" stroke={mode === "dark" ? "#a3a3a3" : "#737373"} strokeWidth="2" />
                </svg>
              ) : (
                <span
                  className="block h-6 w-6 rounded-full"
                  style={{ backgroundColor: preset.swatch[mode] }}
                />
              )}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {selectedPreset?.label ?? "Neutral"}
        </p>
      </div>
    </SettingsSectionLayout>
  );
}
