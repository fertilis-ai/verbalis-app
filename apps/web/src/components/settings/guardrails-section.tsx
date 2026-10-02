import * as React from "react";
import { Shield, Download, Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settings-store";
import type { CategoryConfirmationMatrix } from "@/lib/guardrails/types";
import type { ToolCategory } from "@/lib/tools/categories";
import { downloadFile } from "@/lib/download";
import { CategorySection } from "./guardrails/category-section";
import { RestrictionsList } from "./guardrails/restrictions-list";
import { GuardrailsPresets } from "./guardrails/guardrails-presets";
import { RateLimitsEditor } from "./guardrails/rate-limits-editor";
import { SettingsSectionLayout } from "./settings-section-layout";

export function GuardrailsSection() {
  const {
    guardrailsConfig,
    setGuardrailsConfig,
    resetGuardrailsToDefaults,
    applyGuardrailsPreset,
    importGuardrailsConfig,
    exportGuardrailsConfig,
  } = useSettingsStore();

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleExport = () => {
    downloadFile(exportGuardrailsConfig(), "verbalis-guardrails.json", "application/json");
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const success = importGuardrailsConfig(text);
      if (!success) {
        alert("Invalid configuration file");
      }
    } catch {
      alert("Failed to read configuration file");
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCategoryChange = (
    category: ToolCategory,
    config: CategoryConfirmationMatrix
  ) => {
    setGuardrailsConfig({
      categoryConfirmation: {
        ...guardrailsConfig.categoryConfirmation,
        [category]: config,
      },
    });
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <SettingsSectionLayout id="guardrails" icon={Shield} title="Guardrails" className="space-y-6">

      <GuardrailsPresets
        guardrailsConfig={guardrailsConfig}
        setGuardrailsConfig={setGuardrailsConfig}
        applyGuardrailsPreset={applyGuardrailsPreset}
      />

      {/* Category confirmations */}
      {guardrailsConfig.enabled && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Confirmation Requirements</h3>
          <p className="text-xs text-muted-foreground">
            Configure which risk levels require user confirmation for each tool category.
          </p>

          <div className="space-y-2">
            {(["file_system", "web", "system", "integration", "memory", "custom"] as ToolCategory[]).map(
              (category) => (
                <CategorySection
                  key={category}
                  category={category}
                  config={guardrailsConfig.categoryConfirmation[category]}
                  onChange={(config) => handleCategoryChange(category, config)}
                  defaultExpanded={category === "file_system"}
                />
              )
            )}
          </div>
        </div>
      )}

      {/* Path restrictions */}
      {guardrailsConfig.enabled && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Path Restrictions</h3>

          <RestrictionsList
            title="Allowed Paths"
            items={guardrailsConfig.paths.allowlist}
            placeholder="~/Projects/*, ~/Documents/*"
            onChange={(allowlist) =>
              setGuardrailsConfig({
                paths: { ...guardrailsConfig.paths, allowlist },
              })
            }
          />

          <RestrictionsList
            title="Blocked Paths"
            items={guardrailsConfig.paths.blocklist}
            placeholder="~/.ssh/*, ~/.aws/*"
            onChange={(blocklist) =>
              setGuardrailsConfig({
                paths: { ...guardrailsConfig.paths, blocklist },
              })
            }
          />
        </div>
      )}

      {/* Domain restrictions */}
      {guardrailsConfig.enabled && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Domain Restrictions</h3>

          <RestrictionsList
            title="Blocked Domains"
            items={guardrailsConfig.domains.blocklist}
            placeholder="*.internal.*, localhost:*"
            onChange={(blocklist) =>
              setGuardrailsConfig({
                domains: { ...guardrailsConfig.domains, blocklist },
              })
            }
          />
        </div>
      )}

      {/* Shell command restrictions */}
      {guardrailsConfig.enabled && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Shell Command Restrictions</h3>

          <RestrictionsList
            title="Allowed Commands"
            items={guardrailsConfig.shellCommands.allowlist}
            placeholder="git *, npm *, bun *"
            onChange={(allowlist) =>
              setGuardrailsConfig({
                shellCommands: { ...guardrailsConfig.shellCommands, allowlist },
              })
            }
          />

          <RestrictionsList
            title="Blocked Commands"
            items={guardrailsConfig.shellCommands.blocklist}
            placeholder="rm -rf *, sudo *"
            onChange={(blocklist) =>
              setGuardrailsConfig({
                shellCommands: { ...guardrailsConfig.shellCommands, blocklist },
              })
            }
          />
        </div>
      )}

      {/* Rate limits */}
      {guardrailsConfig.enabled && (
        <RateLimitsEditor
          rateLimits={guardrailsConfig.rateLimits}
          onChange={(rateLimits) => setGuardrailsConfig({ rateLimits })}
        />
      )}

      {/* Import/Export/Reset */}
      <div className="flex items-center gap-2 pt-4 border-t">
        <Button variant="outline" size="sm" onClick={handleImport}>
          <Upload className="h-4 w-4 mr-2" />
          Import
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button variant="outline" size="sm" onClick={resetGuardrailsToDefaults}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </SettingsSectionLayout>
  );
}
