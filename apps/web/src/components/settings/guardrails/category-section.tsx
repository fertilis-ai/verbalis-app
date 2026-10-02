import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategoryConfirmationMatrix } from "@/lib/guardrails/types";
import type { ToolCategory } from "@/lib/tools/categories";
import { CATEGORY_CONFIG, RISK_LEVEL_CONFIG } from "@/lib/tools/categories";

interface CategorySectionProps {
  category: ToolCategory;
  config: CategoryConfirmationMatrix;
  onChange: (config: CategoryConfirmationMatrix) => void;
  defaultExpanded?: boolean;
}

/** One tool category's risk-level confirmation checkboxes, collapsible. */
export function CategorySection({
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
