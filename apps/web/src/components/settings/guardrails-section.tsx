import * as React from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
  RotateCcw,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settings-store";
import type { GuardrailsConfig, CategoryConfirmationMatrix } from "@/lib/guardrails/types";
import type { ToolCategory } from "@/lib/tools/categories";
import { CATEGORY_CONFIG, RISK_LEVEL_CONFIG } from "@/lib/tools/categories";
import { PRESET_LABELS, type UserModePreset, detectPreset } from "@/lib/guardrails/presets";

// ============================================================================
// Types
// ============================================================================

interface CategorySectionProps {
  category: ToolCategory;
  config: CategoryConfirmationMatrix;
  onChange: (config: CategoryConfirmationMatrix) => void;
  defaultExpanded?: boolean;
}

interface RestrictionsListProps {
  title: string;
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}

// ============================================================================
// Sub-Components
// ============================================================================

function CategorySection({
  category,
  config,
  onChange,
  defaultExpanded = false,
}: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const categoryInfo = CATEGORY_CONFIG[category];

  const handleToggle = (level: keyof CategoryConfirmationMatrix) => {
    onChange({ ...config, [level]: !config[level] });
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium text-sm">{categoryInfo.label}</span>
        <span className="text-xs text-muted-foreground">
          ({categoryInfo.description})
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {(["low", "medium", "high", "critical"] as const).map((level) => {
            const levelConfig = RISK_LEVEL_CONFIG[level];
            return (
              <label
                key={level}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={config[level]}
                  onChange={() => handleToggle(level)}
                  className="h-4 w-4 rounded border-input"
                />
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm", levelConfig.color)}>
                    {levelConfig.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    (require confirmation)
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RestrictionsList({
  title,
  items,
  placeholder,
  onChange,
}: RestrictionsListProps) {
  const [newItem, setNewItem] = React.useState("");
  const [isExpanded, setIsExpanded] = React.useState(false);

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setNewItem("");
    }
  };

  const handleRemove = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    onChange(newItems);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs text-muted-foreground">
          ({items.length} items)
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Existing items */}
          {items.length > 0 && (
            <div className="space-y-1">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1"
                >
                  <code className="flex-1 text-xs">{item}</code>
                  <button
                    onClick={() => handleRemove(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new item */}
          <div className="flex gap-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder={placeholder}
              className="text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <Button size="sm" variant="outline" onClick={handleAdd}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

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
  const currentPreset = detectPreset(guardrailsConfig);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleExport = () => {
    const json = exportGuardrailsConfig();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sapio-guardrails.json";
    a.click();
    URL.revokeObjectURL(url);
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
    <section className="space-y-6">
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
        <Shield className="h-4.5 w-4.5 text-muted-foreground" />
        Guardrails
      </h2>

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
            currentPreset === "yolo"
              ? "bg-red-500/20 text-red-500"
              : currentPreset === "advanced"
              ? "bg-yellow-500/20 text-yellow-500"
              : currentPreset === "normal"
              ? "bg-green-500/20 text-green-500"
              : "bg-muted text-muted-foreground"
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
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Rate Limits</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">
                Tools/min
              </label>
              <Input
                type="number"
                value={guardrailsConfig.rateLimits.toolCallsPerMinute}
                onChange={(e) =>
                  setGuardrailsConfig({
                    rateLimits: {
                      ...guardrailsConfig.rateLimits,
                      toolCallsPerMinute: parseInt(e.target.value) || 30,
                    },
                  })
                }
                min={1}
                max={1000}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Tools/hour
              </label>
              <Input
                type="number"
                value={guardrailsConfig.rateLimits.toolCallsPerHour}
                onChange={(e) =>
                  setGuardrailsConfig({
                    rateLimits: {
                      ...guardrailsConfig.rateLimits,
                      toolCallsPerHour: parseInt(e.target.value) || 500,
                    },
                  })
                }
                min={1}
                max={10000}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                API calls/min
              </label>
              <Input
                type="number"
                value={guardrailsConfig.rateLimits.apiCallsPerMinute}
                onChange={(e) =>
                  setGuardrailsConfig({
                    rateLimits: {
                      ...guardrailsConfig.rateLimits,
                      apiCallsPerMinute: parseInt(e.target.value) || 10,
                    },
                  })
                }
                min={1}
                max={100}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Shell/min
              </label>
              <Input
                type="number"
                value={guardrailsConfig.rateLimits.shellCommandsPerMinute}
                onChange={(e) =>
                  setGuardrailsConfig({
                    rateLimits: {
                      ...guardrailsConfig.rateLimits,
                      shellCommandsPerMinute: parseInt(e.target.value) || 5,
                    },
                  })
                }
                min={1}
                max={100}
                className="mt-1"
              />
            </div>
          </div>
        </div>
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
    </section>
  );
}
