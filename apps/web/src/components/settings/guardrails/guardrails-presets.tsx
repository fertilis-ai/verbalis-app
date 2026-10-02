import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GuardrailsConfig } from "@/lib/guardrails/types";
import { PRESET_LABELS, type UserModePreset, detectPreset } from "@/lib/guardrails/presets";

interface GuardrailsPresetsProps {
  guardrailsConfig: GuardrailsConfig;
  setGuardrailsConfig: (config: Partial<GuardrailsConfig>) => void;
  applyGuardrailsPreset: (preset: UserModePreset) => void;
}

/** The master toggle with the current-preset badge, and the Quick Presets row. */
export function GuardrailsPresets({
  guardrailsConfig,
  setGuardrailsConfig,
  applyGuardrailsPreset,
}: GuardrailsPresetsProps) {
  const currentPreset = detectPreset(guardrailsConfig);

  return (
    <>
      {/* Master toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-border">
        <div>
          <label className="text-sm font-medium flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={guardrailsConfig.enabled}
              onChange={(e) => setGuardrailsConfig({ enabled: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            Enable Guardrails
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            {guardrailsConfig.enabled
              ? "Tool execution is protected by guardrails"
              : "Guardrails disabled - all tools execute without restrictions"}
          </p>
        </div>

        {/* Current preset indicator */}
        <div
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium",
            ({
              yolo: "bg-red-500/20 text-red-500",
              advanced: "bg-yellow-500/20 text-yellow-500",
              normal: "bg-green-500/20 text-green-500",
              custom: "bg-muted text-muted-foreground",
            } as const)[currentPreset]
          )}
        >
          {currentPreset === "custom" ? "Custom" : PRESET_LABELS[currentPreset as UserModePreset].label}
        </div>
      </div>

      {/* Presets */}
      <div>
        <label className="text-sm font-medium">Quick Presets</label>
        <div className="mt-2 flex gap-2">
          {(["normal", "advanced", "yolo"] as const).map((preset) => {
            const presetInfo = PRESET_LABELS[preset];
            return (
              <Button
                key={preset}
                variant={currentPreset === preset ? "secondary" : "outline"}
                size="sm"
                onClick={() => applyGuardrailsPreset(preset)}
                className={cn(
                  "flex-1",
                  preset === "yolo" && "border-red-500/30 hover:border-red-500/50"
                )}
              >
                <span className={presetInfo.color}>{presetInfo.label}</span>
              </Button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {currentPreset !== "custom" && PRESET_LABELS[currentPreset as UserModePreset]?.description}
        </p>
      </div>
    </>
  );
}
